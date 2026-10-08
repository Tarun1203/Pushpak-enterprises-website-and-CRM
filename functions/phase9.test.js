// Phase 9 — end-to-end business workflow, items 1-5: registration, warranty
// lifecycle, service request, routing, and the Customer 360 data they feed.
// Runs the real index.js functions against the in-memory Firestore stand-in
// (testsupport/fakefs.js), driving the triggers the way Firestore would.
// (Transactions in the stand-in do not race each other, so "two at the same
// moment" is tested through the lock the loser would hit.)
const Module = require('module');
const fake = require('./testsupport/fakefs');
const orig = Module._load;
const wrap = (opts, handler) => ({ opts, handler });
Module._load = function (req, ...a) {
  if (req === 'firebase-admin/app') return { initializeApp() {} };
  if (req === 'firebase-admin/firestore') return { getFirestore: () => fake.db, FieldValue: fake.FieldValue, Timestamp: fake.Timestamp };
  if (req === 'firebase-functions/v2/firestore') return new Proxy({}, { get: () => wrap });
  if (req === 'firebase-functions/v2/scheduler') return { onSchedule: wrap };
  if (req === 'firebase-functions/v2/https') return { onCall: wrap, HttpsError: class HttpsError extends Error { constructor(code, msg) { super(msg); this.code = code; } } };
  return orig.call(this, req, ...a);
};
const F = require('./index.js');
const Billing = require('./billing');
const { store, DocRef, Snap, Timestamp } = fake;
const test = require('node:test');
const assert = require('node:assert');
const get = (p) => store.get(p);
const ref = (p) => { const [c, id] = p.split('/'); return new DocRef(c, id); };
const set = (p, d) => store.set(p, d);
const ok = (cond, msg) => assert.ok(cond, msg);
const all = (coll, pred = () => true) => [...store.entries()].filter(([p, d]) => p.startsWith(coll + '/') && pred(d)).map(([p, d]) => ({ path: p, ...d }));
async function created(fn, p, params = {}) { await F[fn].handler({ data: new Snap(ref(p)), params: { ...params } }); }
async function updated(fn, p, change, params = {}) {
  const before = new Snap(ref(p));
  set(p, { ...get(p), ...change });
  await F[fn].handler({ data: { before, after: new Snap(ref(p)) }, params });
}

// Dates relative to today, as YYYY-MM-DD.
const isoMonthsAgo = (m, extraDays = 0) => { const d = new Date(); d.setMonth(d.getMonth() - m); d.setDate(d.getDate() - extraDays); return d.toISOString().slice(0, 10); };
const tok = (uid, phone) => ({ uid, token: { phone_number: '+91' + phone } });
const RP = (auth, data) => F.registerProduct.handler({ auth, data, rawRequest: { ip: '9.9.9.9' } });
const BS = (auth, data) => F.bookService.handler({ auth, data, rawRequest: { ip: '9.9.9.9' } });
const contact = { name: 'Customer', address: '5 Park St', city: 'Raichur', state: 'Karnataka', pincode: '584101' };
const reg = (over = {}) => ({ brand: 'MakWell', categoryId: 'geyser', category: 'Geyser', modelNo: 'G15', serialNumber: '', purchaseDate: isoMonthsAgo(1), ...contact, ...over });
const book = (over = {}) => ({ requestType: 'service', issueDescription: 'Not heating', ...contact, ...over });
const regDocOf = (id) => all('productRegistrations', (d) => d.registrationId === id)[0];

function customer(uid, phone, name = 'Customer') { set(`users/${uid}`, { role: 'customer', phone10: phone, name }); return tok(uid, phone); }

// ---------------------------------------------------------------------
// Item 2 — Product registration
// ---------------------------------------------------------------------
test('P9.2 registration: serial rules, plan-based warranty, server ids, forged fields ignored', async () => {
  set('warrantyPlans/wpG', {
    brandId: 'makwell', categoryId: 'geyser', status: 'active',
    components: [{ componentName: 'Full Product', durationYears: 2 }, { componentName: 'Heating Element', durationYears: 5 }]
  });
  const c = customer('p9c1', '9100000001');

  // Validation: every refusal says why, and nothing is written.
  const before = all('productRegistrations').length;
  const bad = [
    [{ brand: 'Nobody' }, /brand/i], [{ category: '', categoryId: '' }, /category/i], [{ modelNo: '' }, /model/i],
    [{ purchaseDate: '' }, /purchase date/i], [{ purchaseDate: '31-12-2025' }, /purchase date/i], [{ purchaseDate: '2026-02-30' }, /purchase date/i],
    [{ purchaseDate: '2999-01-01' }, /future/i], [{ purchaseDate: '2001-01-01' }, /too old/i],
    [{ serialNumber: 'a b' }, /serial/i], [{ serialNumber: 'ab' }, /serial/i], [{ serialNumber: '<script>x</script>' }, /serial/i],
    [{ name: '' }, /name/i], [{ address: '' }, /address/i], [{ city: '' }, /city/i], [{ pincode: '12345' }, /pincode/i], [{ pincode: '084101' }, /pincode/i]
  ];
  for (const [over, re] of bad) await assert.rejects(() => RP(c, reg({ serialNumber: 'OK-0001', ...over })), re, JSON.stringify(over));
  ok(all('productRegistrations').length === before, 'refused registrations write nothing');

  // A good one: serial upper-cased, whole-product cover from the plan, components kept.
  const r1 = await RP(c, reg({ serialNumber: ' p9-geyser-1 ', purchaseDate: isoMonthsAgo(3),
    // forged fields the browser might add — none of them may stick
    customerPhone: '9999999999', customerUid: 'someone-else', status: 'void', warrantyMonths: 999, registrationId: 'PE-REG-FAKE', source: 'public-site' }));
  const d1 = regDocOf(r1.registrationId);
  ok(/^PE-REG-\d{8}-\d{4}-Portal$/.test(r1.registrationId), 'server-made id ' + r1.registrationId);
  ok(d1.serialNumber === 'P9-GEYSER-1', 'serial normalised');
  ok(d1.warrantyMonths === 24, 'whole-product cover comes from the plan, not a fixed 12 (got ' + d1.warrantyMonths + ')');
  ok(d1.warrantyComponents.map((x) => x.componentName).join() === 'Full Product,Heating Element', 'component cover kept');
  ok(d1.customerPhone === '9100000001' && d1.customerUid === 'p9c1' && d1.status === 'active' && d1.source === 'portal' && d1.registrationId === r1.registrationId, 'phone, owner, status and id are the server\'s');
  ok(get('registrationSerials/P9-GEYSER-1').registrationId === r1.registrationId, 'the serial is locked to this registration');

  // No plan for the product -> the standard 12 months.
  const r2 = await RP(c, reg({ brand: 'Flyvision', categoryId: 'tv', category: 'LED TV', modelNo: 'F43', serialNumber: 'P9-TV-1' }));
  ok(regDocOf(r2.registrationId).warrantyMonths === 12 && regDocOf(r2.registrationId).warrantyPlanId === null, 'no plan -> 12 months');
  // A plan with only part lines (no whole-product line) also falls back to 12.
  set('warrantyPlans/wpW', { brandId: 'skevia', categoryId: 'wm', status: 'active', components: [{ componentName: 'Motor', durationYears: 10 }] });
  const r3 = await RP(c, reg({ brand: 'Skevia', categoryId: 'wm', category: 'Washing Machine', modelNo: 'W7', serialNumber: 'P9-WM-1' }));
  ok(regDocOf(r3.registrationId).warrantyMonths === 12, 'part-only plan -> 12 months overall');
  // Inactive plans are ignored.
  set('warrantyPlans/wpOff', { brandId: 'flyvision', categoryId: 'ac', status: 'inactive', components: [{ componentName: 'Full Product', durationYears: 9 }] });
  const r4 = await RP(c, reg({ brand: 'Flyvision', categoryId: 'ac', category: 'AC', modelNo: 'A1', serialNumber: 'P9-AC-1' }));
  ok(regDocOf(r4.registrationId).warrantyMonths === 12, 'inactive plan ignored');

  // Ids are unique and count up inside the month.
  const seqs = [r1, r2, r3, r4].map((r) => Number(r.registrationId.split('-')[3]));
  ok(new Set(seqs).size === 4 && seqs.every((n, i) => i === 0 || n === seqs[i - 1] + 1), 'sequence ' + seqs.join());

  // The registration trigger leaves a clean record verified-or-not, never a duplicate flag.
  await created('checkRegistrationSerial', regPath(r1.registrationId), { regId: regPath(r1.registrationId).split('/')[1] });
  ok(get(regPath(r1.registrationId)).serialCheck.status === 'not_found', 'serial never received into stock is flagged for Head Office, not blocked');
});
const regPath = (id) => all('productRegistrations', (d) => d.registrationId === id)[0].path;

test('P9.2 one registration per serial, however it arrived (portal, dealer, website, same moment)', async () => {
  const a = customer('p9a', '9100000011'), b = customer('p9b', '9100000012');
  await RP(a, reg({ serialNumber: 'DUP-0001' }));
  await assert.rejects(() => RP(a, reg({ serialNumber: 'dup-0001' })), /already registered this serial/);
  await assert.rejects(() => RP(b, reg({ serialNumber: ' Dup-0001 ' })), /already registered/);

  // The loser of a same-moment race: the winner holds the lock, no registration is visible yet.
  set('registrationSerials/RACE-0001', { registrationId: 'PE-REG-WINNER', docId: 'x' });
  const count = all('productRegistrations').length;
  const seqBefore = JSON.stringify(get(`counters/productreg-${F.__ym || ''}`));
  await assert.rejects(() => RP(b, reg({ serialNumber: 'race-0001' })), /already registered/);
  ok(all('productRegistrations').length === count, 'loser writes no registration');
  ok(JSON.stringify(get(`counters/productreg-${F.__ym || ''}`)) === seqBefore, 'loser does not use up an id');

  // A dealer registered it first, typing the serial in lower case and with spaces.
  set('productRegistrations/dl1', { registrationId: 'PE-REG-DEALER-1', dealerUid: 'dealerX', customerPhone: '9100000099', customerName: 'Walk-in', product: 'MakWell Geyser', serialNumber: ' dl-5555 ', purchaseDate: isoMonthsAgo(2), warrantyMonths: 12 });
  await created('checkRegistrationSerial', 'productRegistrations/dl1', { regId: 'dl1' });
  ok(get('productRegistrations/dl1').serialNumber === 'DL-5555', 'dealer\'s serial stored in the one standard form');
  ok(get('registrationSerials/DL-5555').registrationId === 'PE-REG-DEALER-1', 'dealer registration owns the serial');
  await assert.rejects(() => RP(a, reg({ serialNumber: 'dl-5555' })), /already registered/);
  // Warranty check by the buyer's own serial now finds the dealer's registration.
  const w = await F.checkWarranty.handler({ auth: b, data: { serial: 'dl-5555' }, rawRequest: { ip: '9.9.9.9' } });
  ok(w.state === 'registered_other' && !JSON.stringify(w).includes('Walk-in'), 'taken, and nothing about the owner is shown');

  // Two dealer entries for one serial: the later one is flagged, the first keeps the serial.
  set('productRegistrations/dl2', { registrationId: 'PE-REG-DEALER-2', dealerUid: 'dealerY', customerPhone: '9100000098', customerName: 'Other', product: 'MakWell Geyser', serialNumber: 'DL-5555', purchaseDate: isoMonthsAgo(1), warrantyMonths: 12 });
  await created('checkRegistrationSerial', 'productRegistrations/dl2', { regId: 'dl2' });
  ok(get('productRegistrations/dl2').serialCheck.status === 'duplicate_serial' && /PE-REG-DEALER-1/.test(get('productRegistrations/dl2').serialCheck.note), 'second claim on a serial is flagged');
  ok(get('registrationSerials/DL-5555').registrationId === 'PE-REG-DEALER-1', 'first owner keeps the lock');
  // Re-running the trigger (a retry) changes nothing for the owner.
  await created('checkRegistrationSerial', 'productRegistrations/dl1', { regId: 'dl1' });
  ok(get('productRegistrations/dl1').serialCheck.status !== 'duplicate_serial', 'a retry does not flag the owner as its own duplicate');
});

// ---------------------------------------------------------------------
// Item 3 — Warranty lifecycle
// ---------------------------------------------------------------------
test('P9.3 warranty lifecycle: in warranty, expired, component cover, and what it does to billing', async () => {
  set('warrantyPlans/wpL', {
    brandId: 'makwell', categoryId: 'heater', status: 'active',
    components: [{ componentName: 'Full Product', durationYears: 2 }, { componentName: 'Heating Element', durationYears: 5 }]
  });
  const c = customer('p9w', '9100000021');
  const heater = (serial, months) => reg({ categoryId: 'heater', category: 'Heater', serialNumber: serial, purchaseDate: isoMonthsAgo(months) });

  // Intake read at booking time, for registrations of different ages.
  const intake = async (registrationId) => {
    const b = await BS(c, book({ registrationId }));
    await created('enrich_publicServiceRequests', 'publicServiceRequests/' + b.requestId, { docId: b.requestId });
    return { id: b.requestId, w: get('publicServiceRequests/' + b.requestId).intakeWarranty };
  };
  const young = await RP(c, heater('P9-W-YOUNG', 18));   // 2y plan, bought 18 months ago
  const old = await RP(c, heater('P9-W-OLD', 26));       // 2y plan, bought 26 months ago
  const iy = await intake(young.registrationId);
  ok(iy.w.status === 'in_warranty' && iy.w.source === 'registration', 'bought 18 months ago, 2-year plan -> in warranty (was wrongly out at 12 months)');
  const io = await intake(old.registrationId);
  ok(io.w.status === 'out_of_warranty' && io.w.source === 'registration', 'bought 26 months ago -> out of warranty');
  ok(/^\d{4}-\d{2}-\d{2}$/.test(iy.w.expiresOn) && iy.w.expiresOn > new Date().toISOString().slice(0, 10), 'expiry date shown and in the future');
  // Not registered: the purchase date typed on the booking gives a first read at the standard 12 months.
  const noReg = await BS(c, book({ brand: 'MakWell', category: 'Heater', purchaseDate: isoMonthsAgo(5) }));
  await created('enrich_publicServiceRequests', 'publicServiceRequests/' + noReg.requestId, { docId: noReg.requestId });
  ok(get('publicServiceRequests/' + noReg.requestId).intakeWarranty.source === 'ticket-purchase-date' && get('publicServiceRequests/' + noReg.requestId).intakeWarranty.status === 'in_warranty', 'unregistered: typed purchase date, 12 months');
  const none = await BS(c, book({ brand: 'MakWell', category: 'Heater' }));
  await created('enrich_publicServiceRequests', 'publicServiceRequests/' + none.requestId, { docId: none.requestId });
  ok(get('publicServiceRequests/' + none.requestId).intakeWarranty.status === 'unknown', 'nothing on file -> unknown, not a guess');

  // Closure billing. The OLD registration is past its 2-year cover, but the heating element has 5 years.
  set(`serviceChargeRates/${Billing.rateCardKey('default', null, 'Heater', 'repair', null)}`, { amount: 400 });
  set('spareParts/sp-heat', { name: 'Heating Element' });
  set('spareParts/sp-knob', { name: 'Control Knob' });
  const closeJob = async (id, regId, serial, partId) => {
    set(`serviceJobs/${id}`, { jobId: id, technicianUid: 'tCl', status: 'in_progress', category: 'Heater', type: 'service', customerPhone: '9100000021', linkedRegistrationId: regId, serialNumber: serial });
    if (partId) set(`returns/ret-${id}`, { sourceJobId: id, partId });
    await updated('billOnClose_serviceJobs', `serviceJobs/${id}`,
      { status: 'completed', closureCode: 'REPAIRED', actionTaken: 'Fixed', partsUsedNotes: 'n/a', closedByUid: 'tCl' }, { docId: id });
    return get(`serviceJobs/${id}`);
  };
  // Booked from a registration that has no serial (so the serial cannot find it) — the link must.
  const noSerial = await RP(c, reg({ categoryId: 'heater', category: 'Heater', serialNumber: '', purchaseDate: isoMonthsAgo(26) }));
  let j = await closeJob('JOB-W1', old.registrationId, 'P9-W-OLD', 'sp-heat');
  ok(j.warrantyStatus === 'in_warranty', 'element has 5-year cover -> in warranty even though the 2-year product cover ended');
  ok(get('walletTransactions/credit_serviceJobs_JOB-W1').amount === 400, 'in-warranty job credits the technician the rate-card amount');
  j = await closeJob('JOB-W2', old.registrationId, 'P9-W-OLD', 'sp-knob');
  ok(j.warrantyStatus === 'out_of_warranty', 'a part with no component cover falls back to the expired product cover');
  ok(!get('walletTransactions/credit_serviceJobs_JOB-W2'), 'no credit for an out-of-warranty job');
  j = await closeJob('JOB-W3', young.registrationId, 'P9-W-YOUNG', 'sp-knob');
  ok(j.warrantyStatus === 'in_warranty', 'young registration: whole-product cover still running');
  j = await closeJob('JOB-W4', noSerial.registrationId, '', 'sp-heat');
  ok(j.warrantyStatus === 'in_warranty', 'registration found through the booking link when the product has no serial number');
  j = await closeJob('JOB-W5', null, 'P9-UNKNOWN', null);
  ok(!j.warrantyStatus, 'no registration and no purchase date -> no verdict is invented');
  // The verdict is made once and cannot be re-run to change the outcome.
  const credits = all('walletTransactions').length;
  await updated('billOnClose_serviceJobs', 'serviceJobs/JOB-W1', { status: 'completed' }, { docId: 'JOB-W1' });
  ok(all('walletTransactions').length === credits, 'no second credit');
});

// ---------------------------------------------------------------------
// Item 4 — Service request
// ---------------------------------------------------------------------
test('P9.4 service request: validation, server-built record, linked product, forged fields ignored, duplicates flagged, tracked', async () => {
  const c = customer('p9s', '9100000031'), other = customer('p9s2', '9100000032');
  const r = await RP(c, reg({ serialNumber: 'P9-SR-1', modelNo: 'G25' }));
  const before = all('publicServiceRequests').length;
  const bad = [
    [{ issueDescription: '' }, /problem/i], [{ issueDescription: '   ' }, /problem/i],
    [{ registrationId: '', brand: '', category: '' }, /brand/i], [{ registrationId: '', brand: 'MakWell', category: '' }, /category/i],
    [{ registrationId: '', brand: 'MakWell', category: 'Geyser', serialNumber: '!!' }, /serial/i],
    [{ name: '' }, /name/i], [{ address: '' }, /address/i], [{ city: '' }, /city/i], [{ pincode: '99' }, /pincode/i],
    [{ registrationId: 'PE-REG-NOPE' }, /not registered to your account/i]
  ];
  for (const [over, re] of bad) await assert.rejects(() => BS(c, book({ registrationId: r.registrationId, ...over })), re, JSON.stringify(over));
  await assert.rejects(() => BS(other, book({ registrationId: r.registrationId })), /not registered to your account/);
  ok(all('publicServiceRequests').length === before, 'refused requests create no ticket');

  const b1 = await BS(c, book({
    registrationId: r.registrationId, issueDescription: '  Water leaking  ',
    customerPhone: '9888888888', customerUid: 'x', status: 'completed', requestId: 'PE-SVC-FAKE', brand: 'Skevia', serialNumber: 'OTHER-1', source: 'staff', routing: { status: 'routed' }
  }));
  const t = get('publicServiceRequests/' + b1.requestId);
  ok(/^PE-SVC-\d{8}-\d{4}-Portal$/.test(b1.requestId) && t.requestId === b1.requestId, 'server-made id, same on the document');
  ok(t.status === 'new' && t.source === 'portal' && !t.routing && t.customerPhone === '9100000031' && t.customerUid === 'p9s', 'status, source, routing, phone and owner are the server\'s');
  ok(t.brand === 'MakWell' && t.serialNumber === 'P9-SR-1' && t.modelNo === 'G25' && t.linkedRegistrationId === r.registrationId && t.issueDescription === 'Water leaking', 'product details come from the registration, not the form');
  ok(t.product === regDocOf(r.registrationId).product, 'same product name as registered');

  await created('enrich_publicServiceRequests', 'publicServiceRequests/' + b1.requestId, { docId: b1.requestId });
  ok(get('publicServiceRequests/' + b1.requestId).possibleDuplicateOf.length === 0, 'the first booking is not a duplicate of anything');
  // Installation needs no problem description.
  const inst = await BS(c, book({ registrationId: r.registrationId, requestType: 'installation', issueDescription: '' }));
  ok(get('publicServiceRequests/' + inst.requestId).requestType === 'installation', 'installation request');
  // Unregistered product: manual details are kept as typed (serial normalised).
  const manual = await BS(c, book({ brand: 'Flyvision', category: 'LED TV', modelNo: 'F43', serialNumber: 'tv-77', purchaseDate: isoMonthsAgo(2) }));
  ok(get('publicServiceRequests/' + manual.requestId).serialNumber === 'TV-77' && get('publicServiceRequests/' + manual.requestId).linkedRegistrationId === null, 'unregistered product booking');

  // A second booking for the same unit while the first is open is flagged for the person who routes it.
  const b2 = await BS(c, book({ registrationId: r.registrationId, issueDescription: 'Still leaking' }));
  await created('enrich_publicServiceRequests', 'publicServiceRequests/' + b2.requestId, { docId: b2.requestId });
  ok(get('publicServiceRequests/' + b2.requestId).possibleDuplicateOf.includes(b1.requestId), 'duplicate flagged with the original ticket id');

  // Every request is tracked for the customer, without personal details, and ids are unique.
  for (const id of [b1.requestId, inst.requestId, manual.requestId, b2.requestId]) {
    await created('trackOnPublicRequest', 'publicServiceRequests/' + id, { docId: id });
    const tr = get('customerTracking/' + id);
    ok(tr && tr.customerPhone === '9100000031' && tr.history[0].status === 'new' && !('address' in tr) && !('customerName' in tr), 'tracking for ' + id);
  }
  const ids = all('publicServiceRequests').map((d) => d.requestId);
  ok(new Set(ids).size === ids.length, 'every request id is unique');
});

// ---------------------------------------------------------------------
// Item 5 — Intelligent routing: pincode -> territory -> service center
// ---------------------------------------------------------------------
test('P9.5 routing: pincode, territory (district), brand, status, load — and what is left for a person', async () => {
  const center = (uid, over = {}, profile = 'ACTIVE') => { set(`users/${uid}`, { role: 'servicecenter', name: 'Center ' + uid, email: uid + '@pe.test', brandsAuthorized: ['makwell'], ...over }); if (profile) set(`serviceCenterProfiles/${uid}`, { status: profile }); };
  const request = (id, over = {}) => { set(`publicServiceRequests/${id}`, { requestId: id, customerName: 'Cust', customerPhone: '9100000041', address: 'A', city: 'C', pincode: '584101', brand: 'MakWell', category: 'Geyser', requestType: 'service', status: 'new', source: 'portal', createdAt: Timestamp.now(), ...over }); return created('routePublicServiceRequest', `publicServiceRequests/${id}`, { docId: id }); };
  const routedTo = (id) => (get(`centerRequests/route_${id}`) || {}).serviceCenterUid || null;
  const manualReason = (id) => (get(`publicServiceRequests/${id}`).routing || {}).reason;

  // Tier 1: the center lists the exact pincode.
  center('rA', { pincodesCovered: ['584101'] });
  await request('R1');
  ok(routedTo('R1') === 'rA' && get('publicServiceRequests/R1').routing.method === 'pincode' && get('publicServiceRequests/R1').status === 'assigned_to_center', 'exact pincode');
  const cr = get('centerRequests/route_R1');
  ok(cr.sourceRequestId === 'R1' && cr.requestId === 'R1' && cr.serviceCenterUid === 'rA' && cr.status === 'new', 'center ticket points back to the request and to the center by id');
  ok(all('centerRequests', (d) => d.requestId === 'R1').length === 1, 'exactly one center ticket per request');
  await created('routePublicServiceRequest', 'publicServiceRequests/R1', { docId: 'R1' });
  ok(all('centerRequests', (d) => d.requestId === 'R1').length === 1, 'running the router again does not duplicate');
  ok(all('notifications', (d) => d.recipientValue === 'rA').length === 1, 'center told once');

  // Tier 2: territory — pincode master gives the district, exactly one center covers it.
  set('pincodes/585201', { pincode: '585201', district: 'Kalaburagi', active: true });
  center('rD', { districtsCovered: ['kalaburagi'] });
  await request('R2', { pincode: '585201' });
  ok(routedTo('R2') === 'rD' && get('publicServiceRequests/R2').routing.method === 'district', 'district match through the pincode master');
  // Two centers cover the district: left for a person, both named.
  center('rD2', { districtsCovered: ['Kalaburagi'] });
  await request('R3', { pincode: '585201' });
  ok(!routedTo('R3') && manualReason('R3') === 'multiple_district_candidates' && get('publicServiceRequests/R3').routing.candidateUids.length === 2, 'ambiguous territory is not guessed');
  // A deactivated pincode in the master is not used for territory.
  set('pincodes/585202', { pincode: '585202', district: 'Kalaburagi', active: false });
  await request('R3b', { pincode: '585202' });
  ok(!routedTo('R3b'), 'inactive pincode master entry is not routed on');

  // Several centers list the exact pincode: the least busy wins, ties go to the lowest uid.
  center('rL1', { pincodesCovered: ['584300'] }); center('rL2', { pincodesCovered: ['584300'] });
  set('centerRequests/busy1', { serviceCenterUid: 'rL1', status: 'in_progress' }); set('centerRequests/busy2', { serviceCenterUid: 'rL1', status: 'assigned' });
  set('centerRequests/done1', { serviceCenterUid: 'rL2', status: 'closed' }); set('centerRequests/done2', { serviceCenterUid: 'rL2', status: 'completed' }); set('centerRequests/done3', { serviceCenterUid: 'rL2', status: 'cancelled' });
  await request('R4', { pincode: '584300' });
  ok(routedTo('R4') === 'rL2', 'closed tickets do not count as load; two open tickets lose to none');
  center('rT1', { pincodesCovered: ['584400'] }); center('rT2', { pincodesCovered: ['584400'] });
  await request('R5', { pincode: '584400' });
  ok(routedTo('R5') === 'rT1', 'equal load -> stable choice');

  // Brand / capability.
  center('rB', { pincodesCovered: ['584500'], brandsAuthorized: ['flyvision'] });
  await request('R6', { pincode: '584500', brand: 'MakWell' });
  ok(!routedTo('R6') && manualReason('R6') === 'brand_not_authorized', 'center covers the pincode but not the brand');
  await request('R6b', { pincode: '584500', brand: 'Flyvision' });
  ok(routedTo('R6b') === 'rB', 'same pincode, authorised brand');
  await request('R6c', { pincode: '584101', brand: 'FLYVISION' });
  ok(!routedTo('R6c'), 'brand is checked even where another brand\'s center exists');

  // Center status.
  center('rI', { pincodesCovered: ['584600'] }, 'INACTIVE');
  await request('R7', { pincode: '584600' });
  ok(!routedTo('R7'), 'inactive center skipped');
  center('rP', { pincodesCovered: ['584601'] }, 'PENDING_REVIEW');
  await request('R7b', { pincode: '584601' });
  ok(!routedTo('R7b'), 'center still in review skipped');
  center('rX', { pincodesCovered: ['584602'], accountType: 'temporary', contractEndDate: '2020-01-01' });
  await request('R8', { pincode: '584602' });
  ok(!routedTo('R8'), 'center with an expired contract skipped');
  center('rY', { pincodesCovered: ['584603'], accountType: 'temporary', contractEndDate: '2999-01-01' });
  await request('R8b', { pincode: '584603' });
  ok(routedTo('R8b') === 'rY', 'contract still running');

  // Nothing covers it / bad input: a person is told why.
  await request('R9', { pincode: '999999' });
  ok(!routedTo('R9') && manualReason('R9') === 'pincode_not_in_master', 'unknown pincode');
  set('pincodes/585999', { pincode: '585999', district: 'Nowhere', active: true });
  await request('R10', { pincode: '585999' });
  ok(!routedTo('R10') && manualReason('R10') === 'no_center_covers_district', 'known district, no center');
  await request('R11', { pincode: '' });
  ok(!routedTo('R11') && manualReason('R11') === 'no_pincode', 'no pincode');
  ok(get('publicServiceRequests/R11').status === 'new', 'manual requests stay open for a person');
  // A request that is not new, or already routed, is left alone.
  await request('R12', { pincode: '584101', status: 'assigned_to_center' });
  ok(!routedTo('R12') && !get('publicServiceRequests/R12').routing, 'not new -> untouched');
  // The routed center ticket carries no copy of master data it does not need: the center is a uid, the
  // product/brand are the request's own fields, nothing from the center profile is duplicated onto it.
  ok(!('pincodesCovered' in cr) && !('brandsAuthorized' in cr) && !('districtsCovered' in cr), 'no center master data copied onto tickets');
});

// ---------------------------------------------------------------------
// Item 1 — Customer 360: one customer, every record that names them
// ---------------------------------------------------------------------
test('P9.1 customer 360: everything made for one customer is found by their phone and links up', async () => {
  set('users/rC', { role: 'servicecenter', name: 'C360 Center', brandsAuthorized: ['makwell'], pincodesCovered: ['584777'] });
  set('serviceCenterProfiles/rC', { status: 'ACTIVE' });
  const phone = '9100000051';
  const c = customer('p9360', phone, 'Lakshmi');
  const r = await RP(c, reg({ serialNumber: 'P9-360-1', pincode: '584777', name: 'Lakshmi' }));
  const b = await BS(c, book({ registrationId: r.registrationId, pincode: '584777', name: 'Lakshmi' }));
  const pubPath = 'publicServiceRequests/' + b.requestId;
  await created('trackOnPublicRequest', pubPath, { docId: b.requestId });
  await created('enrich_publicServiceRequests', pubPath, { docId: b.requestId });
  await created('routePublicServiceRequest', pubPath, { docId: b.requestId });
  set('contactEnquiries/e1', { ticketId: 'PE-ENQ-1', phone, subject: 'Price?', message: 'hello' });

  // What the Customer 360 screen reads: five collections by phone.
  const byPhone = (coll, field = 'customerPhone') => all(coll, (d) => d[field] === phone);
  const regs = byPhone('productRegistrations'), pubs = byPhone('publicServiceRequests'), centers = byPhone('centerRequests'), tracks = byPhone('customerTracking');
  ok(regs.length === 1 && pubs.length === 1 && centers.length === 1 && tracks.length === 1, 'one record in each place');
  ok(byPhone('contactEnquiries', 'phone').length === 1, 'enquiry found by phone');

  // ...and they all describe the same product and the same ticket.
  const [rg] = regs, [pub] = pubs, [cr] = centers, [tr] = tracks;
  ok(pub.linkedRegistrationId === rg.registrationId && cr.linkedRegistrationId === rg.registrationId, 'ticket and center ticket point at the registration');
  ok(pub.serialNumber === rg.serialNumber && cr.serialNumber === rg.serialNumber && pub.product === rg.product && cr.product === rg.product, 'same serial and product everywhere');
  ok(pub.requestId === cr.requestId && cr.requestId === tr.ticketId && cr.sourceRequestId === b.requestId, 'one ticket id everywhere');
  ok(cr.serviceCenterUid === 'rC' && pub.serviceCenterUid === 'rC' && pub.status === 'assigned_to_center', 'request and center ticket agree on the center and status');
  ok(pub.intakeWarranty.status === 'in_warranty', 'warranty read recorded on the ticket');
  ok(rg.customerName === 'Lakshmi' && pub.customerName === 'Lakshmi' && cr.customerName === 'Lakshmi', 'the same name on all of them');

  // Everything that points at a registration points at a real one belonging to the same phone.
  const tickets = [...all('publicServiceRequests'), ...all('centerRequests')].filter((d) => d.linkedRegistrationId);
  for (const t of tickets) {
    const owner = all('productRegistrations', (d) => d.registrationId === t.linkedRegistrationId)[0];
    ok(owner, `${t.requestId}: linked registration ${t.linkedRegistrationId} exists`);
    ok(owner.customerPhone === t.customerPhone, `${t.requestId}: ticket and registration have the same customer`);
  }
  // The customer's own view of the same journey agrees.
  const lookup = F.publicLookup.handler;
  const tracked = await lookup({ data: { type: 'track', ticket: b.requestId, phone }, rawRequest: { ip: '8.8.8.8' } });
  ok(tracked.found === true, 'public tracking finds the ticket by id + phone');
  const warranty = await lookup({ data: { type: 'warranty', phone }, rawRequest: { ip: '8.8.8.9' } });
  ok(warranty.registrations.length === 1 && warranty.registrations[0].registrationId === rg.registrationId, 'public warranty lookup shows the same registration');
});
