// Phase 9 — end-to-end business workflow, items 11-18: closure, feedback, the
// full service timeline, cross-role security, ID integrity, exceptions and
// escalation, Customer 360 consistency, and a repeatable non-destructive run
// of the whole lifecycle. The golden path below drives the real functions
// (index.js) in the order Firestore would fire them.
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
const Escalation = require('./escalation');
const { store, DocRef, Snap, Timestamp } = fake;
const test = require('node:test');
const assert = require('node:assert');
const get = (p) => store.get(p);
const ref = (p) => { const [c, id] = p.split('/'); return new DocRef(c, id); };
const set = (p, d) => store.set(p, d);
const ok = (cond, msg) => assert.ok(cond, msg);
const all = (coll, pred = () => true) => [...store.entries()].filter(([p, d]) => p.startsWith(coll + '/') && pred(d)).map(([p, d]) => ({ path: p, ...d }));
const created = (fn, p, params = {}, authId) => F[fn].handler({ data: new Snap(ref(p)), params: { ...params }, authId });
async function by(fn, p, change, authId, params = {}) {
  const before = new Snap(ref(p));
  set(p, { ...get(p), ...change });
  await F[fn].handler({ data: { before, after: new Snap(ref(p)) }, params, authId });
}
const dayIso = (n) => { const d = new Date(Date.now() + 330 * 60000); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const monthsAgo = (m) => { const d = new Date(); d.setMonth(d.getMonth() - m); return d.toISOString().slice(0, 10); };
const tok = (uid, phone) => ({ uid, token: { phone_number: '+91' + phone } });
const RP = (auth, data) => F.registerProduct.handler({ auth, data, rawRequest: { ip: '9.9.9.9' } });
const BS = (auth, data) => F.bookService.handler({ auth, data, rawRequest: { ip: '9.9.9.9' } });
const contact = { name: 'Customer', address: '5 Park St', city: 'Raichur', state: 'Karnataka', pincode: '584101' };
const track = (coll, id) => F[`trackSync_${coll}`].handler({ data: { after: new Snap(ref(`${coll}/${id}`)) }, params: { docId: id } });
const op = async (id, data) => { set(`stockOps/${id}`, { status: 'pending', ...data }); await created('sparesOpCreated', `stockOps/${id}`, { opId: id }); return get(`stockOps/${id}`); };

// ---- masters (shared, must never change during any run) ----
function seedMasters() {
  store.clear();
  set('warrantyPlans/wp', { brandId: 'makwell', categoryId: 'geyser', status: 'active', components: [{ componentName: 'Full Product', durationYears: 2 }, { componentName: 'Heating Element', durationYears: 5 }] });
  set('spareParts/spHE', { name: 'Heating Element', partCode: 'HE-1', reorderLevel: 1 });
  set('serviceChargeRates/default_geyser_repair_flat', { scope: 'default', category: 'Geyser', rateType: 'repair', amount: 450 });
  set('pincodes/584101', { pincode: '584101', district: 'Raichur', active: true });
  set('users/gSC', { role: 'servicecenter', name: 'Golden Center', email: 'gsc@pe.test', pincodesCovered: ['584101'], brandsAuthorized: ['makwell'] });
  set('serviceCenterProfiles/gSC', { status: 'ACTIVE' });
  set('users/gT', { role: 'technician', name: 'Golden Tech', linkedServiceCenterUid: 'gSC', brandsAuthorized: ['makwell'] });
  set('centerTechnicians/gCT', { serviceCenterUid: 'gSC', technicianUid: 'gT', name: 'Golden Tech' });
  set('users/gWH', { role: 'warehouse', name: 'WH' });
  set('users/gSA', { role: 'superadmin', name: 'Boss' });
  set('inventory/servicecenter_gSC_spHE', { partId: 'spHE', location: 'servicecenter', serviceCenterUid: 'gSC', quantity: 5 });
}
const MASTER_PREFIXES = ['warrantyPlans/', 'spareParts/', 'serviceChargeRates/', 'pincodes/', 'users/gSC', 'users/gT', 'users/gWH', 'users/gSA', 'serviceCenterProfiles/', 'centerTechnicians/'];
const masters = () => JSON.stringify([...store.entries()].filter(([p]) => MASTER_PREFIXES.some((m) => p.startsWith(m))).sort());

// ---- the golden path: customer -> registration -> booking -> routing -> technician -> appointment -> diagnosis
//      -> spare -> repair -> billing -> closure -> feedback ----
async function golden(n, opts = {}) {
  const phone = '91000' + String(70000 + n);
  set(`users/gC${n}`, { role: 'customer', phone10: phone, name: 'Golden ' + n });
  const c = tok(`gC${n}`, phone);
  const r = await RP(c, { brand: 'MakWell', categoryId: 'geyser', category: 'Geyser', modelNo: 'G15', serialNumber: `GOLD-${n}`, purchaseDate: opts.purchased || monthsAgo(3), ...contact, name: 'Golden ' + n });
  const regPath = all('productRegistrations', (d) => d.registrationId === r.registrationId)[0].path;
  await created('checkRegistrationSerial', regPath, { regId: regPath.split('/')[1] });
  const b = await BS(c, { registrationId: r.registrationId, requestType: 'service', issueDescription: 'No hot water', ...contact, name: 'Golden ' + n });
  const pubPath = `publicServiceRequests/${b.requestId}`;
  await created('enrich_publicServiceRequests', pubPath, { docId: b.requestId });
  await created('trackOnPublicRequest', pubPath, { docId: b.requestId });
  await created('routePublicServiceRequest', pubPath, { docId: b.requestId });
  const id = `route_${b.requestId}`, T = `centerRequests/${id}`;
  await created('enrich_centerRequests', T, { docId: id }).catch(() => {});
  await track('centerRequests', id);
  // The staff-kept public status mirror the Track page reads.
  set(`publicTicketStatus/${b.requestId}`, { ticketId: b.requestId, status: 'new', customerPhone: phone, source: 'centerRequests', sourceDocId: id, category: 'Geyser' });
  // Assign, appoint, accept, start.
  await by('checkAssignmentOnUpdate', T, { technicianUid: 'gT', technicianName: 'Golden Tech', status: 'assigned' }, 'gSC', { docId: id });
  await track('centerRequests', id);
  await by('checkScheduleOnUpdate_centerRequests', T, { scheduledDate: dayIso(1), scheduledStartTime: '10:00', scheduledEndTime: '12:00' }, 'gSC', { docId: id });
  await track('centerRequests', id);
  for (const st of ['accepted', 'in_progress']) { await by('checkLifecycle_centerRequests', T, { status: st }, 'gT', { docId: id }); await track('centerRequests', id); }
  // Spare required: request, approve, dispatch, receive; stock to the technician; fit it.
  const sr = `sr${n}`;
  set(`spareRequests/${sr}`, { requestId: `PE-SR-20261008-${String(n).padStart(4, '0')}-Technician`, partId: 'spHE', item: 'Heating Element', quantity: 1, status: 'new', sourceJobId: id, sourceJobCollection: 'centerRequests', requestedByUid: 'gT' });
  await F.trackSpareEvent.handler({ data: { before: new Snap(ref('spareRequests/none')), after: new Snap(ref(`spareRequests/${sr}`)) }, params: { docId: sr } });
  for (const st of ['approved', 'dispatched', 'received']) {
    const extra = st === 'dispatched' ? { transport: { transporter: 'VRL', docket: 'D' + n } } : {};
    await by('checkSparePipeline', `spareRequests/${sr}`, { status: st, ...extra }, 'gWH', { docId: sr });
    await F.trackSpareEvent.handler({ data: { before: { exists: true, data: () => ({}) }, after: new Snap(ref(`spareRequests/${sr}`)) }, params: { docId: sr } });
  }
  const j = { coll: 'centerRequests', id };
  const t1 = await op(`gt${n}`, { type: 'transfer_to_technician', byUid: 'gSC', techUid: 'gT', lines: [{ partId: 'spHE', qty: 1 }], job: j });
  const t2 = await op(`gc${n}`, { type: 'consume', byUid: 'gT', lines: [{ partId: 'spHE', qty: 1 }], job: j });
  // Repair done: the technician closes it; the server does the warranty and billing.
  await by('billOnClose_centerRequests', T, { status: 'completed', closureCode: 'REPAIRED', actionTaken: 'Replaced element', partsUsedNotes: 'Heating Element x1', closedByUid: 'gT', closedAt: Timestamp.now() }, 'gT', { docId: id });
  await track('centerRequests', id);
  await by('checkLifecycle_centerRequests', T, { status: 'closed' }, 'gSA', { docId: id });
  await track('centerRequests', id);
  // Customer feedback from the Track page.
  set(`publicTicketStatus/${b.requestId}`, { ...get(`publicTicketStatus/${b.requestId}`), status: 'closed' });
  set(`serviceFeedback/${b.requestId}`, { ticketId: b.requestId, customerPhone: phone, rating: opts.rating || 5, comment: 'Quick service', createdAt: Timestamp.now() });
  await created('processFeedback', `serviceFeedback/${b.requestId}`, { ticketId: b.requestId });
  await track('centerRequests', id);
  return { n, phone, regId: r.registrationId, regPath, ticketId: b.requestId, T, id, pubPath, sr, t1, t2 };
}

test('P9.11 closure: evidence, parts, warranty verdict, billing once, then closed — and a re-run changes nothing', async () => {
  seedMasters();
  const g = await golden(1);
  const t = get(g.T);
  ok(t.status === 'closed' && t.closureCode === 'REPAIRED' && t.actionTaken && t.partsUsedNotes && t.closedByUid === 'gT', 'closure evidence kept');
  ok(g.t1.status === 'done' && g.t2.status === 'done', 'parts moved center -> technician -> job');
  const used = all('stockMovements', (d) => d.type === 'consume' && d.sourceJobId === g.id);
  ok(used.length === 1 && used[0].quantity === 1, 'one consumption ledger line on this job');
  ok(t.warrantyStatus === 'in_warranty' && t.billingType === 'claim' && t.billingStatus === 'ready_to_claim' && t.serviceCharge === 450 && t.billingTotal === 0, 'warranty verdict and claim line set by the server');
  const credits = all('walletTransactions', (d) => d.sourceJobId === g.id);
  ok(credits.length === 1 && credits[0].amount === 450 && credits[0].technicianUid === 'gT' && credits[0].status === 'unclaimed', 'technician credited once');
  ok(all('returns', (d) => d.sourceJobId === g.id).length === 1, 'defective part return opened for the fitted part');
  // The same completion replayed (retry, reopen + re-close): nothing doubles.
  const snap = JSON.stringify([...store.entries()].filter(([p]) => /^(walletTransactions|returns|stockMovements|inventory)/.test(p)).sort());
  await F.billOnClose_centerRequests.handler({ data: { before: { data: () => ({ ...t, status: 'in_progress' }) }, after: new Snap(ref(g.T)) }, params: { docId: g.id } });
  await by('checkLifecycle_centerRequests', g.T, { status: 'reopened' }, 'gSA', { docId: g.id });
  await by('checkLifecycle_centerRequests', g.T, { status: 'in_progress' }, 'gT', { docId: g.id });
  await by('billOnClose_centerRequests', g.T, { status: 'completed' }, 'gT', { docId: g.id });
  ok(JSON.stringify([...store.entries()].filter(([p]) => /^(walletTransactions|returns|stockMovements|inventory)/.test(p)).sort()) === snap, 'reopen + re-close creates no second credit, return or stock movement');
  // A technician cannot complete without the closure notes, and the evidence stays with the one who wrote it.
  set('centerRequests/cl2', { requestId: 'PE-CR-20261008-0002-ServiceCenter', serviceCenterUid: 'gSC', technicianUid: 'gT', status: 'in_progress', customerPhone: '9100077777', category: 'Geyser' });
  await by('checkLifecycle_centerRequests', 'centerRequests/cl2', { status: 'completed' }, 'gT', { docId: 'cl2' });
  ok(get('centerRequests/cl2').status === 'in_progress' && /Closing needs/.test(get('centerRequests/cl2').lifecycleRejected.reason), 'no completion without notes');
  await by('billOnClose_centerRequests', 'centerRequests/cl2', { status: 'completed' }, 'gT', { docId: 'cl2' });
  ok(!get('centerRequests/cl2').billingComputedAt && !all('walletTransactions', (d) => d.sourceJobId === 'cl2').length, 'a refused completion bills nothing');
  // Closed by the center for the technician: no technician credit (the center bills it).
  set('centerRequests/cl3', { requestId: 'PE-CR-20261008-0003-ServiceCenter', serviceCenterUid: 'gSC', technicianUid: 'gT', status: 'in_progress', customerPhone: '9100077778', category: 'Geyser', closureCode: 'X', actionTaken: 'x', partsUsedNotes: 'x', closedByUid: 'gSC' });
  await by('billOnClose_centerRequests', 'centerRequests/cl3', { status: 'completed' }, 'gSC', { docId: 'cl3' });
  ok(!all('walletTransactions', (d) => d.sourceJobId === 'cl3').length, 'center-closed ticket: no technician credit');
});

test('P9.12 feedback: stored once per closed ticket, tied to the right center/technician, visible on Customer 360, low ratings escalated', async () => {
  seedMasters();
  const g = await golden(2, { rating: 2 });
  const fb = get(`serviceFeedback/${g.ticketId}`);
  ok(fb.rating === 2 && fb.serviceCenterUid === 'gSC' && fb.technicianUid === 'gT' && fb.sourceDocId === g.id && fb.requestId === g.ticketId, 'feedback tied to the ticket, center and technician by id');
  ok(get(g.T).customerFeedback.rating === 2, 'rating shown on the ticket (what Customer 360 reads)');
  ok(all('notifications', (d) => d.title === 'Low customer rating').length === 2, 'low rating alerts Warehouse and the center');
  ok(get(`customerTracking/${g.ticketId}`).events.filter((e) => e.type === 'feedback').length === 1, 'feedback event on the timeline once');
  // Feedback that doesn't belong is removed: wrong phone, ticket not finished, unknown ticket, invented ticket id.
  const bad = async (key, ticket, mirror, fbOver) => {
    set(`centerRequests/${key}`, { requestId: key, serviceCenterUid: 'gSC', customerPhone: '9100099999', status: 'closed', ...ticket });
    if (mirror) set(`publicTicketStatus/${key}`, { ticketId: key, status: 'closed', customerPhone: '9100099999', source: 'centerRequests', sourceDocId: key, ...mirror });
    set(`serviceFeedback/${key}`, { ticketId: key, customerPhone: '9100099999', rating: 1, createdAt: Timestamp.now(), ...fbOver });
    await created('processFeedback', `serviceFeedback/${key}`, { ticketId: key });
    ok(!get(`serviceFeedback/${key}`), key + ' removed');
    ok(!get(`centerRequests/${key}`).customerFeedback, key + ' ticket untouched');
  };
  await bad('fbWrongPhone', {}, {}, { customerPhone: '9100011111' });
  await bad('fbOpen', { status: 'in_progress' }, {}, {});
  await bad('fbIdMismatch', { requestId: 'SOMETHING-ELSE' }, {}, {});
  set('serviceFeedback/ghost', { ticketId: 'ghost', customerPhone: '9100099999', rating: 5 });
  await created('processFeedback', 'serviceFeedback/ghost', { ticketId: 'ghost' });
  ok(get('serviceFeedback/ghost'), 'no mirror -> nothing to check against, left for the rules (which require the mirror)');
  // Feedback stats ignore junk ratings.
  const Feedback = require('./feedback');
  ok(Feedback.summarize([{ rating: 5 }, { rating: 4 }, { rating: 9 }, { rating: 0 }, { rating: 'x' }, {}]).average === 4.5, 'average counts only 1-5');
});

test('P9.13 full timeline: every major step appears once, in the order it happened', async () => {
  seedMasters();
  const g = await golden(3);
  const ev = get(`customerTracking/${g.ticketId}`).events;
  const types = ev.map((e) => e.type);
  const first = (t) => types.indexOf(t);
  const order = ['request', 'routing', 'assignment', 'appointment', 'status', 'spare', 'billing', 'feedback'];
  ok(order.every((t) => first(t) >= 0), 'every kind of step is present: ' + types.join());
  ok(order.map(first).every((v, i, a) => i === 0 || v > a[i - 1]), 'first appearance follows the real order: ' + order.map(first).join());
  const labels = ev.map((e) => e.label);
  for (const want of ['Request received', 'Assigned to Golden Center', 'Technician assigned: Golden Tech', 'Technician accepted the job', 'Diagnosis and repair started', 'Spare part requested', 'Spare part approved', 'Spare part dispatched', 'Spare part received', 'Repair completed', 'Covered by warranty', 'Service closed', 'Feedback received']) ok(labels.includes(want), 'missing: ' + want + ' in ' + labels.join(' | '));
  ok(labels.some((l) => /^Appointment booked for \d{4}-\d{2}-\d{2} 10:00$/.test(l)), 'appointment line');
  ok(new Set(ev.map((e) => e.key)).size === ev.length, 'no step is recorded twice');
  ok(ev.every((e) => e.at && e.label && e.type), 'every entry has a time, a type and a label');
  // Re-saving the same ticket (no real change) adds nothing.
  const n0 = ev.length; await track('centerRequests', g.id); await track('centerRequests', g.id);
  ok(get(`customerTracking/${g.ticketId}`).events.length === n0, 'a re-save adds no entries');
  // Appointment moved, then missed: the timeline says so.
  await by('checkScheduleOnUpdate_centerRequests', g.T, { scheduledStartTime: '14:00', scheduledEndTime: '16:00' }, 'gSC', { docId: g.id });
  await track('centerRequests', g.id);
  ok(get(`customerTracking/${g.ticketId}`).events.some((e) => /Appointment changed to .* 14:00/.test(e.label)), 'moved appointment shown');
  // Nothing private leaks into the customer's timeline.
  const text = JSON.stringify(get(`customerTracking/${g.ticketId}`).events);
  ok(!/450|gT\b|gSC|docket|VRL|credit|claim/i.test(text), 'no internal ids, charges or transport details in the timeline');
  // Spare steps never add to a ticket with no tracking record, and unknown statuses are ignored.
  set('spareRequests/orphan', { requestId: 'PE-SR-ORPHAN', status: 'approved', sourceJobId: 'nope', sourceJobCollection: 'centerRequests' });
  await F.trackSpareEvent.handler({ data: { before: new Snap(ref('spareRequests/none')), after: new Snap(ref('spareRequests/orphan')) }, params: { docId: 'orphan' } });
  ok(!get('customerTracking/nope'), 'no tracking record invented');
});

test('P9.14 each role can only do its own part (server side of the lifecycle)', async () => {
  seedMasters();
  const cust = (uid, phone) => { set(`users/${uid}`, { role: 'customer', phone10: phone }); return tok(uid, phone); };
  const a = cust('secC1', '9100080001'), other = cust('secC2', '9100080002');
  // Customer-only functions: staff, signed-out and phone-less callers are refused.
  const staff = { uid: 'gSC', token: { phone_number: '+919100080003' } };
  for (const [who, auth] of [['signed out', null], ['staff account', staff], ['no verified phone', { uid: 'secC1', token: {} }]]) {
    await assert.rejects(() => RP(auth, { brand: 'MakWell', categoryId: 'geyser', category: 'Geyser', modelNo: 'G', serialNumber: 'SEC-0001', purchaseDate: monthsAgo(1), ...contact }), undefined, 'register: ' + who);
    await assert.rejects(() => BS(auth, { requestType: 'service', issueDescription: 'x', ...contact }), undefined, 'book: ' + who);
  }
  ok(!all('productRegistrations', (d) => d.serialNumber === 'SEC-0001').length, 'refused callers wrote nothing');
  // A customer cannot book against someone else's registration.
  const mine = await RP(a, { brand: 'MakWell', categoryId: 'geyser', category: 'Geyser', modelNo: 'G', serialNumber: 'SEC-0002', purchaseDate: monthsAgo(1), ...contact });
  await assert.rejects(() => BS(other, { registrationId: mine.registrationId, requestType: 'service', issueDescription: 'x', ...contact }), undefined, 'booking on another customer\'s product');
  // Support tickets: only the owner replies; a customer cannot take staff actions.
  const st = await F.supportTicket.handler({ auth: a, data: { action: 'create', category: 'Warranty', subject: 'Help', message: 'Hello' }, rawRequest: { ip: '1.1.1.1' } });
  const no = st.ticketNo || st.id;
  await assert.rejects(() => F.supportTicket.handler({ auth: other, data: { action: 'reply', ticketNo: no, message: 'mine now' }, rawRequest: { ip: '1.1.1.1' } }), undefined, 'reply to another customer\'s ticket');
  // Billing and claims: only the ticket's own center bills; nobody claims another person's credit.
  set('users/gSC2', { role: 'servicecenter', name: 'Other center' });
  set('centerRequests/secT', { requestId: 'PE-CR-SEC', serviceCenterUid: 'gSC', technicianUid: 'gT', status: 'completed', category: 'Geyser', customerPhone: '9100080001' });
  await by('applyBillingRequest', 'centerRequests/secT', { billingRequest: { byUid: 'gSC2', requestedAt: Timestamp.now(), treatAs: 'out', sparePartsCost: 1, otherCharges: 1, serviceCharge: 1 } }, 'gSC2', { docId: 'secT' });
  ok(!get('centerRequests/secT').billingStatus && /Only the ticket's service center/.test(get('centerRequests/secT').billingRejected.reason), 'another center cannot bill this ticket');
  // Lifecycle powers by role: technician cannot verify/close/reopen; Warehouse and Super Admin can.
  for (const [who, to, allowed] of [['gT', 'closed', false], ['gT', 'verification', false], ['gSC', 'closed', false], ['gWH', 'verification', true], ['gSA', 'closed', true]]) {
    set('centerRequests/secL', { requestId: 'PE-CR-SECL', serviceCenterUid: 'gSC', technicianUid: 'gT', status: 'completed', customerPhone: '9100080001' });
    await by('checkLifecycle_centerRequests', 'centerRequests/secL', { status: to }, who, { docId: 'secL' });
    ok((get('centerRequests/secL').status === to) === allowed, `${who} -> ${to}: ${allowed ? 'allowed' : 'refused'}`);
  }
  // Warehouse pipeline: even Super Admin cannot skip a stage (who may move a request is the rules' job: rules_qa).
  set('spareRequests/secS', { requestId: 'PE-SR-SEC', status: 'new', requestedByUid: 'gT', partId: 'spHE' });
  await by('checkSparePipeline', 'spareRequests/secS', { status: 'received' }, 'gSA', { docId: 'secS' });
  ok(get('spareRequests/secS').status === 'new', 'nobody skips the pipeline');
  // The customer's tracking carries no staff-only data.
  const g = await golden(4);
  const tr = get(`customerTracking/${g.ticketId}`);
  ok(!('serviceCenterUid' in tr) && !('technicianUid' in tr) && !('serviceCharge' in tr) && !('closedByUid' in tr), 'tracking has no uids or internal charges');
  ok(tr.customerCharge === null, 'a warranty job shows no customer charge');
});

test('P9.15 ids: unique, server-made where the server makes them, and duplicates or odd formats are flagged', async () => {
  seedMasters();
  const c = tok('idC', '9100090001'); set('users/idC', { role: 'customer', phone10: '9100090001' });
  const regs = [];
  for (let i = 0; i < 4; i++) regs.push((await RP(c, { brand: 'MakWell', categoryId: 'geyser', category: 'Geyser', modelNo: 'G', serialNumber: 'ID-000' + i, purchaseDate: monthsAgo(1), ...contact })).registrationId);
  const bookings = [];
  for (let i = 0; i < 3; i++) bookings.push((await BS(c, { registrationId: regs[i], requestType: 'service', issueDescription: 'x' + i, ...contact })).requestId);
  const ids = [...regs, ...bookings];
  ok(new Set(ids).size === ids.length, 'registration and booking ids are all different');
  ok(regs.every((r) => /^PE-REG-\d{8}-\d{4}-Portal$/.test(r)) && bookings.every((r) => /^PE-[A-Z]{2,3}-\d{8}-\d{4}-[A-Za-z]+$/.test(r)), 'standard shape: ' + ids[0] + ', ' + ids[4]);
  // Every collection that carries a business id is checked when a record is created.
  const mk = (coll, field, id, extra = {}) => { const docId = coll.slice(0, 3) + Math.random().toString(36).slice(2, 8); set(`${coll}/${docId}`, { [field]: id, ...extra }); return `${coll}/${docId}`; };
  const check = (coll, p) => F[`checkIdIntegrity_${coll}`].handler({ data: new Snap(ref(p)), params: { docId: p.split('/')[1] } });
  const COLLS = { centerRequests: ['requestId', 'PE-CR-20261008-9001-ServiceCenter'], serviceJobs: ['jobId', 'PE-JOB-20261008-9001-Technician'], spareRequests: ['requestId', 'PE-SR-20261008-9001-Technician'],
    returns: ['returnId', 'PE-RT-20261008-9001-Technician'], claims: ['claimId', 'PE-CL-20261008-9001-Technician'], productRegistrations: ['registrationId', 'PE-REG-20261008-9001-Dealer'],
    publicServiceRequests: ['requestId', 'PE-PS-20261008-9001-Portal'], dealerOrders: ['orderId', 'PE-DO-20261008-9001-Dealer'] };
  for (const [coll, [field, id]] of Object.entries(COLLS)) {
    ok(F[`checkIdIntegrity_${coll}`], coll + ' has an id check');
    const first = mk(coll, field, id); await check(coll, first);
    ok(!get(first).idCheck, coll + ': a unique, well-formed id passes');
    const dup = mk(coll, field, id); await check(coll, dup);
    ok(get(dup).idCheck.status === 'duplicate' && get(dup).idCheck.of.length === 1 && get(dup).idCheck.of[0] === first.split('/')[1], coll + ': same id twice is flagged, naming the other record');
    ok(!get(first).idCheck, coll + ': the original is left alone');
    const odd = mk(coll, field, 'MY-OWN-ID-1'); await check(coll, odd);
    ok(get(odd).idCheck.status === 'unexpected_format', coll + ': a hand-made id is flagged');
  }
  ok(all('notifications', (d) => d.title === 'ID problem' && d.recipientValue === 'superadmin').length === 16, 'Head Office told about each problem');
  // Records without an id, and the same id in a different collection, are not problems.
  const none = mk('centerRequests', 'requestId', ''); await check('centerRequests', none); ok(!get(none).idCheck, 'no id: nothing to check');
  const cross = mk('claims', 'claimId', COLLS.centerRequests[1]); await check('claims', cross); ok(!get(cross).idCheck, 'ids are only compared inside their own collection');
});

test('P9.16 exceptions: stuck work is escalated once, to the right people', async () => {
  seedMasters();
  const now = Date.now(), H = 3600000, today = dayIso(0);
  const ts = (msAgo) => Timestamp.fromDate(new Date(now - msAgo));
  // Pure rules first.
  ok(Escalation.unrouted({ status: 'new', requestId: 'U', routing: { status: 'manual', reason: 'no_match', at: ts(5 * H) } }, now), 'unrouted 5h -> escalate');
  ok(!Escalation.unrouted({ status: 'new', routing: { status: 'manual', at: ts(1 * H) } }, now), '1h is too soon');
  ok(!Escalation.unrouted({ status: 'assigned_to_center', routing: { status: 'routed', at: ts(9 * H) } }, now), 'routed is fine');
  ok(!Escalation.unassigned({ status: 'new', createdAt: ts(23 * H) }, now) && Escalation.unassigned({ status: 'new', createdAt: ts(25 * H) }, now), 'no technician: 24h');
  ok(!Escalation.unassigned({ status: 'new', technicianUid: 't', createdAt: ts(99 * H) }, now), 'has a technician');
  ok(Escalation.missedAppointment({ status: 'assigned', scheduledDate: dayIso(-1) }, today) && !Escalation.missedAppointment({ status: 'assigned', scheduledDate: today }, today), 'missed = date passed, not today');
  ok(!Escalation.missedAppointment({ status: 'in_progress', scheduledDate: dayIso(-3) }, today) && !Escalation.missedAppointment({ status: 'completed', scheduledDate: dayIso(-3) }, today), 'started or finished visits are not missed');
  ok(Escalation.stuckOnSpare({ status: 'waiting_spare', updatedAt: ts(8 * 24 * H) }, now) && !Escalation.stuckOnSpare({ status: 'waiting_spare', updatedAt: ts(2 * 24 * H) }, now), 'spare wait: 7 days');
  // The sweep, against real records.
  set('publicServiceRequests/eU', { requestId: 'eU', status: 'new', routing: { status: 'manual', reason: 'no_coverage', at: ts(6 * H) } });
  set('publicServiceRequests/eOK', { requestId: 'eOK', status: 'new', routing: { status: 'manual', reason: 'no_coverage', at: ts(1 * H) } });
  set('centerRequests/eA', { requestId: 'eA', serviceCenterUid: 'gSC', status: 'new', createdAt: ts(30 * H) });
  set('centerRequests/eM', { requestId: 'PE-EM-1', serviceCenterUid: 'gSC', technicianUid: 'gT', status: 'accepted', scheduledDate: dayIso(-2), scheduledStartTime: '10:00', scheduledEndTime: '11:00' });
  set('serviceJobs/eS', { jobId: 'eS', technicianUid: 'gT', status: 'waiting_spare', updatedAt: ts(9 * 24 * H) });
  set('centerRequests/eFine', { requestId: 'eFine', serviceCenterUid: 'gSC', technicianUid: 'gT', status: 'in_progress', createdAt: ts(500 * H) });
  const run = () => F.escalationSweep.handler({ scheduleTime: new Date(now).toISOString() });
  await run();
  const to = (title) => all('notifications', (d) => d.title === title).map((d) => d.recipientValue).sort();
  ok(to('Service request needs routing').join() === 'superadmin', 'unrouted -> Head Office');
  ok(to('Ticket has no technician').join() === 'gSC,superadmin', 'no technician -> the center and Head Office');
  ok(to('Appointment missed').join() === 'gSC,gT', 'missed appointment -> the center and the technician');
  ok(to('Job waiting for a spare').join() === 'superadmin,warehouse', 'stuck on a spare -> Warehouse and Head Office');
  ok(get('centerRequests/eM').appointmentMissed.date === dayIso(-2), 'missed appointment recorded on the ticket');
  ok(!get('publicServiceRequests/eOK').escalation && !get('centerRequests/eFine').escalation, 'healthy work is left alone');
  const count = all('notifications').length;
  await run(); await run();
  ok(all('notifications').length === count, 'running the sweep again tells nobody twice');
  // A missed appointment that is moved to a new date is a new problem; the timeline says so.
  await by('checkScheduleOnUpdate_centerRequests', 'centerRequests/eM', { scheduledDate: dayIso(1) }, 'gSC', { docId: 'eM' });
  set('centerRequests/eM', { ...get('centerRequests/eM'), customerPhone: '9100070099' });
  await track('centerRequests', 'eM');
  ok(get('customerTracking/PE-EM-1').events.some((e) => /was missed/.test(e.label)), 'timeline shows the missed appointment');
  // Cancelled job: cannot be billed, completed, or given parts.
  set('users/exT', { role: 'technician', linkedServiceCenterUid: 'gSC' });
  set('inventory/technician_gT_spHE', { partId: 'spHE', location: 'technician', technicianUid: 'gT', serviceCenterUid: 'gSC', quantity: 1 });
  set('centerRequests/eC', { requestId: 'eC', serviceCenterUid: 'gSC', technicianUid: 'gT', status: 'cancelled', category: 'Geyser', customerPhone: '9100070098' });
  await by('checkLifecycle_centerRequests', 'centerRequests/eC', { status: 'completed', closureCode: 'X', actionTaken: 'x', partsUsedNotes: 'x', closedByUid: 'gT' }, 'gT', { docId: 'eC' });
  ok(get('centerRequests/eC').status === 'cancelled', 'a cancelled job stays cancelled');
  await by('applyBillingRequest', 'centerRequests/eC', { billingRequest: { byUid: 'gSC', requestedAt: Timestamp.now(), treatAs: 'out', sparePartsCost: 1, otherCharges: 0, serviceCharge: 1 } }, 'gSC', { docId: 'eC' });
  ok(!get('centerRequests/eC').billingStatus, 'a cancelled job cannot be billed');
  const rj = await op('eCons', { type: 'consume', byUid: 'gT', lines: [{ partId: 'spHE', qty: 1 }], job: { coll: 'centerRequests', id: 'eC' } });
  ok(rj.status === 'rejected' && get('inventory/technician_gT_spHE').quantity === 1, 'no parts on a cancelled job');
  // No technician free: the match says so for every candidate, with reasons, and assignment is refused.
  const TM = require('./technicianMatch');
  const ranked = TM.rankTechnicians({ ticket: { brand: 'MakWell', category: 'Geyser' }, roster: [{ id: 'a', name: 'A', technicianUid: 'x1' }, { id: 'b', name: 'B', technicianUid: 'x2' }], users: { x1: { brandsAuthorized: ['makwell'] }, x2: { brandsAuthorized: ['flyvision'] } }, avail: { x1: { status: 'leave' } }, today });
  ok(ranked.every((r) => !r.eligible && r.excludedReason), 'nobody available: each one has a reason');
});

test('P9.17 consistency: one change shows up the same way in every record that carries it', async () => {
  seedMasters();
  const g = await golden(5);
  const reg = get(g.regPath), t = get(g.T), pub = get(g.pubPath), tr = get(`customerTracking/${g.ticketId}`), mirror = get(`publicTicketStatus/${g.ticketId}`);
  // Customer <-> product <-> warranty <-> job
  ok(reg.customerPhone === g.phone && pub.customerPhone === g.phone && t.customerPhone === g.phone && tr.customerPhone === g.phone, 'same phone on the registration, request, ticket and tracking');
  ok(t.linkedRegistrationId === g.regId && pub.linkedRegistrationId === g.regId && tr.linkedRegistrationId === g.regId, 'the registration id is carried, not copied by hand');
  ok(t.serialNumber === reg.serialNumber && tr.serialNumber === reg.serialNumber && reg.serialNumber === 'GOLD-5', 'one serial everywhere, in the standard form');
  ok(get(`registrationSerials/${reg.serialNumber}`).registrationId === g.regId, 'serial lock points at the registration');
  ok(t.warrantyStatus === 'in_warranty' && tr.warrantyStatus === 'in_warranty' && mirror.warrantyStatus === 'in_warranty', 'warranty verdict identical on ticket, tracking and public status');
  ok(t.status === 'closed' && tr.status === 'closed', 'status identical on ticket and tracking');
  ok(t.technicianName === tr.technicianName && tr.serviceCenterName === 'Golden Center', 'technician and center names match');
  // Inventory <-> ledger <-> returns <-> billing
  const inv = (loc, uid) => (get(`inventory/${loc}_${uid}_spHE`) || {}).quantity || 0;
  const moves = all('stockMovements');
  ok(inv('servicecenter', 'gSC') === 4 && inv('technician', 'gT') === 0, 'stock: 5 at the center, one sent to the technician and fitted -> 4 and 0');
  const net = (loc, uid) => moves.filter((m) => m.partId === 'spHE').reduce((s, m) => s + (m.toLocation === loc && (m.toUid || m.technicianUid) === uid ? m.quantity : 0) - (m.fromLocation === loc && (m.fromUid || m.technicianUid) === uid ? m.quantity : 0), 0);
  ok(moves.length >= 2 && moves.every((m) => m.quantity > 0 && m.opId), 'every movement is in the ledger with its operation');
  const ret = all('returns', (d) => d.sourceJobId === g.id)[0];
  ok(ret.partId === 'spHE' && ret.serviceCenterUid === 'gSC' && ret.quantity === 1, 'one defective part owed for the one part fitted');
  const credit = all('walletTransactions', (d) => d.sourceJobId === g.id)[0];
  ok(credit.amount === t.serviceCharge && t.billingTotal === 0 && t.billingType === 'claim', 'technician credit = ticket service charge; the customer pays nothing');
  ok(tr.customerCharge === null, 'customer-facing record shows no charge for a warranty job');
  // The feedback is on the ticket, the feedback record and the timeline.
  ok(t.customerFeedback.rating === get(`serviceFeedback/${g.ticketId}`).rating && tr.events.some((e) => e.type === 'feedback'), 'rating matches everywhere');
  // Out-of-warranty variant: the customer is charged; the verdict is out_of_warranty everywhere; no wallet credit.
  const g2 = await golden(6, { purchased: monthsAgo(40) });
  const t2 = get(g2.T);
  ok(t2.warrantyStatus === 'in_warranty', 'the heating element has 5 years of cover, so a 40-month-old geyser is still covered for that part');
  ok(get(`publicTicketStatus/${g2.ticketId}`).warrantyStatus === t2.warrantyStatus, 'public status follows the verdict');
});

test('P9.18 non-destructive: the whole lifecycle can run again and again without touching master data', async () => {
  seedMasters();
  const before = masters();
  const runs = [];
  for (let i = 10; i < 13; i++) runs.push(await golden(i));
  ok(masters() === before, 'plans, parts, rate cards, pincodes, centers, technicians and users are unchanged after three full runs');
  const ids = runs.flatMap((r) => [r.regId, r.ticketId, get(`spareRequests/${r.sr}`).requestId]);
  ok(new Set(ids).size === ids.length, 'ids from three runs are all different');
  ok(new Set(runs.map((r) => r.id)).size === 3 && runs.every((r) => get(r.T).status === 'closed'), 'three separate closed tickets');
  ok(all('productRegistrations', (d) => /^GOLD-/.test(d.serialNumber || '')).length >= runs.length && runs.every((r) => all('productRegistrations', (d) => d.registrationId === r.regId).length === 1), 'one registration per run');
  // Stock: only what the runs used has moved (1 element each), never below zero.
  ok(get('inventory/servicecenter_gSC_spHE').quantity === 5 - 3 && !get('inventory/technician_gT_spHE').quantity, 'center stock down by exactly the three parts used');
  const used = all('stockMovements', (d) => d.type === 'consume').length;
  ok(used >= 3, 'each run consumed its part');
  ok(all('inventory').every((d) => d.quantity >= 0), 'no negative stock');
  // Replaying every trigger of a finished run changes nothing.
  const g = runs[0];
  const entries = () => new Map([...store.entries()].filter(([p]) => !/^(counters|notifications)/.test(p)).map(([p, d]) => [p, JSON.stringify(d).replace(/"(updatedAt|at)":\{"ms":\d+\}/g, '')]));
  const s0 = entries();
  await created('trackOnPublicRequest', g.pubPath, { docId: g.ticketId });
  await track('centerRequests', g.id);
  await created('processFeedback', `serviceFeedback/${g.ticketId}`, { ticketId: g.ticketId });
  await created('sparesOpCreated', `stockOps/gc${g.n}`, { opId: `gc${g.n}` });
  await created('sparesOpCreated', `stockOps/gt${g.n}`, { opId: `gt${g.n}` });
  await F.escalationSweep.handler({ scheduleTime: new Date().toISOString() });
  const s1 = entries();
  const changed = [...new Set([...s0.keys(), ...s1.keys()])].filter((k) => s0.get(k) !== s1.get(k));
  ok(changed.length === 0, 'replaying the triggers of a finished run changes no record (changed: ' + changed.join(', ') + ')');
  ok(masters() === before, 'masters still unchanged after the replay');
  // Master references: tickets carry ids to the masters, not copies of them.
  const t = get(runs[0].T);
  ok(t.serviceCenterUid === 'gSC' && t.technicianUid === 'gT' && !('pincodeMaster' in t) && !('territory' in t), 'the ticket points at the center and technician by id');
});
