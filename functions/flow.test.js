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

test('spare stock ops: transfers, use on jobs, no negatives, approvals, defective returns, low stock', async () => {
  set('spareParts/p1', { name: 'Thermostat', partCode: 'SP-1', reorderLevel: 5 });
  set('users/c1', { role: 'servicecenter', email: 'c1@x' });
  set('users/t1', { role: 'technician', email: 't1@x', linkedServiceCenterUid: 'c1' });
  set('users/t2', { role: 'technician', email: 't2@x' });
  set('centerRequests/j1', { requestId: 'PE-CR-1', serviceCenterUid: 'c1', technicianUid: 't1', status: 'in_progress' });
  set('inventory/servicecenter_c1_p1', { partId: 'p1', location: 'servicecenter', serviceCenterUid: 'c1', quantity: 3 });
  const op = async (id, data) => { set(`stockOps/${id}`, { status: 'pending', ...data }); await created('sparesOpCreated', `stockOps/${id}`, { opId: id }); return get(`stockOps/${id}`); };

  let r = await op('s1', { type: 'transfer_to_technician', byUid: 'c1', techUid: 't1', lines: [{ partId: 'p1', qty: 2 }], job: { coll: 'centerRequests', id: 'j1' } });
  ok(r.status === 'done', 'center sends 2 to its technician');
  ok(get('inventory/servicecenter_c1_p1').quantity === 1 && get('inventory/technician_t1_p1').quantity === 2, 'center 1, technician 2');
  r = await op('s2', { type: 'transfer_to_technician', byUid: 'c1', techUid: 't2', lines: [{ partId: 'p1', qty: 1 }] });
  ok(r.status === 'rejected' && /isn't linked/.test(r.reason), 'cannot send to a technician of another center');
  r = await op('s3', { type: 'consume', byUid: 't1', lines: [{ partId: 'p1', qty: 3 }], job: { coll: 'centerRequests', id: 'j1' } });
  ok(r.status === 'rejected' && /Only 2 of Thermostat/.test(r.reason), 'cannot use more than the bag holds');
  r = await op('s4', { type: 'consume', byUid: 't1', lines: [{ partId: 'p1', qty: 2 }], job: { coll: 'centerRequests', id: 'j1' } });
  ok(r.status === 'done' && get('inventory/technician_t1_p1').quantity === 0, 'technician uses 2 on the job');
  const returnFor = (id) => [...store.entries()].find(([k, d]) => k.startsWith('returns/') && d.opId === id)?.[1];
  const techReturn = returnFor('s4');
  ok(techReturn && techReturn.status === 'sent_to_center' && techReturn.serviceCenterUid === 'c1' && techReturn.defectiveDueBy, 'defective return handed to center with a due date');
  r = await op('s5', { type: 'consume', byUid: 'c1', lines: [{ partId: 'p1', qty: 1 }], job: { coll: 'centerRequests', id: 'j1' } });
  ok(r.status === 'done' && returnFor('s5').status === 'awaiting_return', 'center use opens awaiting_return');
  r = await op('s6', { type: 'consume', byUid: 't2', lines: [{ partId: 'p1', qty: 1 }], job: { coll: 'centerRequests', id: 'j1' } });
  ok(r.status === 'rejected', 'cannot use parts on someone else\'s job');
  r = await op('s7', { type: 'draw_from_center', byUid: 't1', lines: [{ partId: 'p1', qty: 5 }], job: { coll: 'centerRequests', id: 'j1' } });
  ok(r.status === 'rejected', 'cannot draw more than the center has');
  r = await op('s8', { type: 'remove', byUid: 'c1', lines: [{ partId: 'p1', qty: 1 }] });
  ok(r.status === 'rejected' && /reason/.test(r.reason), 'removing stock needs a reason');
  r = await op('s9', { type: 'add_request', byUid: 't1', lines: [{ partId: 'p1', qty: 4 }], reason: 'Bought locally, bill 55' });
  ok(r.status === 'awaiting_approval' && (get('inventory/technician_t1_p1').quantity || 0) === 0, 'add request waits for Warehouse');
  await updated('sparesOpDecided', 'stockOps/s9', { status: 'approved', decidedByUid: 'wh1' });
  ok(get('stockOps/s9').status === 'done' && get('inventory/technician_t1_p1').quantity === 4, 'approved request adds the stock');
  const moves = [...store.entries()].filter(([p, d]) => p.startsWith('stockMovements/') && d.opId);
  ok(moves.length === 4, 'one ledger line per applied op line (transfer, 2 uses, add)');
  // low stock alert crosses the reorder level once
  const before = new Snap(ref('inventory/warehouse_p1'));
  set('inventory/warehouse_p1', { partId: 'p1', location: 'warehouse', quantity: 4 });
  const n0 = [...store.keys()].filter((k) => k.startsWith('notifications/')).length;
  await F.lowStockAlert.handler({ data: { before, after: new Snap(ref('inventory/warehouse_p1')) } });
  const notes = [...store.entries()].filter(([k]) => k.startsWith('notifications/')).map(([, d]) => d);
  ok(notes.length === n0 + 1 && /Thermostat/.test(notes.at(-1).message), 'low-stock alert raised');
});

test('claims lock their items, reject releases, settle pays the approved amount; center billing is server-decided', async () => {
  const Billing = require('./billing');
  set('walletTransactions/w1', { technicianUid: 'tA', amount: 300, status: 'unclaimed', sourceJobLabel: 'J1' });
  set('walletTransactions/w2', { technicianUid: 'tA', amount: 200, status: 'unclaimed', sourceJobLabel: 'J2' });
  set('claims/k1', { claimId: 'CL-1', claimantUid: 'tA', claimantType: 'technician', amount: 500, walletTxnIds: ['w1', 'w2'], status: 'submitted' });
  await created('checkClaim', 'claims/k1', { docId: 'k1' });
  ok(get('claims/k1').lock.status === 'locked' && get('walletTransactions/w1').status === 'claimed' && get('walletTransactions/w1').claimDocId === 'k1', 'credits locked to the claim');
  set('claims/k2', { claimId: 'CL-2', claimantUid: 'tA', claimantType: 'technician', amount: 300, walletTxnIds: ['w1'], status: 'submitted' });
  await created('checkClaim', 'claims/k2', { docId: 'k2' });
  ok(get('claims/k2').status === 'rejected' && /already claimed/.test(get('claims/k2').rejectReason), 'second claim on the same credit refused');
  await updated('claimUpdated', 'claims/k1', { status: 'rejected', rejectReason: 'wrong job', rejectedByUid: 'wh1' }, 'wh1', { docId: 'k1' });
  ok(get('walletTransactions/w1').status === 'unclaimed' && get('walletTransactions/w2').status === 'unclaimed', 'reject releases the credits');
  ok(get('claims/k1').history.some((h) => h.to === 'rejected'), 'history recorded');
  set('claims/k3', { claimId: 'CL-3', claimantUid: 'tA', claimantType: 'technician', amount: 500, walletTxnIds: ['w1', 'w2'], status: 'submitted' });
  await created('checkClaim', 'claims/k3', { docId: 'k3' });
  ok(get('claims/k3').claimCheck.verified === 500, 'locked total 500');
  await updated('claimUpdated', 'claims/k3', { status: 'verified', approvedAmount: 450, verifiedByUid: 'wh1' }, 'wh1', { docId: 'k3' });
  await updated('claimUpdated', 'claims/k3', { status: 'settled', paidByUid: 'sa1', paymentMethod: 'NEFT', paymentRef: 'UTR7' }, 'sa1', { docId: 'k3' });
  const pay = get('payments/claim_k3');
  ok(pay && pay.amount === 450 && pay.verifiedByUid === 'wh1' && pay.paidByUid === 'sa1', 'payment written for the approved amount');
  ok(get('walletTransactions/w1').status === 'paid', 'credits marked paid');
  await updated('claimUpdated', 'claims/k3', { status: 'settled', paymentRef: 'again' }, 'sa1', { docId: 'k3' });
  ok(get('payments/claim_k3').referenceNumber === 'UTR7', 'no second payment');

  // center billing via request
  set(`serviceChargeRates/${Billing.rateCardKey('default', null, 'Geyser', 'repair', null)}`, { amount: 450 });
  set('centerRequests/jb', { requestId: 'PE-CR-9', serviceCenterUid: 'cB', status: 'completed', category: 'Geyser', type: 'service' });
  await updated('applyBillingRequest', 'centerRequests/jb', { billingRequest: { treatAs: 'in', byUid: 'cB', requestedAt: Timestamp.now() } }, 'cB', { docId: 'jb' });
  ok(get('centerRequests/jb').billingStatus === 'ready_to_claim' && get('centerRequests/jb').billingTotal === 450, 'in-warranty billed at the rate card, not a typed amount');
  await new Promise((r) => setTimeout(r, 5));
  await updated('applyBillingRequest', 'centerRequests/jb', { billingRequest: { treatAs: 'out', sparePartsCost: 1, otherCharges: 0, serviceCharge: 0, byUid: 'cB', requestedAt: Timestamp.now() } }, 'cB', { docId: 'jb' });
  ok(/Already billed/.test(get('centerRequests/jb').billingRejected.reason), 'cannot re-bill');
  set('claims/k4', { claimId: 'CL-4', claimantUid: 'cB', claimantType: 'servicecenter', amount: 450, ticketIds: ['jb'], status: 'submitted' });
  await created('checkClaim', 'claims/k4', { docId: 'k4' });
  ok(get('centerRequests/jb').billingStatus === 'claimed' && get('claims/k4').lock.status === 'locked', 'ticket locked to the center claim');
});

test('RMA: server-checked replacement, warranty carried, defective unit back, brand return with replacements', async () => {
  set('productModels/mR', { productId: 'p1', modelNumber: '25L', status: 'active' });
  set('productRegistrations/orig', { registrationId: 'PE-REG-1', customerName: 'Asha', customerPhone: '9876543210', serialNumber: 'OLD9', purchaseDate: '2026-02-01', warrantyMonths: 24 });
  set('unitSerials/NEW1', { serial: 'NEW1', modelId: 'mR', status: 'in_stock', location: 'warehouse' });
  set('unitSerials/OTHER', { serial: 'OTHER', modelId: 'm1', status: 'in_stock', location: 'warehouse' });
  set('productStock/warehouse_mR', { location: 'warehouse', modelId: 'mR', onHand: 2, reserved: 0 });
  set('rmaRequests/r1', { rmaId: 'PE-RMA-1', status: 'approved', modelId: 'mR', serialNumber: 'OLD9', customerName: 'Asha' });
  await updated('rmaUpdated', 'rmaRequests/r1', { dispatchRequest: { replacementSerial: 'OTHER', transporter: 'X', byUid: 'wh1', requestedAt: Timestamp.now() } }, 'wh1', { rmaId: 'r1' });
  ok(get('rmaRequests/r1').status === 'approved' && /different model/.test(get('rmaRequests/r1').rmaRejected.reason), 'wrong model refused');
  await new Promise((r) => setTimeout(r, 5));
  await updated('rmaUpdated', 'rmaRequests/r1', { dispatchRequest: { replacementSerial: 'new1', transporter: 'X', byUid: 'wh1', requestedAt: Timestamp.now() } }, 'wh1', { rmaId: 'r1' });
  const r1 = get('rmaRequests/r1');
  ok(r1.status === 'replacement_dispatched' && r1.replacementSerial === 'NEW1', 'replacement dispatched');
  ok(get('productStock/warehouse_mR').onHand === 1 && get('unitSerials/NEW1').status === 'dispatched', 'stock and serial moved');
  const newReg = get(`productRegistrations/${r1.replacementRegistrationId}`);
  ok(newReg && newReg.serialNumber === 'NEW1' && newReg.purchaseDate === '2026-02-01' && newReg.warrantyMonths === 24, 'warranty carried to the new serial');
  ok(get('productRegistrations/orig').replacedBySerial === 'NEW1', 'original registration marked replaced');
  await updated('rmaUpdated', 'rmaRequests/r1', { receiveRequest: { byUid: 'wh1', requestedAt: Timestamp.now() } }, 'wh1', { rmaId: 'r1' });
  ok(get('rmaRequests/r1').status === 'defective_received' && get('unitSerials/OLD9').status === 'defective' && get('productStock/warehouse_mR').defective === 1, 'defective unit held at warehouse');
  set('returns/sp1', { returnId: 'PE-RT-9', partId: 'p1', quantity: 1, status: 'defective' });
  set('brandReturns/b1', { brand: 'Haier', unitSerials: ['OLD9'], spareReturnIds: ['sp1'], status: 'pending' });
  await created('processBrandReturn', 'brandReturns/b1', { brId: 'b1' });
  ok(get('brandReturns/b1').status === 'sent' && get('unitSerials/OLD9').status === 'sent_to_brand' && get('returns/sp1').status === 'supplier_return', 'brand return booked');
  ok(get('productStock/warehouse_mR').defective === 0 && get('rmaRequests/r1').status === 'sent_to_brand', 'defective count cleared, RMA closed');
  set('brandReturns/b2', { brand: 'Haier', unitSerials: ['NEW1'], spareReturnIds: [], status: 'pending' });
  await created('processBrandReturn', 'brandReturns/b2', { brId: 'b2' });
  ok(get('brandReturns/b2').status === 'rejected', 'a good unit cannot be sent as defective');
  set('stockReceipts/rb', { modelId: 'mR', serials: ['NEW2'], createdByUid: 'wh1', brandReturnId: 'b1' });
  await created('processStockReceipt', 'stockReceipts/rb', { receiptId: 'rb' });
  ok(get('brandReturns/b1').replacementsReceived === 1, 'brand replacement unit counted against the shipment');
});
