// crm/productStock.js, crm/stockOps.js, crm/rma.js.
import test from 'node:test';
import assert from 'node:assert';
import { FS, db, el, settle, ts, XSS, assertNoInjectedMarkup, text } from './helpers.mjs';
const PStock = await import('../../crm/productStock.js');
const StockOps = await import('../../crm/stockOps.js');
const Rma = await import('../../crm/rma.js');
const Trade = await import('../../crm/tradeOrders.js');

test.beforeEach(async () => {
  FS.__reset();
  FS.__seed('products/p1', { name: 'Geyser' });
  FS.__seed('productModels/m1', { productId: 'p1', modelNumber: '25L' });
  FS.__seed('productModels/m2', { productId: 'p1', modelNumber: '15L' });
  await Trade.loadCatalog(db, { refresh: true });
});

test('Serial lookup: unknown serial, and a known one with escaped buyer and history', async () => {
  FS.__seed('unitSerials/SN-0001', { serial: 'SN-0001', modelId: 'm1', status: 'delivered', location: 'dist_x9', soldToType: 'distributor', soldToName: XSS,
    orderId: 'XO-1', invoiceNo: 'PE/2026-27/00003', receivedAt: ts('2026-09-01T00:00:00Z'),
    history: [{ event: 'delivered', at: ts('2026-09-05T00:00:00Z') }, { event: 'received', at: ts('2026-09-01T00:00:00Z') }] });
  const box = el();
  await PStock.renderSerialLookup(box, { db });
  box.querySelector('#sl-serial').value = 'nope-1';
  box.querySelector('#sl-go').dispatchEvent(new window.Event('click'));
  await settle();
  assert.ok(text(box).includes('NOPE-1 was never received'), 'unknown serial, upper-cased');
  box.querySelector('#sl-serial').value = ' sn-0001 ';
  box.querySelector('#sl-go').dispatchEvent(new window.Event('click'));
  await settle();
  const t = text(box);
  assert.ok(t.includes('Geyser — 25L') && t.includes('Delivered') && t.includes('at distributor') && t.includes('PE/2026-27/00003'), 'unit details');
  assert.ok(t.indexOf('received') < t.indexOf('delivered'), 'history in time order');
  assertNoInjectedMarkup(assert, box, 'serial lookup');
});

test('Distributor stock: own location only, zero rows hidden, in-stock serials grouped by model', async () => {
  FS.__seed('productStock/dist_x9_m1', { location: 'dist_x9', modelId: 'm1', onHand: 3, reserved: 1 });
  FS.__seed('productStock/dist_x9_m2', { location: 'dist_x9', modelId: 'm2', onHand: 0, reserved: 0 });
  FS.__seed('productStock/dist_y_m2', { location: 'dist_y', modelId: 'm2', onHand: 50, reserved: 0 });
  for (const s of ['A-0003', 'A-0001', 'A-0002']) FS.__seed('unitSerials/' + s, { serial: s, modelId: 'm1', location: 'dist_x9', status: 'in_stock' });
  FS.__seed('unitSerials/A-0009', { serial: 'A-0009', modelId: 'm1', location: 'dist_x9', status: 'dispatched' });
  const box = el();
  await PStock.renderDistributorStock(box, { db, uid: 'x9' });
  const t = text(box);
  assert.ok(t.includes('Geyser — 25L'), 'stocked model shown');
  assert.ok(!t.includes('Geyser — 15L'), 'zero-stock model hidden');
  assert.ok(!t.includes('50'), 'another distributor\'s stock not shown');
  assert.ok(t.includes('Geyser — 25L — 3') && t.includes('A-0001, A-0002, A-0003') && !t.includes('A-0009'), 'in-stock serials sorted, dispatched excluded');
  const row = [...box.querySelectorAll('tbody tr')][0];
  assert.deepStrictEqual([...row.querySelectorAll('td')].slice(1).map((td) => td.textContent.trim()), ['3', '1', '2'], 'on hand / reserved / available');
});

test('runStockOp files the request and returns the server\'s decision', async () => {
  const user = { uid: 'sc1', email: 'sc@x.in' };
  setTimeout(() => {
    const [path] = [...FS.__store.keys()].filter((p) => p.startsWith('stockOps/'));
    FS.__store.set(path, { ...FS.__store.get(path), status: 'done' });
  }, 50);
  const r = await StockOps.runStockOp(db, user, { type: 'consume', lines: [{ partId: 'sp1', qty: '2' }], job: { coll: 'serviceJobs', id: 'j1' }, reason: 'x'.repeat(400) });
  assert.strictEqual(r.status, 'done');
  const op = [...FS.__store.values()].find((d) => d.type === 'consume');
  assert.deepStrictEqual(op.lines, [{ partId: 'sp1', qty: 2 }], 'qty sent as a number');
  assert.strictEqual(op.byUid, 'sc1');
  assert.strictEqual(op.reason.length, 300, 'reason capped at 300');
  assert.deepStrictEqual(op.job, { coll: 'serviceJobs', id: 'j1' });
  assert.ok(!('techUid' in op), 'no empty optional fields');
});

test('runStockOpOrThrow throws the server\'s reason when refused', async () => {
  setTimeout(() => {
    const [path] = [...FS.__store.keys()].filter((p) => p.startsWith('stockOps/'));
    FS.__store.set(path, { ...FS.__store.get(path), status: 'rejected', reason: 'Only 1 in stock' });
  }, 50);
  await assert.rejects(() => StockOps.runStockOpOrThrow(db, { uid: 't1' }, { type: 'consume', lines: [{ partId: 'sp1', qty: 5 }] }),
    (e) => e.message === 'Only 1 in stock' && e.stockOp.status === 'rejected');
});

test('RMA list: tabs filter by status, customer text escaped; raising needs ticket + reason and a real ticket', async () => {
  FS.__seed('rmaRequests/r1', { rmaId: 'PE-RMA-1', status: 'requested', customerName: XSS, sourceTicketId: 'PE-CR-1', serialNumber: 'SN-9', createdAt: ts('2026-10-01T00:00:00Z') });
  FS.__seed('rmaRequests/r2', { rmaId: 'PE-RMA-2', status: 'sent_to_brand', customerName: 'Done Person', createdAt: ts('2026-10-02T00:00:00Z') });
  FS.__seed('centerRequests/c1', { requestId: 'PE-CR-77', customerName: 'Asha', customerPhone: '9000000001', product: 'Geyser', serialNumber: 'SN-77' });
  const box = el();
  await Rma.renderRmaList(box, { db, user: { uid: 'sc1', email: 'sc@x.in' }, allowRaise: true });
  let t = text(box);
  assert.ok(t.includes('PE-RMA-1') && !t.includes('PE-RMA-2'), 'requested tab');
  assertNoInjectedMarkup(assert, box, 'rma list');
  box.querySelector('[data-tab="done"]').dispatchEvent(new window.Event('click'));
  await settle();
  t = text(box);
  assert.ok(t.includes('PE-RMA-2') && !t.includes('PE-RMA-1'), 'done tab');
  const raise = el();
  await Rma.renderRmaList(raise, { db, user: { uid: 'sc1', email: 'sc@x.in' }, allowRaise: true });
  raise.querySelector('#rma-raise').dispatchEvent(new window.Event('click'));
  await settle();
  assert.match(raise.querySelector('#rma-raise-err').textContent, /ticket ID and a reason/);
  raise.querySelector('#rma-ticket').value = 'PE-CR-NOPE';
  raise.querySelector('#rma-reason').value = 'Tank burst';
  raise.querySelector('#rma-raise').dispatchEvent(new window.Event('click'));
  await settle();
  assert.match(raise.querySelector('#rma-raise-err').textContent, /No service ticket/);
  raise.querySelector('#rma-ticket').value = 'PE-CR-77';
  raise.querySelector('#rma-raise').dispatchEvent(new window.Event('click'));
  await settle(20);
  const created = [...FS.__store.entries()].find(([p, d]) => p.startsWith('rmaRequests/') && d.sourceTicketId === 'PE-CR-77');
  assert.ok(created, 'RMA created');
  const d = created[1];
  assert.ok(/^PE-RMA-\d{8}-0001$/.test(d.rmaId), 'numbered ' + d.rmaId);
  assert.strictEqual(d.status, 'requested');
  assert.strictEqual(d.serialNumber, 'SN-77');
  assert.strictEqual(d.sourceJobCollection, 'centerRequests');
  assert.strictEqual(d.raisedByUid, 'sc1');
  assert.ok(Rma.RMA_STATUS_LABELS.replacement_dispatched, 'labels exported');
});
