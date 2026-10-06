const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const P = require('./tradePricing');

const models = { m1: { label: 'Geyser 15L', gstRate: 18, status: 'active' }, m2: { label: 'Wall mount', gstRate: 12, status: 'active' }, m3: { label: 'No GST', status: 'active' } };

test('who sells: company for direct dealers and distributors, the distributor for its dealers', () => {
  assert.deepStrictEqual(P.partiesFor('dealerOrders', { dealerUid: 'd1', distributorUid: '' }), { seller: 'company', buyer: 'd1', defaultKey: 'default-dealer' });
  assert.deepStrictEqual(P.partiesFor('dealerOrders', { dealerUid: 'd1', distributorUid: 'x9' }), { seller: 'x9', buyer: 'd1', defaultKey: 'default' });
  assert.deepStrictEqual(P.partiesFor('distributorOrders', { distributorUid: 'x9' }), { seller: 'company', buyer: 'x9', defaultKey: 'default-distributor' });
});

test('account price wins over the standard price; GST added per line', () => {
  const parties = { seller: 'company', buyer: 'd1', defaultKey: 'default-dealer' };
  const prices = { company_d1_m1: 5000, 'company_default-dealer_m1': 5500, 'company_default-dealer_m2': 199.99 };
  const r = P.priceOrder([{ modelId: 'm1', qty: 2 }, { modelId: 'm2', qty: 3 }], models, prices, parties);
  assert.strictEqual(r.pricing.status, 'ok');
  assert.strictEqual(r.pricedLines[0].unitPrice, 5000);
  assert.strictEqual(r.pricedLines[0].priceSource, 'account');
  assert.strictEqual(r.pricedLines[0].gst, 1800);
  assert.strictEqual(r.pricedLines[1].priceSource, 'standard');
  assert.strictEqual(r.pricedLines[1].taxable, 599.97);
  assert.strictEqual(r.pricedLines[1].gst, 72); // 599.97 * 12% = 71.9964 -> 72.00
  assert.deepStrictEqual(r.totals, { taxable: 10599.97, gst: 1872, total: 12471.97 });
});

test('missing price or GST rate leaves the order incomplete with reasons', () => {
  const parties = { seller: 'company', buyer: 'd1', defaultKey: 'default-dealer' };
  const r = P.priceOrder([{ modelId: 'm2', qty: 1 }, { modelId: 'm3', qty: 1 }], models, { 'company_default-dealer_m3': 10 }, parties);
  assert.strictEqual(r.pricing.status, 'incomplete');
  assert.deepStrictEqual(r.pricing.issues, ['Wall mount: no price set', 'No GST: no GST rate set']);
  assert.strictEqual(r.totals, null);
});

test('a distributor price never leaks into a company-priced order', () => {
  const r = P.priceOrder([{ modelId: 'm1', qty: 1 }], models, { x9_default_m1: 100 }, { seller: 'company', buyer: 'd1', defaultKey: 'default-dealer' });
  assert.strictEqual(r.pricing.status, 'incomplete');
});

test('bad lines are rejected', () => {
  assert.ok(P.validateLines([]));
  assert.ok(P.validateLines([{ modelId: 'm1', qty: 0 }]));
  assert.ok(P.validateLines([{ modelId: 'm1', qty: 1.5 }]));
  assert.ok(P.validateLines([{ modelId: 'm1', qty: 1 }, { modelId: 'm1', qty: 2 }]));
  assert.strictEqual(P.validateLines([{ modelId: 'm1', qty: 3 }]), null);
  assert.match(P.validateLines([{ modelId: 'm1', qty: 300 }, { modelId: 'm2', qty: 101 }]), /400 units/);
  assert.strictEqual(P.priceOrder('x', models, {}, {}).pricing.status, 'invalid');
});

test('the CRM copy is identical', () => {
  const a = fs.readFileSync(path.join(__dirname, 'tradePricing.js'), 'utf8');
  const b = fs.readFileSync(path.join(__dirname, '..', 'crm', 'tradePricing.js'), 'utf8');
  assert.strictEqual(a, b);
});
