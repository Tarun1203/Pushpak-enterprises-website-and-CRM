// crm/tradeOrders.js and crm/tradeFinance.js — the dealer/distributor
// ordering and finance screens shared by four CRM pages.
import test from 'node:test';
import assert from 'node:assert';
import { FS, db, el, settle, ts, XSS, assertNoInjectedMarkup, text } from './helpers.mjs';
const Trade = await import('../../crm/tradeOrders.js');
const Fin = await import('../../crm/tradeFinance.js');

test.beforeEach(() => { FS.__reset(); globalThis.__alerts = []; });

function seedCatalog() {
  FS.__seed('products/p1', { name: 'Geyser', brand: 'MakWell' });
  FS.__seed('products/p2', { name: 'Air Cooler' });
  FS.__seed('productModels/m1', { productId: 'p1', modelNumber: '25L', gstRate: 18 });
  FS.__seed('productModels/m2', { productId: 'p1', modelNumber: '15L', gstRate: 18 });
  FS.__seed('productModels/m3', { productId: 'p2', modelNumber: 'AC-1', status: 'inactive' });
}

test('loadCatalog labels, sorts, hides inactive models and caches until refresh', async () => {
  seedCatalog();
  const list = await Trade.loadCatalog(db, { refresh: true });
  assert.deepStrictEqual(list.map((c) => c.label), ['Geyser — 15L', 'Geyser — 25L']);
  assert.strictEqual(list[0].gstRate, 18);
  assert.strictEqual(list[0].brand, 'MakWell');
  const all = await Trade.loadCatalog(db, { includeInactive: true });
  assert.strictEqual(all.length, 3);
  FS.__seed('productModels/m4', { productId: 'p1', modelNumber: '10L' });
  assert.strictEqual((await Trade.loadCatalog(db)).length, 2, 'cached');
  assert.strictEqual((await Trade.loadCatalog(db, { refresh: true })).length, 3, 'refreshed');
});

test('My orders: newest first, priced lines and totals, escaped text, cancel only while awaiting approval', async () => {
  FS.__seed('dealerOrders/a', { orderId: 'DO-1', dealerUid: 'd1', status: 'placed', notes: XSS, createdAt: ts('2026-10-01T10:00:00Z'),
    lines: [{ modelId: 'm1', qty: 2 }], pricing: { status: 'ok' },
    pricedLines: [{ label: 'Geyser — 25L', qty: 2, unitPrice: 5000, gstRate: 18, total: 11800 }], totals: { taxable: 10000, gst: 1800, total: 11800 } });
  FS.__seed('dealerOrders/b', { orderId: 'DO-2', dealerUid: 'd1', status: 'confirmed', createdAt: ts('2026-10-03T10:00:00Z'), lines: [{ modelId: 'm1', qty: 1 }] });
  FS.__seed('dealerOrders/c', { orderId: 'DO-3', dealerUid: 'someone-else', status: 'placed', createdAt: ts('2026-10-04T10:00:00Z') });
  const box = el();
  await Trade.renderMyOrders(box, { db, collectionName: 'dealerOrders', ownerField: 'dealerUid', uid: 'd1' });
  const t = text(box);
  assert.ok(t.indexOf('DO-2') < t.indexOf('DO-1'), 'newest first');
  assert.ok(!t.includes('DO-3'), 'only my orders');
  assert.ok(t.includes('₹11,800.00'), 'total formatted in rupees');
  assert.ok(t.includes(XSS), 'notes shown as text');
  assertNoInjectedMarkup(assert, box, 'my orders');
  const cancels = box.querySelectorAll('.to-cancel');
  assert.strictEqual(cancels.length, 1, 'only the placed order can be cancelled');
  cancels[0].dispatchEvent(new window.Event('click'));
  await settle();
  const a = FS.__store.get('dealerOrders/a');
  assert.strictEqual(a.status, 'cancelled');
  assert.strictEqual(a.statusNote, 'Cancelled by buyer');
});

test('Order queue (Head Office): direct-dealer and distributor orders only, by tab', async () => {
  FS.__seed('dealerOrders/x', { orderId: 'DO-DIRECT', dealerUid: 'd1', distributorUid: '', status: 'placed', createdAt: ts('2026-10-01T00:00:00Z') });
  FS.__seed('dealerOrders/y', { orderId: 'DO-SUBDEALER', dealerUid: 'd2', distributorUid: 'dist9', status: 'placed', createdAt: ts('2026-10-01T00:00:00Z') });
  FS.__seed('distributorOrders/z', { orderId: 'XO-1', distributorUid: 'dist9', status: 'placed', createdAt: ts('2026-10-02T00:00:00Z') });
  FS.__seed('distributorOrders/w', { orderId: 'XO-DONE', distributorUid: 'dist9', status: 'delivered', createdAt: ts('2026-10-02T00:00:00Z') });
  FS.__seed('tradeAccounts/d1', { creditLimit: 100000, outstanding: 0 });
  FS.__seed('tradeAccounts/dist9', { creditLimit: 100000, outstanding: 0 });
  const box = el();
  await Trade.renderOrderQueue(box, { db, mode: 'company', uid: 'sa1' });
  await settle();
  let t = text(box);
  assert.ok(t.includes('DO-DIRECT') && t.includes('XO-1'), 'company sees direct dealers + distributors');
  assert.ok(!t.includes('DO-SUBDEALER'), 'not a distributor\'s own dealer');
  assert.ok(!t.includes('XO-DONE'), 'delivered is under Closed');
  box.querySelector('[data-tab="closed"]').dispatchEvent(new window.Event('click'));
  await settle();
  t = text(box);
  assert.ok(t.includes('XO-DONE') && !t.includes('XO-1'), 'closed tab');
  const dbox = el();
  await Trade.renderOrderQueue(dbox, { db, mode: 'distributor', uid: 'dist9' });
  await settle();
  t = text(dbox);
  assert.ok(t.includes('DO-SUBDEALER') && !t.includes('DO-DIRECT') && !t.includes('XO-1'), 'distributor sees only its dealers');
});

function captureWindow() {
  const pages = [];
  window.open = () => { const w = { html: '', document: { open() {}, write(h) { w.html += h; }, close() {} } }; pages.push(w); return w; };
  return pages;
}

test('printInvoice: escapes every field, CGST/SGST within the state, IGST across states', () => {
  const pages = captureWindow();
  const base = {
    invoiceNo: 'PE/2026-27/00001', orderId: 'DO-1', status: 'unpaid', invoiceDate: ts('2026-10-01T00:00:00Z'), dueDate: ts('2026-10-31T00:00:00Z'),
    seller: { legalName: 'Pushpak', address: 'Raichur\nKarnataka', gstin: '29AAAAA0000A1Z5', stateCode: '29' },
    buyer: { name: XSS, address: 'Line 1', gstin: '', stateCode: '29' },
    lines: [{ label: 'Geyser <b>25L</b>', hsn: '8516', qty: 2, unitPrice: 5000, taxable: 10000, gstRate: 18, cgst: 900, sgst: 900, igst: 0, total: 11800 }],
    totals: { taxable: 10000, cgst: 900, sgst: 900, igst: 0, total: 11800 }, paid: 1800, balance: 10000
  };
  Fin.printInvoice(base);
  let h = pages[0].html;
  assert.ok(h.includes('<th>CGST</th><th>SGST</th>') && !h.includes('<th>IGST</th>'), 'same state -> CGST + SGST');
  assert.ok(h.includes('&lt;img') && !h.includes('<img'), 'buyer name escaped');
  assert.ok(h.includes('Geyser &lt;b&gt;25L&lt;/b&gt;'), 'line label escaped');
  assert.ok(h.includes('Raichur<br>Karnataka'), 'address line breaks kept');
  assert.ok(h.includes('₹11,800.00') && h.includes('₹10,000.00'), 'totals and balance');
  assert.ok(h.includes('Unregistered'), 'buyer without GSTIN');
  Fin.printInvoice({ ...base, interState: true, status: 'cancelled', totals: { taxable: 10000, igst: 1800, total: 11800 } });
  h = pages[1].html;
  assert.ok(h.includes('<th>IGST</th>') && !h.includes('<th>CGST</th>'), 'inter-state -> IGST');
  assert.ok(h.includes('CANCELLED'), 'cancelled stamp');
  window.open = () => null;
  Fin.printInvoice(base);
  assert.match(globalThis.__alerts.pop(), /pop-ups/);
});

test('Accounts: Head Office accounts only, credit not set flagged, ageing buckets, names escaped', async () => {
  FS.__seed('users/d1', { role: 'dealer', name: XSS, gstin: '29ABCDE1234F1Z5' });
  FS.__seed('users/d2', { role: 'dealer', name: 'Sub Dealer', distributionType: 'underDistributor', distributorUid: 'x9' });
  FS.__seed('users/x9', { role: 'distributor', name: 'Big Dist' });
  FS.__seed('tradeAccounts/d1', { creditLimit: 50000, outstanding: 20000, paymentTermsDays: 15 });
  const past = new Date(Date.now() - 45 * 86400000);
  FS.__seed('invoices/i1', { buyerUid: 'd1', status: 'unpaid', balance: 20000, dueDate: FS.Timestamp.fromDate(past) });
  const box = el();
  await Fin.renderAccounts(box, { db, user: { uid: 'sa1' }, isSuperAdmin: true });
  await settle();
  const t = text(box);
  assert.ok(t.includes('Big Dist') && !t.includes('Sub Dealer'), 'distributor\'s own dealers are not Head Office accounts');
  assert.ok(t.includes('not set'), 'distributor with no credit limit flagged');
  assert.ok(t.includes('₹30,000.00'), 'available = limit - outstanding');
  assert.ok(t.includes('15 days'), 'payment terms');
  assertNoInjectedMarkup(assert, box, 'accounts');
  assert.ok(box.querySelectorAll('.tf-edit').length === 2, 'Super Admin can edit terms');
  const wbox = el();
  await Fin.renderAccounts(wbox, { db, user: { uid: 'wh1' }, isSuperAdmin: false });
  assert.strictEqual(wbox.querySelectorAll('.tf-edit').length, 0, 'Warehouse views only');
});

test('My account (dealer): limit, outstanding, overdue warning, payments escaped', async () => {
  const past = new Date(Date.now() - 3 * 86400000);
  FS.__seed('tradeAccounts/d1', { creditLimit: 50000, outstanding: 12000, oldestUnpaidDue: FS.Timestamp.fromDate(past) });
  FS.__seed('invoices/i1', { buyerUid: 'd1', invoiceNo: 'PE/2026-27/00009', status: 'partial', totals: { total: 15000 }, paid: 3000, balance: 12000, invoiceDate: ts('2026-09-01T00:00:00Z'), dueDate: FS.Timestamp.fromDate(past) });
  FS.__seed('tradePayments/p1', { accountUid: 'd1', amount: 3000, mode: 'UPI', reference: XSS, receivedOn: '2026-09-10', createdAt: ts('2026-09-10T00:00:00Z') });
  FS.__seed('tradePayments/p2', { accountUid: 'other', amount: 99999, mode: 'NEFT', reference: 'not mine', receivedOn: '2026-09-11' });
  const box = el();
  await Fin.renderMyAccount(box, { db, uid: 'd1' });
  await settle();
  const t = text(box);
  assert.ok(t.includes('₹50,000.00') && t.includes('₹12,000.00') && t.includes('₹38,000.00'), 'limit / outstanding / available');
  assert.ok(t.includes('overdue invoice'), 'overdue warning');
  assert.ok(t.includes('PE/2026-27/00009') && t.includes('Overdue'), 'invoice listed as overdue');
  assert.ok(!t.includes('not mine'), 'only own payments');
  assertNoInjectedMarkup(assert, box, 'my account');
});
