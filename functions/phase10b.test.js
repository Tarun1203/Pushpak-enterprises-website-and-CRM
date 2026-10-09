// Phase 10 items 6-10: technician readiness, warehouse readiness, business
// documents, print/export layouts. Pure modules only - no Firebase.
const test = require('node:test');
const assert = require('node:assert');
const Docs = require('../crm/documents.js');
const Match = require('./technicianMatch');
const Spares = require('./spares');
const fs = require('fs');

const HOSTILE = '<img src=x onerror=alert(1)>"\'&';
const REG = { registrationId: 'PE-REG-1', customerName: HOSTILE, customerPhone: '98450 12345', product: 'Geyser 25L', serialNumber: 'SN<1>', purchaseDate: '2026-01-31', warrantyMonths: 24, brand: 'MakWell', warrantyComponents: [{ componentName: 'Element', durationYears: 5 }, { componentName: HOSTILE, durationYears: 1 }] };
const TKT = { requestId: 'PE-SR-1', customerName: 'Ravi', customerPhone: '9845012345', address: HOSTILE, product: 'Cooler', issue: HOSTILE, status: 'in_progress', technicianName: 'Tech', scheduledDate: '2026-12-01', scheduledStartTime: '10:00', scheduledEndTime: '11:00', warrantyStatus: 'out_of_warranty', billingType: 'customer', sparePartsCost: 500, serviceCharge: 250, otherCharges: 0, billingTotal: 750 };
const CLAIM = { claimId: 'PE-CL-1', claimantName: HOSTILE, claimantType: 'servicecenter', amount: 1500, approvedAmount: 1400, status: 'approved', ticketIds: ['a', 'b'] };
const SR = { requestId: 'PE-SP-1', item: 'Element', dispatchedQty: 3, transport: { transporter: HOSTILE, docket: 'D123', vehicle: 'KA36', dispatchDate: '2026-11-02' } };
const CASES = { warranty: REG, voucher: TKT, claim: CLAIM, challan: SR };

test('P10.8 every document renders with its key facts', () => {
  const w = Docs.render('warranty', REG, 'a4');
  assert.match(w, /PE-REG-1/); assert.match(w, /Geyser 25L/); assert.match(w, /24 months/);
  assert.match(w, /31 Jan 2028|01 Feb 2028|Jan 2028/, 'valid-until date is computed from purchase + months');
  assert.match(w, /Element/); assert.match(w, /5 yr/);
  const v = Docs.render('voucher', TKT, 'a5');
  assert.match(v, /PE-SR-1/); assert.match(v, /Charges/); assert.match(v, /750\.00/); assert.match(v, /Customer signature/);
  const c = Docs.render('claim', CLAIM, 'a4');
  assert.match(c, /PE-CL-1/); assert.match(c, /1,500\.00/); assert.match(c, /1,400\.00/); assert.match(c, /2 item/);
  const d = Docs.render('challan', SR, 'thermal');
  assert.match(d, /D123/); assert.match(d, /KA36/); assert.match(d, /Received by/);
});

test('P10.8 warranty-covered ticket shows no customer charge', () => {
  const h = Docs.render('voucher', { requestId: 'X1', warrantyStatus: 'in_warranty', billingType: 'claim', status: 'closed' }, 'a6');
  assert.match(h, /No charge to the customer/); assert.doesNotMatch(h, /Spare parts/);
});

test('P10.8 hostile text is escaped in every document and size', () => {
  for (const [kind, data] of Object.entries(CASES)) for (const size of Object.keys(Docs.SIZES)) {
    const h = Docs.render(kind, data, size);
    assert.ok(!h.includes('<img src=x'), `${kind}/${size} leaked markup`);
    assert.ok(!/onerror=alert\(1\)>/.test(h.replace(/&lt;img[^]*?&gt;/g, '')), `${kind}/${size} leaked handler`);
  }
});

test('P10.8 missing data prints a dash, never "undefined" or "null"', () => {
  for (const kind of Object.keys(CASES)) {
    const h = Docs.render(kind, {}, 'a4');
    assert.doesNotMatch(h, /undefined|null|NaN|Invalid Date/, kind);
  }
  assert.doesNotThrow(() => Docs.render('voucher', null, 'a4'));
});

test('P10.9 page sizes: A4/A5/A6/thermal set the right @page and a phone viewport', () => {
  const page = (s) => Docs.render('voucher', TKT, s).match(/@page\{size:([^;]+);margin:([^}]+)\}/);
  assert.deepStrictEqual([page('a4')[1], page('a5')[1], page('a6')[1], page('thermal')[1]], ['210mm 297mm', '148mm 210mm', '105mm 148mm', '80mm 200mm']);
  for (const s of Object.keys(Docs.SIZES)) {
    const h = Docs.render('voucher', TKT, s);
    assert.match(h, /<meta name="viewport" content="width=device-width,initial-scale=1">/);
    assert.match(h, /@media print\{.*\.bar\{display:none\}/, 'toolbar hidden when printing');
    assert.match(h, /max-width:\d+px/, 'screen width capped');
    assert.match(h, /overflow-wrap:anywhere/, 'long words wrap');
  }
  assert.strictEqual(Docs.render('voucher', TKT, 'bogus').includes('210mm 297mm'), true, 'unknown size falls back to A4');
  assert.throws(() => Docs.render('nope', {}, 'a4'));
  assert.ok(parseInt(Docs.render('voucher', TKT, 'thermal').match(/max-width:(\d+)px/)[1], 10) <= 320, 'thermal fits a 320px phone');
});

test('P10.9 WhatsApp text and links', () => {
  assert.match(Docs.text('voucher', TKT), /\*Service PE-SR-1\*/);
  assert.match(Docs.text('warranty', REG), /Warranty card PE-REG-1/);
  assert.strictEqual(Docs.waLink('+91 98450-12345', 'a b'), 'https://wa.me/919845012345?text=a%20b');
  assert.strictEqual(Docs.waLink('12345', 'x'), null, 'short number');
  assert.strictEqual(Docs.waLink('5845012345', 'x'), null, 'not a mobile number');
  assert.strictEqual(Docs.waLink('', 'x'), null);
});

test('P10.9 download file names are safe', () => {
  assert.strictEqual(Docs.fileName('voucher', { requestId: '../a b/c' }, 'a4'), '.._a_b_c-a4.html');
  assert.strictEqual(Docs.fileName('claim', {}, 'a6'), 'claim-a6.html');
});

test('P10.9 invoice print has an A4 @page rule and the pages load documents.js', () => {
  assert.match(fs.readFileSync(__dirname + '/../crm/tradeFinance.js', 'utf8'), /@page\{size:A4/);
  for (const [page, kinds] of Object.entries({ 'CRMservicecenter.html': ['voucher'], 'CRMtechnician.html': ['voucher'], 'CRMwarehouse.html': ['challan', 'claim'], 'CRMsuperadmin.html': ['warranty', 'voucher', 'claim'] })) {
    const h = fs.readFileSync(__dirname + '/../crm/' + page, 'utf8');
    assert.match(h, /<script src="documents.js"><\/script>/, page);
    for (const k of kinds) assert.match(h, new RegExp(`PEDocs.attach\\([^)]*'${k}'`), `${page} ${k}`);
  }
});

// ---- item 6: technician readiness ----
const roster = [
  { id: 'r1', name: 'Amit', technicianUid: 'u1', employmentStatus: 'ACTIVE', productCapabilities: [{ brand: 'MakWell', category: 'Geyser', certified: true }] },
  { id: 'r2', name: 'Bala', technicianUid: 'u2', employmentStatus: 'ACTIVE', productCapabilities: [{ brand: 'Skevia', category: 'Cooler' }] },
  { id: 'r3', name: 'Chet', technicianUid: 'u3', employmentStatus: 'SUSPENDED', productCapabilities: [{ brand: 'MakWell' }] },
  { id: 'r4', name: 'Dev', technicianUid: 'u4', employmentStatus: 'ACTIVE', productCapabilities: [{ brand: 'MakWell' }] },
];
const rank = (extra = {}) => Match.rankTechnicians({ ticket: { brand: 'MakWell', category: 'Geyser' }, roster, today: '2026-12-01', date: '2026-12-02', users: {}, avail: {}, openCounts: {}, ...extra });

test('P10.6 technician ranking: brand, skills, availability, workload', () => {
  const out = rank({ avail: { u1: { status: 'available' }, u4: { status: 'available' } }, openCounts: { u4: 4 } });
  assert.strictEqual(out[0].name, 'Amit', 'certified + brand + category + free wins');
  const byName = Object.fromEntries(out.map((o) => [o.name, o]));
  assert.strictEqual(byName.Bala.eligible, false); assert.match(byName.Bala.excludedReason, /brand/);
  assert.strictEqual(byName.Chet.eligible, false); assert.match(byName.Chet.excludedReason, /suspended/);
  assert.ok(byName.Dev.score < byName.Amit.score, 'a loaded technician ranks lower');
  assert.ok(byName.Dev.warnings.some((w) => /category|skills/.test(w)), 'missing skill is a warning, not a block');
});

test('P10.6 technician on leave, holiday, expired contract or suspended is never eligible', () => {
  const lv = rank({ avail: { u1: { status: 'leave' } } }).find((o) => o.name === 'Amit');
  assert.strictEqual(lv.eligible, false);
  const hol = rank({ avail: { u1: { status: 'holiday' } } }).find((o) => o.name === 'Amit');
  assert.strictEqual(hol.eligible, false);
  const sus = rank({ avail: { u1: { suspended: true } } }).find((o) => o.name === 'Amit');
  assert.match(sus.excludedReason, /suspended/);
  const appr = rank({ roster: [{ ...roster[0], leaveRecords: [{ status: 'APPROVED', startDate: '2026-12-01', endDate: '2026-12-03' }] }] })[0];
  assert.strictEqual(appr.eligible, false);
  const pend = rank({ roster: [{ ...roster[0], leaveRecords: [{ status: 'PENDING', startDate: '2026-12-01', endDate: '2026-12-03' }] }] })[0];
  assert.strictEqual(pend.eligible, true, 'pending leave does not block');
  const busy = rank({ avail: { u1: { status: 'in_progress' } } }).find((o) => o.name === 'Amit');
  assert.ok(busy.eligible && busy.warnings.includes('busy now'));
});

// ---- item 7: warehouse / spares ----
test('P10.7 stock operations never go negative and move both sides of a transfer', () => {
  const actor = { role: 'servicecenter', uid: 'sc1', techUid: 't1' };
  const ch = Spares.stockChanges('transfer_to_technician', [{ partId: 'p1', qty: 3 }], actor);
  assert.strictEqual(ch.length, 2); assert.strictEqual(ch[0].delta + ch[1].delta, 0);
  const have = { [Spares.invDocId('servicecenter', 'sc1', 'p1')]: 2 };
  const r = Spares.applyChanges(ch, have, { p1: 'Element' });
  assert.match(r.error, /Only 2 of Element/);
  const ok = Spares.applyChanges(ch, { [Spares.invDocId('servicecenter', 'sc1', 'p1')]: 5 }, {});
  assert.strictEqual(ok.next[Spares.invDocId('servicecenter', 'sc1', 'p1')], 2);
  assert.strictEqual(ok.next[Spares.invDocId('technician', 't1', 'p1')], 3);
  assert.match(Spares.applyChanges(Spares.stockChanges('consume', [{ partId: 'p1', qty: 1 }], { role: 'technician', uid: 't1' }), {}, {}).error, /Spare Bag/);
});

test('P10.7 inventory is isolated per owner: one center cannot touch another center stock', () => {
  const a = Spares.stockChanges('consume', [{ partId: 'p1', qty: 1 }], { role: 'servicecenter', uid: 'A' });
  const cur = { [Spares.invDocId('servicecenter', 'B', 'p1')]: 50 };
  assert.ok(Spares.applyChanges(a, cur, {}).error, "A has none even though B has 50");
  assert.notStrictEqual(Spares.invDocId('servicecenter', 'A', 'p1'), Spares.invDocId('technician', 'A', 'p1'));
});

test('P10.7 line validation rejects bad quantities, duplicates and empties', () => {
  for (const bad of [[], null, [{ partId: 'a', qty: 0 }], [{ partId: 'a', qty: 1.5 }], [{ partId: 'a', qty: 1001 }], [{ partId: 'a', qty: 1 }, { partId: 'a', qty: 1 }], [{ qty: 1 }], Array.from({ length: 21 }, (_, i) => ({ partId: 'p' + i, qty: 1 }))]) assert.ok(Spares.validateOpLines(bad), JSON.stringify(bad));
  assert.strictEqual(Spares.validateOpLines([{ partId: 'a', qty: 1 }]), null);
});

test('P10.7 return ids and defective due dates are deterministic (IST)', () => {
  assert.strictEqual(Spares.returnId(new Date('2026-12-01T20:00:00Z'), 7, 'SC'), 'PE-RT-20261202-0007-SC');
  assert.ok(Spares.defectiveDueDate(new Date('2026-12-01T00:00:00Z')) > new Date('2026-12-01T00:00:00Z'));
});
