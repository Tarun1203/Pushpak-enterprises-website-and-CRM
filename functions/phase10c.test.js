// Phase 10 items 12-24: audit trail, alerts, error handling / network recovery,
// documentation and the go-live gate.
const Module = require('module');
const fake = require('./testsupport/fakefs');
const orig = Module._load;
const wrap = (opts, handler) => ({ opts, handler });
Module._load = function (req, ...a) {
  if (req === 'firebase-admin/app') return { initializeApp() {} };
  if (req === 'firebase-admin/auth') return { getAuth: () => ({ updateUser: async () => {}, revokeRefreshTokens: async () => {} }) };
  if (req === 'firebase-admin/firestore') return { getFirestore: () => fake.db, FieldValue: fake.FieldValue, Timestamp: fake.Timestamp };
  if (req === 'firebase-functions/v2/firestore') return new Proxy({}, { get: () => wrap });
  if (req === 'firebase-functions/v2/scheduler') return { onSchedule: wrap };
  if (req === 'firebase-functions/v2/https') return { onCall: wrap, HttpsError: class HttpsError extends Error { constructor(code, msg) { super(msg); this.code = code; } } };
  return orig.call(this, req, ...a);
};
const F = require('./index.js');
const Audit = require('./audit');
const Notify = require('./notify');
const Res = require('../crm/resilience.js');
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { store, DocRef, Snap } = fake;
const ref = (p) => { const [c, id] = p.split('/'); return new DocRef(c, id); };

// ---- item 15: audit & accountability ----
test('P10.15 who created and who moved each business record is logged', () => {
  for (const c of ['serviceJobs', 'centerRequests', 'spareRequests', 'claims', 'rmaRequests', 'returns', 'brandReturns', 'dealerOrders', 'distributorOrders', 'invoices', 'tradePayments', 'stockReceipts', 'changeRequests']) {
    const made = Audit.buildAuditEntries(c, 'd1', null, { status: 'new' });
    assert.strictEqual(made.length, 1, c + ' creation'); assert.strictEqual(made[0].action, 'created'); assert.strictEqual(made[0].source, 'server');
    const moved = Audit.buildAuditEntries(c, 'd1', { status: 'new' }, { status: 'approved' });
    assert.strictEqual(moved.length, 1, c + ' move'); assert.strictEqual(moved[0].action, 'status_changed');
    assert.deepStrictEqual(moved[0].before, { status: 'new' }); assert.deepStrictEqual(moved[0].after, { status: 'approved' });
    assert.strictEqual(Audit.buildAuditEntries(c, 'd1', { status: 'new', note: 'a' }, { status: 'new', note: 'b' }).length, 0, c + ' noise ignored');
  }
  const closed = Audit.buildAuditEntries('serviceJobs', 'j1', { status: 'in_progress', technicianUid: 'a' }, { status: 'completed', technicianUid: 'b', jobId: 'PE-J-1' });
  assert.deepStrictEqual(closed.map((e) => e.action), ['status_changed', 'field_changed']);
  assert.match(closed[0].details, /PE-J-1.*"in_progress".*"completed"/);
  assert.strictEqual(Audit.buildAuditEntries('claims', 'c1', { status: 'submitted', approvedAmount: 0 }, { status: 'submitted', approvedAmount: 900 })[0].action, 'field_changed');
});

test('P10.15 every watched collection has a server trigger that records the signed-in actor', async () => {
  for (const c of Object.keys(Audit.WORKFLOW)) assert.ok(F['auditWf_' + c], 'trigger for ' + c);
  store.clear();
  store.set('users/u9', { email: 'admin@x.com' });
  store.set('claims/c1', { claimId: 'PE-CL-1', status: 'approved' });
  const before = { exists: true, data: () => ({ claimId: 'PE-CL-1', status: 'submitted' }) };
  await F.auditWf_claims.handler({ data: { before, after: new Snap(ref('claims/c1')) }, params: { docId: 'c1' }, authId: 'u9', authType: 'user' });
  const logs = [...store.entries()].filter(([p]) => p.startsWith('auditLogs/')).map(([, d]) => d);
  assert.strictEqual(logs.length, 1); assert.strictEqual(logs[0].performedByUid, 'u9'); assert.strictEqual(logs[0].performedBy, 'admin@x.com'); assert.strictEqual(logs[0].entityType, 'claim');
  store.clear();
  await F.auditWf_claims.handler({ data: { before, after: new Snap(ref('claims/c1')) }, params: { docId: 'c1' }, authType: 'system' });
  assert.strictEqual([...store.keys()].filter((p) => p.startsWith('auditLogs/')).length, 0, 'server-made changes are not attributed to a person');
});

// ---- item 16: operational alerts ----
test('P10.16 alerts: assignment, appointment, completion, spare decision, claim approval', () => {
  const job = { jobId: 'J1', customerName: 'Ravi', serviceCenterUid: 'sc', technicianUid: 't1', technicianName: 'Amit', product: 'Geyser', status: 'assigned' };
  const n1 = Notify.buildNotifications('centerRequests', 'j', { ...job, technicianUid: '' }, job, 'sc');
  assert.deepStrictEqual(n1.map((n) => [n.uid, n.title]), [['t1', 'New job assigned']]);
  assert.strictEqual(Notify.buildNotifications('centerRequests', 'j', { ...job, technicianUid: '' }, job, 'admin').length, 0, 'admin assignment is alerted by the admin page itself');
  const n2 = Notify.buildNotifications('serviceJobs', 'j', job, { ...job, scheduledDate: '2026-12-01', scheduledStartTime: '10:00' }, 't1');
  assert.deepStrictEqual(n2.map((n) => n.uid), ['sc'], 'the actor is not told about their own action');
  const n3 = Notify.buildNotifications('serviceJobs', 'j', job, { ...job, scheduledDate: '2026-12-01', scheduledStartTime: '10:00' }, 'sc');
  assert.deepStrictEqual(n3.map((n) => n.uid), ['t1']);
  const n4 = Notify.buildNotifications('serviceJobs', 'j', job, { ...job, status: 'completed' }, 't1');
  assert.deepStrictEqual(n4.map((n) => [n.uid, n.title]), [['sc', 'Job completed']]);
  const sp = { requestId: 'SP1', requestedByUid: 'u5', item: 'Element', quantity: 2 };
  for (const [st, title] of [['approved', 'Spare request approved'], ['rejected', 'Spare request rejected'], ['dispatched', 'Spare dispatched'], ['received', 'Spare received']]) {
    const n = Notify.buildNotifications('spareRequests', 's', { ...sp, status: 'pending' }, { ...sp, status: st }, 'wh');
    assert.deepStrictEqual(n.map((x) => [x.uid, x.title]), [['u5', title]]);
  }
  assert.strictEqual(Notify.buildNotifications('spareRequests', 's', { ...sp, status: 'approved' }, { ...sp, status: 'approved', note: 'x' }, 'wh').length, 0, 'no change, no alert');
  const cl = Notify.buildNotifications('claims', 'c', { status: 'submitted' }, { status: 'approved', claimantUid: 'sc', approvedAmount: 900, claimId: 'C1' }, 'admin');
  assert.deepStrictEqual(cl.map((x) => [x.uid, x.title]), [['sc', 'Claim approved']]);
  assert.ok(new Set(n3.concat(n2).map((n) => n.key)).size === 2, 'distinct keys');
});

test('P10.16 the alert trigger writes one notification with a fixed id (a retry does not duplicate)', async () => {
  store.clear();
  const job = { jobId: 'J1', serviceCenterUid: 'sc', technicianUid: 't1', status: 'assigned', customerName: 'Ravi' };
  store.set('centerRequests/j1', job);
  const ev = () => ({ data: { before: { exists: true, data: () => ({ ...job, technicianUid: '' }) }, after: new Snap(ref('centerRequests/j1')) }, params: { docId: 'j1' }, authId: 'sc', authType: 'user' });
  await F.notifyWf_centerRequests.handler(ev());
  await F.notifyWf_centerRequests.handler(ev());
  const ns = [...store.entries()].filter(([p]) => p.startsWith('notifications/'));
  assert.strictEqual(ns.length, 1); assert.strictEqual(ns[0][1].recipientValue, 't1'); assert.strictEqual(ns[0][1].read, false);
});

// ---- items 13 + 17: network failure and error handling ----
test('P10.13 temporary network errors are retried, real errors are not', async () => {
  let n = 0;
  assert.strictEqual(await Res.retry(async () => { if (++n < 3) { const e = new Error('x'); e.code = 'unavailable'; throw e; } return 'ok'; }, { baseMs: 1 }), 'ok');
  assert.strictEqual(n, 3);
  let m = 0;
  await assert.rejects(Res.retry(async () => { m++; const e = new Error('no'); e.code = 'permission-denied'; throw e; }, { baseMs: 1 }), /no/);
  assert.strictEqual(m, 1, 'permission errors are not retried');
  let k = 0;
  await assert.rejects(Res.retry(async () => { k++; throw Object.assign(new Error('down'), { code: 'unavailable' }); }, { baseMs: 1, tries: 2 }));
  assert.strictEqual(k, 2);
});

test('P10.13 double-tap window', () => {
  assert.strictEqual(Res.isDoubleTap(undefined, 1000), false);
  assert.strictEqual(Res.isDoubleTap(1000, 1500), true);
  assert.strictEqual(Res.isDoubleTap(1000, 1900), false);
});

test('P10.17 errors become plain language, never raw codes', () => {
  const m = (e, off) => Res.friendly(e, off);
  assert.match(m(null, true), /offline/i);
  assert.match(m({ code: 'permission-denied' }), /permission/i);
  assert.match(m({ code: 'auth/id-token-expired' }), /sign in again/i);
  assert.match(m({ code: 'unavailable' }), /slow or interrupted/i);
  assert.match(m(new Error('TypeError: x is undefined')), /went wrong/i);
  for (const e of [{ code: 'permission-denied' }, new Error('TypeError: x is undefined'), { code: 'unavailable' }]) assert.doesNotMatch(m(e), /TypeError|permission-denied|undefined/);
});

// ---- items 18-24: documents and the gate ----
const ROOT = path.resolve(__dirname, '..');
test('P10.18-23 operating documents exist and are not empty', () => {
  const need = { 'UAT.md': ['Admin', 'Service Center', 'Technician', 'Warehouse', 'Customer'], 'SOP.md': ['Admin', 'Service Center', 'Technician', 'Warehouse'], 'TROUBLESHOOTING.md': ['offline'],
    'TRAINING.md': ['Training data'], 'BACKUP-RECOVERY.md': ['PITR', 'Restore drill', 'gcloud firestore export'], 'DEPLOY-ROLLBACK.md': ['Rollback', 'stamp-release'], 'MONITORING.md': ['Alerts', 'health check'],
    'PERFORMANCE.md': ['320'], 'KNOWN-ISSUES.md': ['Offline'], 'GO-LIVE.md': ['NO-GO', 'GO WITH KNOWN ISSUES'] };
  for (const [f, words] of Object.entries(need)) {
    const t = fs.readFileSync(path.join(ROOT, 'docs', f), 'utf8');
    assert.ok(t.length > 400, f + ' too short');
    for (const w of words) assert.ok(t.toLowerCase().includes(w.toLowerCase()), `${f} should mention ${w}`);
  }
});

test('P10.21 every automated-cover file named in the UAT matrix exists', () => {
  const t = fs.readFileSync(path.join(ROOT, 'docs/UAT.md'), 'utf8');
  const names = [...new Set((t.match(/`[A-Za-z0-9._-]+\.(?:test\.js|test\.mjs|spec\.js)`/g) || []).map((s) => s.slice(1, -1)))];
  assert.ok(names.length >= 6);
  const all = []; (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (['node_modules', '.git'].includes(e.name)) continue; const p = path.join(d, e.name); e.isDirectory() ? walk(p) : all.push(e.name); } })(ROOT);
  for (const n of names) assert.ok(all.includes(n), 'UAT names a test that does not exist: ' + n);
});

test('P10.19 release stamp is valid and the stamp script rejects bad versions', () => {
  const src = fs.readFileSync(path.join(ROOT, 'crm/release.js'), 'utf8');
  const win = {}; new Function('window', src)(win);
  assert.match(win.PE_RELEASE.version, /^\d+\.\d+\.\d+/); assert.match(win.PE_RELEASE.date, /^\d{4}-\d{2}-\d{2}$/);
  const r = require('child_process').spawnSync('node', ['scripts/stamp-release.mjs', 'banana'], { cwd: ROOT });
  assert.notStrictEqual(r.status, 0);
});

test('P10.24 the go-live gate: NO-GO on a failed suite, otherwise GO WITH KNOWN ISSUES until you confirm', () => {
  const run = (env) => require('child_process').spawnSync('node', ['scripts/qa/go-live-gate.mjs'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env } });
  const bad = run({ GATE_OUTCOMES: JSON.stringify({ rules_qa: 'failure' }) });
  assert.strictEqual(bad.status, 1); assert.match(bad.stdout, /Go-live gate: NO-GO/); assert.match(bad.stdout, /rules_qa/);
  const ok = run({ GATE_OUTCOMES: JSON.stringify({ rules_qa: 'success' }) });
  assert.strictEqual(ok.status, 0); assert.match(ok.stdout, /Go-live gate: GO WITH KNOWN ISSUES/);
  assert.match(ok.stdout, /owner confirmation/);
});
