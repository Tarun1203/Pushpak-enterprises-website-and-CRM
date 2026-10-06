const test = require('node:test');
const assert = require('node:assert');
const { guardDocuments, sensitiveChanges } = require('./profileGuard');

test('a center cannot verify its own existing document', () => {
  const before = [{ docId: 'A', verified: false, verifiedBy: '', verificationDate: '' }];
  const after = [{ docId: 'A', verified: true, verifiedBy: 'me', verificationDate: '2026-10-06' }];
  const r = guardDocuments(before, after);
  assert.ok(r.changed);
  assert.deepStrictEqual(r.documents[0], before[0]);
});
test('a new document cannot arrive already verified', () => {
  const r = guardDocuments([], [{ docId: 'B', verified: true, verifiedBy: 'x', verificationDate: 'y' }]);
  assert.ok(r.changed);
  assert.strictEqual(r.documents[0].verified, false);
});
test('a verified document keeps its file and dates', () => {
  const before = [{ docId: 'C', fileUrl: 'u1', docType: 'GST', expiryDate: '2027-01-01', verified: true, verifiedBy: 'SA', verificationDate: 'd' }];
  const after = [{ ...before[0], fileUrl: 'u2', expiryDate: '2030-01-01' }];
  const r = guardDocuments(before, after);
  assert.ok(r.changed);
  assert.strictEqual(r.documents[0].fileUrl, 'u1');
  assert.strictEqual(r.documents[0].expiryDate, '2027-01-01');
});
test('normal uploads and edits to unverified documents pass untouched', () => {
  const before = [{ docId: 'D', fileUrl: 'u', verified: false, verifiedBy: '', verificationDate: '' }];
  const after = [{ ...before[0], expiryDate: '2028-01-01' }, { docId: 'E', fileUrl: 'v', verified: false, verifiedBy: '', verificationDate: '' }];
  assert.strictEqual(guardDocuments(before, after).changed, false);
});
test('bank / GST / PAN changes are reported', () => {
  assert.deepStrictEqual(sensitiveChanges({ gstin: 'A', bankDetails: { ifsc: 'X' } }, { gstin: 'A', bankDetails: { ifsc: 'Y' } }), ['bankDetails']);
  assert.deepStrictEqual(sensitiveChanges({ gstin: 'A' }, { gstin: 'A' }), []);
});

test('a verifier stamps who verified; a verified file stays locked even for them', () => {
  const { guardDocuments } = require('./profileGuard');
  const before = [{ docId: 'A', fileUrl: 'u', verified: false, verifiedBy: '', verificationDate: '' }];
  const r = guardDocuments(before, [{ ...before[0], verified: true }], { canVerify: true, actorUid: 'wh1', actorEmail: 'wh@x', today: '2026-10-06' });
  assert.ok(r.changed);
  assert.deepStrictEqual([r.documents[0].verifiedByUid, r.documents[0].verifiedBy, r.documents[0].verificationDate], ['wh1', 'wh@x', '2026-10-06']);
  const v = [{ docId: 'B', fileUrl: 'u1', verified: true, verifiedByUid: 'wh1', verifiedBy: 'wh@x', verificationDate: 'd' }];
  const r2 = guardDocuments(v, [{ ...v[0], fileUrl: 'u2' }], { canVerify: true, actorUid: 'c1' });
  assert.strictEqual(r2.documents[0].fileUrl, 'u1');
});

test('expiry stages and when to remind', () => {
  const { expiryStage, shouldAlert } = require('./profileGuard');
  assert.strictEqual(expiryStage('2026-12-31', '2026-10-06'), null);
  assert.deepStrictEqual(expiryStage('2026-11-01', '2026-10-06'), { stage: '30', days: 26 });
  assert.deepStrictEqual(expiryStage('2026-10-10', '2026-10-06'), { stage: '7', days: 4 });
  assert.deepStrictEqual(expiryStage('2026-10-01', '2026-10-06'), { stage: 'expired', days: -5 });
  assert.strictEqual(expiryStage('', '2026-10-06'), null);
  assert.ok(shouldAlert('30', null) && shouldAlert('expired', '7') && !shouldAlert('7', '7') && !shouldAlert('30', 'expired'));
});
