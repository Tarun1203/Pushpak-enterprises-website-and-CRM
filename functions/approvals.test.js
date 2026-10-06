const test = require('node:test');
const assert = require('node:assert');
const A = require('./approvals');

test('payload checks per kind', () => {
  assert.strictEqual(A.validatePayload('spare_price', { price: 120.5 }), null);
  assert.strictEqual(A.validatePayload('spare_price', { price: null }), null);
  assert.ok(A.validatePayload('spare_price', { price: -1 }));
  assert.strictEqual(A.validatePayload('stock_reduction', { partId: 'p', qty: 2, reason: 'damaged', mode: 'adjustment' }), null);
  assert.ok(A.validatePayload('stock_reduction', { partId: 'p', qty: 0, reason: 'x', mode: 'adjustment' }));
  assert.ok(A.validatePayload('stock_reduction', { partId: 'p', qty: 2, reason: '', mode: 'issue' }));
  assert.strictEqual(A.validatePayload('center_rate', { rates: [{ category: 'Geyser', rateType: 'repair', bucket: null, amount: 450 }, { category: 'TV', rateType: 'installation', amount: null }] }), null);
  assert.ok(A.validatePayload('center_rate', { rates: [{ category: 'Geyser', rateType: 'x', amount: 1 }] }));
  assert.ok(A.validatePayload('nope', {}));
});

test('a reduction never takes stock below zero', () => {
  assert.deepStrictEqual(A.applyReduction(5, 3), { next: 2 });
  assert.match(A.applyReduction(2, 3).error, /Only 2/);
});
