const test = require('node:test');
const assert = require('node:assert');
const { computeIntakeWarranty, isPossibleDuplicate } = require('./intake');
const NOW = new Date('2026-10-06T00:00:00Z');
const day = 86400000;

test('registered product inside cover is in_warranty', () => {
  const w = computeIntakeWarranty({ purchaseDate: '2026-03-01', warrantyMonths: 12 }, {}, NOW);
  assert.strictEqual(w.status, 'in_warranty'); assert.strictEqual(w.source, 'registration'); assert.strictEqual(w.expiresOn, '2027-03-01');
});
test('registered product past cover is out_of_warranty', () => {
  assert.strictEqual(computeIntakeWarranty({ purchaseDate: '2024-01-01', warrantyMonths: 12 }, {}, NOW).status, 'out_of_warranty');
});
test('missing warrantyMonths defaults to 12', () => {
  assert.strictEqual(computeIntakeWarranty({ purchaseDate: '2026-01-01' }, {}, NOW).expiresOn, '2027-01-01');
});
test('falls back to ticket purchase date, then unknown', () => {
  const a = computeIntakeWarranty(null, { purchaseDate: '2026-08-01' }, NOW);
  assert.strictEqual(a.source, 'ticket-purchase-date'); assert.strictEqual(a.status, 'in_warranty');
  assert.deepStrictEqual(computeIntakeWarranty(null, {}, NOW), { status: 'unknown', expiresOn: null, source: 'none' });
});
test('unparseable registration date falls through', () => {
  assert.strictEqual(computeIntakeWarranty({ purchaseDate: 'garbage' }, { purchaseDate: '2026-08-01' }, NOW).source, 'ticket-purchase-date');
});
test('duplicate by serial: open ticket matches, self never matches', () => {
  const t = { id: 'a', serialNumber: 'SN1' };
  assert.ok(isPossibleDuplicate({ id: 'b', serialNumber: ' sn1 ', status: 'new' }, t, NOW));
  assert.ok(!isPossibleDuplicate({ id: 'a', serialNumber: 'SN1', status: 'new' }, t, NOW));
  assert.ok(!isPossibleDuplicate({ id: 'b', serialNumber: 'SN2', status: 'new' }, t, NOW));
});
test('closed ticket counts only inside the 30-day window', () => {
  const t = { id: 'a', serialNumber: 'SN1' };
  assert.ok(isPossibleDuplicate({ id: 'b', serialNumber: 'SN1', status: 'closed', createdAtMs: NOW - 10 * day }, t, NOW));
  assert.ok(!isPossibleDuplicate({ id: 'b', serialNumber: 'SN1', status: 'closed', createdAtMs: NOW - 45 * day }, t, NOW));
});
test('no serial: phone + category must both match', () => {
  const t = { id: 'a', customerPhone: '9000000000', category: 'Geyser' };
  assert.ok(isPossibleDuplicate({ id: 'b', customerPhone: '9000000000', category: 'Geyser', status: 'assigned' }, t, NOW));
  assert.ok(!isPossibleDuplicate({ id: 'b', customerPhone: '9000000000', category: 'LED TV', status: 'assigned' }, t, NOW));
  assert.ok(!isPossibleDuplicate({ id: 'b', customerPhone: '9000000000', category: 'Geyser', status: 'assigned' }, { id: 'a' }, NOW));
});
