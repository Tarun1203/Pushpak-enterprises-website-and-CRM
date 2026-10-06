const test = require('node:test');
const assert = require('node:assert');
const R = require('./rma');

test('replacement serial checks', () => {
  const rma = { status: 'approved', modelId: 'm1', serialNumber: 'OLD1' };
  const ok = { modelId: 'm1', status: 'in_stock', location: 'warehouse' };
  const stock = { onHand: 3, reserved: 1 };
  assert.strictEqual(R.checkReplacement(rma, 'NEW1', ok, stock), null);
  assert.match(R.checkReplacement({ ...rma, status: 'requested' }, 'NEW1', ok, stock), /approved/);
  assert.match(R.checkReplacement(rma, 'OLD1', ok, stock), /own/);
  assert.match(R.checkReplacement(rma, 'NEW1', null, stock), /never received/);
  assert.match(R.checkReplacement(rma, 'NEW1', { ...ok, modelId: 'm2' }, stock), /different model/);
  assert.match(R.checkReplacement(rma, 'NEW1', { ...ok, location: 'dist_x' }, stock), /not in the Head Office/);
  assert.match(R.checkReplacement(rma, 'NEW1', ok, { onHand: 2, reserved: 2 }), /reserved/);
});

test('warranty carries over', () => {
  assert.deepStrictEqual(R.carriedWarranty({ purchaseDate: '2026-01-10', warrantyMonths: 24 }), { purchaseDate: '2026-01-10', warrantyMonths: 24 });
  assert.strictEqual(R.carriedWarranty({}), null);
});

test('brand return checks', () => {
  const unit = { id: 'U1', doc: { status: 'defective', location: 'warehouse_defective' } };
  const spare = { id: 'r1', doc: { status: 'defective', returnId: 'PE-RT-1' } };
  assert.strictEqual(R.checkBrandReturn([unit], [spare]), null);
  assert.match(R.checkBrandReturn([], []), /at least one/);
  assert.match(R.checkBrandReturn([{ id: 'U2', doc: { status: 'in_stock', location: 'warehouse' } }], []), /not a defective unit/);
  assert.match(R.checkBrandReturn([], [{ id: 'r2', doc: { status: 'requested', returnId: 'PE-RT-2' } }]), /not marked defective/);
});
