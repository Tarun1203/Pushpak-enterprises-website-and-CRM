const test = require('node:test');
const assert = require('node:assert');
const S = require('./stock');

test('locations and ids', () => {
  assert.strictEqual(S.locationForSeller('company'), 'warehouse');
  assert.strictEqual(S.locationForSeller('u1'), 'dist_u1');
  assert.strictEqual(S.stockDocId('warehouse', 'm1'), 'warehouse_m1');
});

test('serial parsing and receipt checks', () => {
  assert.deepStrictEqual(S.parseSerials(' ab123x\nCD-4567, ef7890 '), ['AB123X', 'CD-4567', 'EF7890']);
  assert.match(S.validateReceiptSerials(['AB/123']), /not a valid/);
  assert.strictEqual(S.validateReceiptSerials(['AB1234', 'AB1235']), null);
  assert.match(S.validateReceiptSerials(['AB1234', 'ab1234']), /twice/);
  assert.match(S.validateReceiptSerials(['x']), /not a valid/);
  assert.match(S.validateReceiptSerials([]), /at least one/);
});

test('reservation takes what is free and waits for the rest', () => {
  const lines = [{ modelId: 'm1', qty: 5 }, { modelId: 'm2', qty: 2 }];
  const r = S.planReservation(lines, { m1: { onHand: 10, reserved: 7 }, m2: { onHand: 2, reserved: 0 } }, {});
  assert.deepStrictEqual(r.add, { m1: 3, m2: 2 });
  assert.deepStrictEqual(r.allocation, { m1: 3, m2: 2 });
  assert.strictEqual(r.ready, false);
  const r2 = S.planReservation(lines, { m1: { onHand: 12, reserved: 7 }, m2: { onHand: 2, reserved: 2 } }, r.allocation);
  assert.deepStrictEqual(r2.add, { m1: 2 });
  assert.strictEqual(r2.ready, true);
});

test('dispatch serials must match quantity, model, location and be in stock', () => {
  const lines = [{ modelId: 'm1', qty: 2, label: 'Geyser' }];
  const docs = { A1111: { modelId: 'm1', location: 'warehouse', status: 'in_stock' }, B2222: { modelId: 'm1', location: 'warehouse', status: 'in_stock' },
    C3333: { modelId: 'm2', location: 'warehouse', status: 'in_stock' }, D4444: { modelId: 'm1', location: 'dist_x', status: 'in_stock' }, E5555: { modelId: 'm1', location: 'warehouse', status: 'dispatched' } };
  assert.strictEqual(S.validateDispatchSerials(lines, { m1: ['a1111', 'B2222'] }, docs, 'warehouse'), null);
  assert.match(S.validateDispatchSerials(lines, { m1: ['A1111'] }, docs, 'warehouse'), /2 unit/);
  assert.match(S.validateDispatchSerials(lines, { m1: ['A1111', 'A1111'] }, docs, 'warehouse'), /twice/);
  assert.match(S.validateDispatchSerials(lines, { m1: ['A1111', 'C3333'] }, docs, 'warehouse'), /different model/);
  assert.match(S.validateDispatchSerials(lines, { m1: ['A1111', 'D4444'] }, docs, 'warehouse'), /not in stock here/);
  assert.match(S.validateDispatchSerials(lines, { m1: ['A1111', 'E5555'] }, docs, 'warehouse'), /not in stock here/);
  assert.match(S.validateDispatchSerials(lines, { m1: ['A1111', 'Z9999'] }, docs, 'warehouse'), /never received/);
  assert.match(S.validateDispatchSerials(lines, { m1: ['A1111', 'B2222'], m9: ['X'] }, docs, 'warehouse'), /not on this order/);
});
