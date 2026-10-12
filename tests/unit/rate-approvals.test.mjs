// Line-by-line decision on a service center's rate request.
import test from 'node:test';
import assert from 'node:assert';
import { decide, rateCardKey } from '../../crm/rate-approvals.js';

const LINES = [{ category: 'Geyser', rateType: 'repair', bucket: '25L', amount: 500 }, { category: 'Iron Box', rateType: 'installation', bucket: null, amount: null }];

test('approved lines (with edited amounts) are kept; every line has a recorded decision', () => {
  const r = decide(LINES, [{ decision: 'approve', amount: '480' }, { decision: 'reject', amount: '' }]);
  assert.strictEqual(r.status, 'approved');
  assert.deepStrictEqual(r.approved, [{ category: 'Geyser', rateType: 'repair', bucket: '25L', amount: 480 }]);
  assert.deepStrictEqual(r.decisions.map((d) => d.decision), ['approved', 'rejected']);
  assert.strictEqual(r.decisions[0].requested, 500);
});
test('an approved empty amount removes the center\'s own rate; all rejected closes as rejected', () => {
  assert.strictEqual(decide(LINES, [{ decision: 'reject' }, { decision: 'approve', amount: '' }]).approved[0].amount, null);
  assert.strictEqual(decide(LINES, [{ decision: 'reject' }, { decision: 'reject' }]).status, 'rejected');
});
test('refuses undecided lines and impossible amounts', () => {
  assert.throws(() => decide(LINES, [{ decision: 'approve', amount: '10' }, {}]), /every line/);
  assert.throws(() => decide(LINES, [{ decision: 'approve', amount: '-5' }, { decision: 'reject' }]), /0 to 1,00,000/);
  assert.throws(() => decide(LINES, [{ decision: 'approve', amount: '200000' }, { decision: 'reject' }]), /0 to 1,00,000/);
});
test('rate card keys match the server (functions/billing.js)', async () => {
  const { createRequire } = await import('node:module');
  const req = createRequire(import.meta.url);
  const Billing = req('../../functions/billing.js');
  for (const [s, u, c, t, b] of [['center', 'scX', 'Geyser', 'repair', '25L'], ['default', null, 'Iron Box', 'installation', null], ['center', 'a', 'TV / LED', 'repair', '32" Smart']]) {
    assert.strictEqual(rateCardKey(s, u, c, t, b), Billing.rateCardKey(s, u, c, t, b));
  }
});
