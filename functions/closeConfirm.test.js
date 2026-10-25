// Customer confirmation at closing: pure decision, then end to end through
// sendCloseCode and the checkLifecycle_* trigger.
const test = require('node:test');
const assert = require('node:assert');
const C = require('./closeConfirm');

const base = { coll: 'centerRequests', id: 'cr1' };
test('code: right code accepted once; wrong, expired, used and too many tries refused', () => {
  const now = 1000;
  const doc = { code: '0427', tries: 0, expiresAtMs: 5000, sentVia: 'sms' };
  assert.deepStrictEqual(C.decide({ ...base, after: { closeOtp: '0427' }, codeDoc: doc, now }), { record: { method: 'code', sentVia: 'sms' }, codeUpdate: { usedAt: now } });
  const wrong = C.decide({ ...base, after: { closeOtp: '1111' }, codeDoc: doc, now });
  assert.match(wrong.reason, /wrong/); assert.deepStrictEqual(wrong.codeUpdate, { tries: 1 });
  assert.match(C.decide({ ...base, after: { closeOtp: '0427' }, codeDoc: doc, now: 6000 }).reason, /expired/);
  assert.match(C.decide({ ...base, after: { closeOtp: '0427' }, codeDoc: { ...doc, usedAt: 1 }, now }).reason, /already used/);
  assert.match(C.decide({ ...base, after: { closeOtp: '0427' }, codeDoc: { ...doc, tries: 5 }, now }).reason, /Too many/);
  assert.match(C.decide({ ...base, after: { closeOtp: '0427' }, codeDoc: null, now }).reason, /No completion code/);
});
test('signature: must be in this job\'s folder, named, and uploaded', () => {
  const sig = (path, name = 'Asha') => ({ customerSignature: { path, name } });
  assert.deepStrictEqual(C.decide({ ...base, after: sig('closeSignatures/centerRequests/cr1/s.png'), signatureOk: true }).record, { method: 'signature', signedName: 'Asha', path: 'closeSignatures/centerRequests/cr1/s.png' });
  assert.match(C.decide({ ...base, after: sig('closeSignatures/centerRequests/cr2/s.png'), signatureOk: true }).reason, /not attached/);
  assert.match(C.decide({ ...base, after: sig('closeSignatures/centerRequests/cr1/../x.png'), signatureOk: true }).reason, /not attached/);
  assert.match(C.decide({ ...base, after: sig('closeSignatures/centerRequests/cr1/s.png', ' '), signatureOk: true }).reason, /name/);
  assert.match(C.decide({ ...base, after: sig('closeSignatures/centerRequests/cr1/s.png'), signatureOk: false }).reason, /did not upload/);
});
test('nothing offered: fine unless Head Office requires it', () => {
  assert.deepStrictEqual(C.decide({ ...base, after: {}, required: false }), { record: null });
  assert.match(C.decide({ ...base, after: {}, required: true }).reason, /customer's confirmation/);
});
test('codes are 4 digits; only the job\'s technician or center may close', () => {
  for (let i = 0; i < 50; i++) assert.match(C.newCode(), /^\d{4}$/);
  assert.ok(C.canClose({ technicianUid: 't1' }, 't1'));
  assert.ok(C.canClose({ serviceCenterUid: 'sc1' }, 'sc1'));
  assert.ok(!C.canClose({ technicianUid: 't1', serviceCenterUid: 'sc1' }, 't2'));
});

// ---- end to end with the in-memory Firestore ----
const Module = require('module');
const fake = require('./testsupport/fakefs');
const orig = Module._load;
const wrap = (opts, handler) => ({ opts, handler });
Module._load = function (req, ...a) {
  if (req === 'firebase-admin/app') return { initializeApp() {} };
  if (req === 'firebase-admin/firestore') return { getFirestore: () => fake.db, FieldValue: fake.FieldValue, Timestamp: fake.Timestamp };
  if (req === 'firebase-functions/v2/firestore') return new Proxy({}, { get: () => wrap });
  if (req === 'firebase-functions/v2/scheduler') return { onSchedule: wrap };
  if (req === 'firebase-functions/v2/https') return { onCall: wrap, HttpsError: class HttpsError extends Error { constructor(code, msg) { super(msg); this.code = code; } } };
  return orig.call(this, req, ...a);
};
const F = require('./index.js');
Module._load = orig;
const { store, DocRef, Snap } = fake;
const get = (p) => store.get(p), set = (p, d) => store.set(p, d);
const ref = (p) => { const [c, id] = p.split('/'); return new DocRef(c, id); };
async function close(p, change, authId) {
  const before = new Snap(ref(p));
  set(p, { ...get(p), ...change });
  await F.checkLifecycle_centerRequests.handler({ data: { before, after: new Snap(ref(p)) }, params: { docId: p.split('/')[1] }, authId });
}
const CLOSING = { status: 'completed', closureCode: 'repaired', actionTaken: 'Replaced thermostat', partsUsedNotes: 'Thermostat', closedByUid: 't1' };

test('end to end: send a code, close with it; wrong code reverts; required setting enforced', async () => {
  set('users/t1', { role: 'technician' }); set('users/t9', { role: 'technician' });
  set('settings/closeConfirmation', { required: true });
  set('centerRequests/cA', { requestId: 'PE-CR-A', serviceCenterUid: 'sc1', technicianUid: 't1', status: 'in_progress', customerPhone: '9000000001' });
  await assert.rejects(F.sendCloseCode.handler({ auth: { uid: 't9' }, data: { coll: 'centerRequests', id: 'cA' } }), /Only this job/);
  const r = await F.sendCloseCode.handler({ auth: { uid: 't1' }, data: { coll: 'centerRequests', id: 'cA' } });
  assert.strictEqual(r.sentVia, 'portal', 'messaging is off, so the code is only in the customer portal');
  const code = get('closeCodes/centerRequests__cA');
  assert.match(code.code, /^\d{4}$/); assert.strictEqual(code.customerPhone, '9000000001');
  await assert.rejects(F.sendCloseCode.handler({ auth: { uid: 't1' }, data: { coll: 'centerRequests', id: 'cA' } }), /just sent/);

  await close('centerRequests/cA', CLOSING, 't1');
  assert.strictEqual(get('centerRequests/cA').status, 'in_progress');
  assert.match(get('centerRequests/cA').lifecycleRejected.reason, /customer's confirmation/);

  const wrong = code.code === '0000' ? '1111' : '0000';
  await close('centerRequests/cA', { ...CLOSING, closeOtp: wrong }, 't1');
  assert.strictEqual(get('centerRequests/cA').status, 'in_progress');
  assert.strictEqual(get('centerRequests/cA').closeOtp, undefined, 'a wrong code is not left on the ticket');
  assert.strictEqual(get('closeCodes/centerRequests__cA').tries, 1);

  await close('centerRequests/cA', { ...CLOSING, closeOtp: code.code }, 't1');
  const t = get('centerRequests/cA');
  assert.strictEqual(t.status, 'completed');
  assert.strictEqual(t.customerConfirmation.method, 'code');
  assert.strictEqual(t.closeOtp, undefined);
  assert.ok(get('closeCodes/centerRequests__cA').usedAt);
});

test('end to end: signature closes when the file exists', async () => {
  C.deps = { signatureExists: async (p) => p === 'closeSignatures/centerRequests/cB/1.png' };
  set('centerRequests/cB', { requestId: 'PE-CR-B', serviceCenterUid: 'sc1', technicianUid: 't1', status: 'in_progress', customerPhone: '9000000001' });
  await close('centerRequests/cB', { ...CLOSING, customerSignature: { path: 'closeSignatures/centerRequests/cB/2.png', name: 'Asha' } }, 't1');
  assert.strictEqual(get('centerRequests/cB').status, 'in_progress');
  await close('centerRequests/cB', { ...CLOSING, customerSignature: { path: 'closeSignatures/centerRequests/cB/1.png', name: 'Asha' } }, 't1');
  assert.strictEqual(get('centerRequests/cB').status, 'completed');
  assert.strictEqual(get('centerRequests/cB').customerConfirmation.signedName, 'Asha');
  C.deps = null;
});

test('issueNumber: continues the shared monthly counter; role decides who may draw', async () => {
  const N = require('./numbers');
  set('users/scX', { role: 'servicecenter' }); set('users/dX', { role: 'dealer' });
  set('counters/' + N.counterId('claim', Date.now()), { value: 41 });
  const r = await F.issueNumber.handler({ auth: { uid: 'scX' }, data: { kind: 'claim' } });
  assert.match(r.number, /^PE-CL-\d{8}-0042-ServiceCenter$/);
  assert.strictEqual(get('counters/' + N.counterId('claim', Date.now())).value, 42);
  await assert.rejects(F.issueNumber.handler({ auth: { uid: 'dX' }, data: { kind: 'claim' } }), /cannot/);
  await assert.rejects(F.issueNumber.handler({ auth: { uid: 'scX' }, data: { kind: 'servicejob' } }), /cannot/);
  await assert.rejects(F.issueNumber.handler({ auth: null, data: { kind: 'claim' } }), /Sign in/);
});
