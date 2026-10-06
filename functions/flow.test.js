// End-to-end run of the trade functions in index.js against an in-memory
// Firestore stand-in (testsupport/fakefs.js). Not deployed.
const Module = require('module');
const fake = require('./testsupport/fakefs');
const orig = Module._load;
const wrap = (opts, handler) => ({ opts, handler });
Module._load = function (req, ...a) {
  if (req === 'firebase-admin/app') return { initializeApp() {} };
  if (req === 'firebase-admin/firestore') return { getFirestore: () => fake.db, FieldValue: fake.FieldValue, Timestamp: fake.Timestamp };
  if (req === 'firebase-functions/v2/firestore') return new Proxy({}, { get: () => wrap });
  return orig.call(this, req, ...a);
};
const F = require('./index.js');
const { store, DocRef, Snap, Timestamp } = fake;
const get = (p) => store.get(p);
const ref = (p) => { const [c, id] = p.split('/'); return new DocRef(c, id); };
const set = (p, d) => store.set(p, d);
const test = require('node:test');
const assert = require('node:assert');
const ok = (cond, msg) => assert.ok(cond, msg);
async function created(fn, p, params = {}) { await F[fn].handler({ data: new Snap(ref(p)), params: { ...params } }); }
async function updated(fn, p, change, authId, params = {}) {
  const before = new Snap(ref(p));
  const cur = get(p); const next = { ...cur, ...change };
  set(p, next);
  await F[fn].handler({ data: { before, after: new Snap(ref(p)) }, params, authId });
}
test('orders, invoices, stock, dispatch, delivery, payments and serial checks end to end', async () => {
  set('products/p1', { name: 'Geyser' });
  set('productModels/m1', { productId: 'p1', modelNumber: '15L', gstRate: 18, hsnCode: '8516', status: 'active' });
  set('priceLists/company_default-dealer_m1', { price: 5000 });
  set('priceLists/company_default-distributor_m1', { price: 4500 });
  set('priceLists/x9_default_m1', { price: 5200 });
  set('users/d1', { role: 'dealer', name: 'Ravi', gstin: '29ABCDE1234F1Z5' });
  set('users/x9', { role: 'distributor', name: 'Big Dist', gstin: '33ABCDE1234F1Z5' });
  set('users/d2', { role: 'dealer', name: 'Sub Dealer', distributionType: 'underDistributor', distributorUid: 'x9' });
  set('settings/companyProfile', { legalName: 'Pushpak', gstin: '29AAAAA0000A1Z5', stateCode: '29', invoicePrefix: 'PE' });
  set('tradeAccounts/d1', { creditLimit: 100000, paymentTermsDays: 30 });

  // 1. dealer order -> priced
  set('dealerOrders/o1', { orderId: 'DO-1', dealerUid: 'd1', distributorUid: '', status: 'placed', lines: [{ modelId: 'm1', qty: 2 }], createdAt: Timestamp.now() });
  await created('priceOnCreate_dealerOrders', 'dealerOrders/o1', { orderId: 'o1' });
  ok(get('dealerOrders/o1').pricing.status === 'ok' && get('dealerOrders/o1').totals.total === 11800, 'order priced 2 x 5000 + 18% = 11800');
  ok(get('dealerOrders/o1').pricedLines[0].hsn === '8516', 'HSN carried onto line');
  // 2. approve -> waiting for stock + invoice
  await updated('orderUpdated_dealerOrders', 'dealerOrders/o1', { status: 'confirmed' }, 'wh1', { orderId: 'o1' });
  let o1 = get('dealerOrders/o1');
  ok(o1.stockStatus === 'waiting' && o1.stockLocation === 'warehouse', 'approved with no stock -> waiting');
  const inv = get('invoices/inv_dealerOrders_o1');
  ok(inv && inv.invoiceNo.startsWith('PE/') && inv.totals.cgst === 900 && inv.totals.sgst === 900 && inv.totals.igst === 0, 'invoice created, same-state CGST/SGST');
  ok(get('tradeAccounts/d1').outstanding === 11800, 'account outstanding 11800');
  // 3. receive 3 units -> order gets them
  set('stockReceipts/r1', { modelId: 'm1', serials: ['SN0001', 'SN0002', 'sn0003'], createdByUid: 'wh1' });
  await created('processStockReceipt', 'stockReceipts/r1', { receiptId: 'r1' });
  ok(get('stockReceipts/r1').status === 'accepted', 'receipt accepted');
  ok(get('productStock/warehouse_m1').onHand === 3 && get('productStock/warehouse_m1').reserved === 2, 'warehouse onHand 3, reserved 2');
  ok(get('dealerOrders/o1').stockStatus === 'ready', 'waiting order became ready');
  set('stockReceipts/r2', { modelId: 'm1', serials: ['SN0003', 'SN0009'], createdByUid: 'wh1' });
  await created('processStockReceipt', 'stockReceipts/r2', { receiptId: 'r2' });
  ok(get('stockReceipts/r2').status === 'rejected' && !get('unitSerials/SN0009'), 'duplicate serial refuses whole receipt');
  // 4. dispatch: bad then good
  await updated('orderUpdated_dealerOrders', 'dealerOrders/o1', { dispatchRequest: { serials: { m1: ['SN0001'] }, transporter: 'VRL', byUid: 'wh1', requestedAt: Timestamp.now() } }, 'wh1', { orderId: 'o1' });
  ok(get('dealerOrders/o1').status === 'confirmed' && /2 unit/.test(get('dealerOrders/o1').dispatchRejected.reason), 'wrong serial count refused');
  await new Promise((r) => setTimeout(r, 5));
  await updated('orderUpdated_dealerOrders', 'dealerOrders/o1', { dispatchRequest: { serials: { m1: ['sn0001', 'SN0002'] }, transporter: 'VRL', docket: 'D1', byUid: 'wh1', requestedAt: Timestamp.now() } }, 'wh1', { orderId: 'o1' });
  o1 = get('dealerOrders/o1');
  ok(o1.status === 'dispatched' && o1.dispatchRejected === null, 'dispatched after server check');
  ok(get('productStock/warehouse_m1').onHand === 1 && get('productStock/warehouse_m1').reserved === 0, 'stock: onHand 1, reserved 0');
  ok(get('unitSerials/SN0001').status === 'dispatched' && get('unitSerials/SN0001').soldToUid === 'd1' && get('unitSerials/SN0001').invoiceNo === inv.invoiceNo, 'serial sold to dealer with invoice no');
  await updated('orderUpdated_dealerOrders', 'dealerOrders/o1', { status: 'delivered' }, 'wh1', { orderId: 'o1' });
  ok(get('unitSerials/SN0002').status === 'delivered', 'delivered serial');
  // 5. distributor order: Karnataka seller, Tamil Nadu buyer -> IGST; credit acct missing so set
  set('tradeAccounts/x9', { creditLimit: 100000 });
  set('distributorOrders/q1', { orderId: 'DI-1', distributorUid: 'x9', status: 'placed', lines: [{ modelId: 'm1', qty: 1 }], createdAt: Timestamp.now() });
  await created('priceOnCreate_distributorOrders', 'distributorOrders/q1', { orderId: 'q1' });
  await updated('orderUpdated_distributorOrders', 'distributorOrders/q1', { status: 'confirmed' }, 'wh1', { orderId: 'q1' });
  ok(get('invoices/inv_distributorOrders_q1').interState === true && get('invoices/inv_distributorOrders_q1').totals.igst === 810, 'inter-state invoice uses IGST (4500*18%)');
  ok(get('distributorOrders/q1').stockStatus === 'ready', 'distributor order reserved last unit');
  await updated('orderUpdated_distributorOrders', 'distributorOrders/q1', { dispatchRequest: { serials: { m1: ['SN0003'] }, transporter: 'X', byUid: 'wh1', requestedAt: Timestamp.now() } }, 'wh1', { orderId: 'q1' });
  await updated('orderUpdated_distributorOrders', 'distributorOrders/q1', { status: 'delivered' }, 'wh1', { orderId: 'q1' });
  ok(get('productStock/dist_x9_m1').onHand === 1 && get('unitSerials/SN0003').location === 'dist_x9' && get('unitSerials/SN0003').status === 'in_stock', 'delivery became distributor stock');
  // 6. sub-dealer order sold by distributor from its own stock
  set('dealerOrders/o2', { orderId: 'DO-2', dealerUid: 'd2', distributorUid: 'x9', status: 'placed', lines: [{ modelId: 'm1', qty: 1 }], createdAt: Timestamp.now() });
  await created('priceOnCreate_dealerOrders', 'dealerOrders/o2', { orderId: 'o2' });
  ok(get('dealerOrders/o2').totals.taxable === 5200, 'sub-dealer priced at distributor price 5200');
  await updated('orderUpdated_dealerOrders', 'dealerOrders/o2', { status: 'confirmed' }, 'x9', { orderId: 'o2' });
  ok(!get('invoices/inv_dealerOrders_o2'), 'no Head Office invoice for distributor sale');
  ok(get('dealerOrders/o2').stockStatus === 'ready' && get('dealerOrders/o2').stockLocation === 'dist_x9', 'reserved from distributor stock');
  await updated('orderUpdated_dealerOrders', 'dealerOrders/o2', { dispatchRequest: { serials: { m1: ['SN0001'] }, transporter: 'X', byUid: 'x9', requestedAt: Timestamp.now() } }, 'x9', { orderId: 'o2' });
  ok(/not in stock here/.test(get('dealerOrders/o2').dispatchRejected.reason), 'cannot dispatch a serial held elsewhere');
  await new Promise((r) => setTimeout(r, 5));
  await updated('orderUpdated_dealerOrders', 'dealerOrders/o2', { dispatchRequest: { serials: { m1: ['SN0003'] }, transporter: 'X', byUid: 'x9', requestedAt: Timestamp.now() } }, 'x9', { orderId: 'o2' });
  ok(get('dealerOrders/o2').status === 'dispatched' && get('productStock/dist_x9_m1').onHand === 0, 'distributor dispatched to its dealer');
  // 7. cancel releases reservation
  set('dealerOrders/o3', { orderId: 'DO-3', dealerUid: 'd1', distributorUid: '', status: 'placed', lines: [{ modelId: 'm1', qty: 1 }], createdAt: Timestamp.now() });
  await created('priceOnCreate_dealerOrders', 'dealerOrders/o3', { orderId: 'o3' });
  set('stockReceipts/r3', { modelId: 'm1', serials: ['SN0010'], createdByUid: 'wh1' });
  await created('processStockReceipt', 'stockReceipts/r3', { receiptId: 'r3' });
  await updated('orderUpdated_dealerOrders', 'dealerOrders/o3', { status: 'confirmed' }, 'wh1', { orderId: 'o3' });
  ok(get('productStock/warehouse_m1').reserved === 1, 'o3 reserved 1');
  await updated('orderUpdated_dealerOrders', 'dealerOrders/o3', { status: 'cancelled', statusNote: 'customer cancelled' }, 'wh1', { orderId: 'o3' });
  ok(get('productStock/warehouse_m1').reserved === 0 && get('invoices/inv_dealerOrders_o3').status === 'cancelled', 'cancel releases stock and cancels invoice');
  ok(get('tradeAccounts/d1').outstanding === 11800, 'outstanding back to 11800 after cancelled invoice');
  // 8. payment
  set('tradePayments/pay1', { accountUid: 'd1', amount: 12000, mode: 'NEFT' });
  await created('applyTradePayment', 'tradePayments/pay1', { paymentId: 'pay1' });
  ok(get('invoices/inv_dealerOrders_o1').status === 'paid' && get('tradeAccounts/d1').outstanding === -200 && get('tradePayments/pay1').unallocated === 200, 'payment pays invoice, 200 advance');
  ok(get('tradeAccounts/d1').oldestUnpaidDue === null, 'nothing overdue any more');
  // 9. registration serial check
  set('productRegistrations/g1', { dealerUid: 'd1', serialNumber: 'sn0002' });
  await created('checkRegistrationSerial', 'productRegistrations/g1', { regId: 'g1' });
  ok(get('productRegistrations/g1').serialCheck.status === 'verified', 'registration serial verified');
  set('productRegistrations/g2', { dealerUid: 'd1', serialNumber: 'SN0010' });
  await created('checkRegistrationSerial', 'productRegistrations/g2', { regId: 'g2' });
  ok(get('productRegistrations/g2').serialCheck.status === 'not_sold', 'unit still in warehouse flagged');
  set('productRegistrations/g3', { dealerUid: 'd1', serialNumber: 'SN0003' });
  await created('checkRegistrationSerial', 'productRegistrations/g3', { regId: 'g3' });
  ok(get('productRegistrations/g3').serialCheck.status === 'other_dealer', 'unit sold to another dealer flagged');
  const ledger = [...store.entries()].filter(([p, d]) => p.startsWith('ledgerEntries/') && d.accountUid === 'd1');
  const bal = ledger.reduce((a, [, d]) => a + d.debit - d.credit, 0);
  ok(Math.round(bal * 100) / 100 === -200, 'ledger sums to account balance (-200)');
});
