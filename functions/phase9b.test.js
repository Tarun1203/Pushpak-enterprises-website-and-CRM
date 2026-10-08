// Phase 9 — end-to-end business workflow, items 6-10: technician matching,
// appointment lifecycle, service job lifecycle, spare parts lifecycle, and
// billing & warranty claims. Real index.js functions against the in-memory
// Firestore stand-in, driving the triggers the way Firestore would (with the
// writer's uid where the check depends on who wrote).
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
const TM = require('./technicianMatch');
const Appointment = require('./appointment');
const { store, DocRef, Snap, Timestamp } = fake;
const test = require('node:test');
const assert = require('node:assert');
const get = (p) => store.get(p);
const ref = (p) => { const [c, id] = p.split('/'); return new DocRef(c, id); };
const set = (p, d) => store.set(p, d);
const ok = (cond, msg) => assert.ok(cond, msg);
const all = (coll, pred = () => true) => [...store.entries()].filter(([p, d]) => p.startsWith(coll + '/') && pred(d)).map(([p, d]) => ({ path: p, ...d }));
async function created(fn, p, params = {}, authId) { await F[fn].handler({ data: new Snap(ref(p)), params: { ...params }, authId }); }
// A write by `authId` (the uid Firestore reports); the trigger sees before/after.
async function by(fn, p, change, authId, params = {}) {
  const before = new Snap(ref(p));
  set(p, { ...get(p), ...change });
  await F[fn].handler({ data: { before, after: new Snap(ref(p)) }, params, authId });
}
const todayIso = new Date().toISOString().slice(0, 10);
const dayIso = (n) => { const d = new Date(Appointment.todayIST(Date.now()) + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// ---------------------------------------------------------------------
// Item 6 — Technician matching
// ---------------------------------------------------------------------
test('P9.6 technician matching: eligibility, skills, availability, workload, and the server-side assignment check', () => {
  const rank = (ticket, roster, extra = {}) => TM.rankTechnicians({ ticket, roster, today: todayIso, ...extra });
  const tk = { brand: 'MakWell', category: 'Geyser' };
  const users = {
    a: { brandsAuthorized: ['makwell'], skills: [{ category: 'geyser' }] },
    b: { brandsAuthorized: ['makwell'], skills: [{ category: 'LED TV' }] },
    c: { brandsAuthorized: ['flyvision'], skills: [{ category: 'Geyser' }] },
    d: { brandsAuthorized: ['MakWell'], skills: [{ category: 'Geyser' }], accountType: 'temporary', contractEndDate: '2020-01-01' },
    e: { brandsAuthorized: ['makwell'], skills: [{ category: 'geyser' }] },
    f: {}
  };
  const roster = ['a', 'b', 'c', 'd', 'e', 'f'].map((u) => ({ id: 'r' + u, name: 'Tech ' + u.toUpperCase(), technicianUid: u }));
  const avail = { a: { status: 'available' }, b: { status: 'available' }, e: { status: 'in_progress' } };
  const out = rank(tk, roster, { users, avail, openCounts: { a: 1 } });
  const by = (u) => out.find((x) => x.uid === u);
  ok(by('a').eligible && !by('a').warnings.length, 'brand + skill + available -> clean');
  ok(by('b').eligible && by('b').warnings.some((w) => /no skill listed/.test(w)), 'right brand, wrong skill -> allowed with a warning (skills lists are often incomplete)');
  ok(!by('c').eligible && /not authorized for this brand/.test(by('c').excludedReason), 'brand not authorised -> out');
  ok(!by('d').eligible && by('d').excludedReason === 'contract expired', 'expired contract -> out');
  ok(by('e').eligible && by('e').warnings.includes('busy now') && by('e').score < by('a').score, 'busy technician ranks lower, flagged');
  ok(by('f').eligible && by('f').warnings.some((w) => /no brand authorization|no skills/.test(w)), 'nothing on file -> allowed, flagged');
  ok(out[0].uid === 'a' && out.slice(0, 3).every((x) => x.eligible) && out.filter((x) => !x.eligible).every((x) => out.indexOf(x) >= out.filter((y) => y.eligible).length), 'eligible first, best first, ineligible last');

  // Workload: each open job costs 2 points; equal scores fall back to name.
  const eq = rank(tk, [{ id: 'r1', name: 'Zed', technicianUid: 'a' }, { id: 'r2', name: 'Amy', technicianUid: 'e' }], { users, avail: { a: { status: 'available' }, e: { status: 'available' } }, openCounts: { a: 3, e: 0 } });
  ok(eq[0].uid === 'e' && eq[0].score - eq[1].score === 6, 'fewer open jobs ranks higher (2 points per job)');
  const tie = rank(tk, [{ id: 'r1', name: 'Zed', technicianUid: 'a' }, { id: 'r2', name: 'Amy', technicianUid: 'e' }], { users, avail: { a: { status: 'available' }, e: { status: 'available' } } });
  ok(tie[0].name === 'Amy', 'tie -> by name, so the order never flickers');
  // Certification and the brand/category match are case-insensitive.
  const cert = rank({ brand: 'MAKWELL', category: 'GEYSER' }, [{ id: 'r1', name: 'C', technicianUid: 'a', productCapabilities: [{ brand: 'makwell', category: 'geyser', certified: true }] }, { id: 'r2', name: 'D', technicianUid: 'e' }], { users, avail: { a: { status: 'available' }, e: { status: 'available' } } });
  ok(cert[0].uid === 'a' && cert[0].score === cert[1].score + 5, 'certified for the brand: +5');

  // Availability states.
  for (const [status, excluded] of [['leave', 'on leave'], ['holiday', 'on holiday']]) {
    const r = rank(tk, [{ id: 'r', name: 'X', technicianUid: 'a' }], { users, avail: { a: { status } } })[0];
    ok(!r.eligible && r.excludedReason === excluded, status);
  }
  ok(rank(tk, [{ id: 'r', name: 'X', technicianUid: 'a' }], { users, avail: { a: { status: 'offline' } } })[0].warnings.includes('offline'), 'offline is flagged, not excluded');
  ok(rank(tk, [{ id: 'r', name: 'X', technicianUid: 'a' }], { users, avail: { a: { status: 'available', suspended: true } } })[0].excludedReason === 'suspended', 'suspended flag');
  for (const st of ['SUSPENDED', 'TERMINATED', 'RESIGNED', 'ON_LEAVE']) {
    ok(!rank(tk, [{ id: 'r', name: 'X', technicianUid: 'a', employmentStatus: st }], { users })[0].eligible, 'employment ' + st);
  }
  // Approved leave blocks on the day; pending/rejected leave and other days do not.
  const leave = (status, s, e) => ({ id: 'r', name: 'X', technicianUid: 'a', leaveRecords: [{ status, startDate: s, endDate: e }] });
  ok(rank(tk, [leave('APPROVED', dayIso(-1), dayIso(2))], { users })[0].excludedReason === 'on approved leave', 'approved leave covering today');
  ok(rank(tk, [leave('PENDING', dayIso(-1), dayIso(2))], { users })[0].eligible, 'pending leave does not block');
  ok(rank(tk, [leave('REJECTED', dayIso(-1), dayIso(2))], { users })[0].eligible, 'rejected leave does not block');
  ok(rank(tk, [leave('APPROVED', dayIso(3), dayIso(5))], { users })[0].eligible, 'leave on other days does not block today');
  ok(!rank(tk, [leave('APPROVED', dayIso(3), dayIso(5))], { users, date: dayIso(4) })[0].eligible, 'but blocks the appointment date when one is given');
  // Everyone unavailable: nobody is eligible, and each has a reason to show.
  const none = rank(tk, [{ id: 'r1', name: 'A', technicianUid: 'a' }, { id: 'r2', name: 'C', technicianUid: 'c' }], { users, avail: { a: { status: 'leave' } } });
  ok(none.every((x) => !x.eligible && x.excludedReason), 'all unavailable -> none eligible, reasons given');
  ok(rank(tk, [], {}).length === 0, 'empty roster');
});

test('P9.6 the server re-checks a center\'s technician choice (roster, brand, approved leave on the appointment day)', async () => {
  set('users/m1', { role: 'servicecenter', name: 'M Center' });
  set('users/mT', { role: 'technician', name: 'Tech M', linkedServiceCenterUid: 'm1', brandsAuthorized: ['makwell'] });
  set('users/mF', { role: 'technician', name: 'Tech F', linkedServiceCenterUid: 'm1', brandsAuthorized: ['flyvision'] });
  set('users/mL', { role: 'technician', name: 'Tech L', linkedServiceCenterUid: 'm1', brandsAuthorized: ['makwell'] });
  set('users/mOut', { role: 'technician', name: 'Other center' });
  set('centerTechnicians/cmT', { serviceCenterUid: 'm1', technicianUid: 'mT', name: 'Tech M' });
  set('centerTechnicians/cmF', { serviceCenterUid: 'm1', technicianUid: 'mF', name: 'Tech F' });
  set('centerTechnicians/cmL', { serviceCenterUid: 'm1', technicianUid: 'mL', name: 'Tech L', leaveRecords: [{ status: 'APPROVED', startDate: dayIso(2), endDate: dayIso(3) }] });
  const ticket = () => { set('centerRequests/mk', { requestId: 'PE-MK', serviceCenterUid: 'm1', status: 'new', brand: 'MakWell', category: 'Geyser' }); };
  const assign = (tech, extra = {}) => by('checkAssignmentOnUpdate', 'centerRequests/mk', { technicianUid: tech, technicianName: tech, status: 'assigned', ...extra }, 'm1', { docId: 'mk' });
  ticket(); await assign('mOut');
  ok(!get('centerRequests/mk').technicianUid && /roster/.test(get('centerRequests/mk').assignmentRejected.reason), 'not on the roster');
  ticket(); await assign('mF');
  ok(!get('centerRequests/mk').technicianUid && /brand/.test(get('centerRequests/mk').assignmentRejected.reason), 'not authorised for the brand');
  ticket(); await assign('mT');
  ok(get('centerRequests/mk').technicianUid === 'mT' && !get('centerRequests/mk').assignmentRejected, 'eligible technician accepted');
  ticket(); await assign('mL');
  ok(get('centerRequests/mk').technicianUid === 'mL', 'on leave later, not today: accepted for now');
  ticket(); await assign('mL', { scheduledDate: dayIso(2) });
  ok(!get('centerRequests/mk').technicianUid && /approved leave/.test(get('centerRequests/mk').assignmentRejected.reason), 'approved leave on the appointment day: refused');
});

// ---------------------------------------------------------------------
// Item 7 — Appointment lifecycle
// ---------------------------------------------------------------------
test('P9.7 appointments: propose, assign, validate, clash, reschedule, cancel — and the history the customer sees', async () => {
  set('users/aC', { role: 'servicecenter', name: 'A Center' });
  set('users/aT1', { role: 'technician', name: 'Tech 1', linkedServiceCenterUid: 'aC' });
  set('users/aT2', { role: 'technician', name: 'Tech 2', linkedServiceCenterUid: 'aC' });
  set('users/aT3', { role: 'technician', name: 'Tech 3', linkedServiceCenterUid: 'aC' });
  set('centerTechnicians/ca1', { serviceCenterUid: 'aC', technicianUid: 'aT1', name: 'Tech 1' });
  set('centerTechnicians/ca2', { serviceCenterUid: 'aC', technicianUid: 'aT2', name: 'Tech 2' });
  set('centerTechnicians/ca3', { serviceCenterUid: 'aC', technicianUid: 'aT3', name: 'Tech 3', leaveRecords: [{ status: 'APPROVED', startDate: dayIso(5), endDate: dayIso(6) }, { status: 'PENDING', startDate: dayIso(8), endDate: dayIso(8) }] });
  const D = dayIso(1);
  const mk = (id, over = {}) => set(`centerRequests/${id}`, { requestId: id, serviceCenterUid: 'aC', status: 'assigned', customerName: 'Cust ' + id, customerPhone: '9100000071', category: 'Geyser', type: 'service', ...over });
  const slot = (id, date, start, end, extra = {}) => by('checkScheduleOnUpdate_centerRequests', 'centerRequests/' + id, { scheduledDate: date, scheduledStartTime: start, scheduledEndTime: end, ...extra }, 'aC', { docId: id });
  const rejected = (id) => (get('centerRequests/' + id).scheduleRejected || {}).reason;
  const slotOfDoc = (id) => [get('centerRequests/' + id).scheduledDate, get('centerRequests/' + id).scheduledStartTime, get('centerRequests/' + id).scheduledEndTime].join(' ');

  // Propose before anyone is assigned, then assign.
  mk('a1', { technicianUid: 'aT1', technicianName: 'Tech 1' });
  await slot('a1', D, '10:00', '12:00');
  ok(!rejected('a1') && slotOfDoc('a1') === `${D} 10:00 12:00`, 'valid slot accepted');
  // Validation, each refused with a reason, the old slot kept.
  const bad = [
    [dayIso(-1), '10:00', '11:00', /past/], [dayIso(400).slice(0, 5) + '02-30', '10:00', '11:00', /not valid/], [D, '10:00', null, /both a start and end/], [D, '12:00', '11:00', /after start/],
    [D, '07:00', '09:00', /between 08:00 and 20:00/], [D, '19:00', '21:00', /between 08:00 and 20:00/], [D, '10:00', '10:15', /at least 30/], [D, '08:00', '17:00', /at most 8/]
  ];
  for (const [d, s, e, re] of bad) {
    await slot('a1', d, s, e);
    ok(re.test(rejected('a1') || ''), `${d} ${s}-${e}: ${rejected('a1')}`);
    ok(slotOfDoc('a1') === `${D} 10:00 12:00`, 'refused slot is put back');
  }
  ok(!!rejected('a1'), 'the last refusal is shown until the next change');
  await slot('a1', D, '10:30', '12:00');
  ok(!rejected('a1'), 'a later valid change clears the rejection');
  await slot('a1', D, '10:00', '12:00');

  // Clashes: same technician, overlapping; touching is fine; other technician fine; finished tickets don't block.
  mk('a2', { technicianUid: 'aT1', technicianName: 'Tech 1' });
  await slot('a2', D, '11:00', '13:00');
  ok(/already booked 10:00-12:00/.test(rejected('a2')) && !get('centerRequests/a2').scheduledDate, 'overlap with the same technician refused, names the clash');
  await slot('a2', D, '12:00', '14:00');
  ok(!rejected('a2') && slotOfDoc('a2') === `${D} 12:00 14:00`, 'back-to-back is allowed');
  mk('a3', { technicianUid: 'aT2', technicianName: 'Tech 2' });
  await slot('a3', D, '10:30', '11:30');
  ok(!rejected('a3'), 'a different technician is free at the same time');
  // A technician's own direct job (serviceJobs) blocks the same time.
  set('serviceJobs/jobA', { jobId: 'JOB-A', technicianUid: 'aT2', status: 'in_progress', scheduledDate: D, scheduledStartTime: '15:00', scheduledEndTime: '16:00' });
  mk('a4', { technicianUid: 'aT2', technicianName: 'Tech 2' });
  await slot('a4', D, '15:30', '16:30');
  ok(/already booked 15:00-16:00/.test(rejected('a4')), 'clash with a direct job is caught across both collections');
  // Cancelled / completed bookings no longer occupy the technician.
  set('serviceJobs/jobA', { ...get('serviceJobs/jobA'), status: 'cancelled' });
  await slot('a4', D, '15:30', '16:30');
  ok(!rejected('a4'), 'cancelled job frees the time');

  // Reschedule: the old time is free again, the new time is checked.
  await slot('a1', D, '09:00', '10:00');
  ok(!rejected('a1') && slotOfDoc('a1') === `${D} 09:00 10:00`, 'rescheduled');
  mk('a5', { technicianUid: 'aT1', technicianName: 'Tech 1' });
  await slot('a5', D, '10:00', '11:00');
  ok(!rejected('a5'), 'the old 10:00 slot can be booked by someone else');
  // Cancel the appointment (clear the slot): always allowed.
  await by('checkScheduleOnUpdate_centerRequests', 'centerRequests/a5', { scheduledDate: '', scheduledStartTime: '', scheduledEndTime: '' }, 'aC', { docId: 'a5' });
  ok(!rejected('a5') && !get('centerRequests/a5').scheduledDate, 'appointment cancelled');

  // Technician on approved leave that day (pending leave does not block).
  mk('a6', { technicianUid: 'aT3', technicianName: 'Tech 3' });
  await slot('a6', dayIso(5), '10:00', '11:00');
  ok(/approved leave/.test(rejected('a6')), 'approved leave blocks the day');
  await slot('a6', dayIso(8), '10:00', '11:00');
  ok(!rejected('a6'), 'pending leave does not block');

  // Giving an existing appointment to a technician who can't take it (same slot, new technician).
  mk('a7', { technicianUid: 'aT2', technicianName: 'Tech 2', scheduledDate: D, scheduledStartTime: '12:30', scheduledEndTime: '13:30' });
  await by('checkScheduleOnUpdate_centerRequests', 'centerRequests/a7', { technicianUid: 'aT1', technicianName: 'Tech 1' }, 'aC', { docId: 'a7' });
  ok(/already booked 12:00-14:00/.test(rejected('a7')), 'reassigned appointment clashes with the new technician\'s day');
  ok(get('centerRequests/a7').technicianUid === 'aT2' && get('centerRequests/a7').technicianName === 'Tech 2' && slotOfDoc('a7') === `${D} 12:30 13:30`, 'assignment put back, appointment untouched');
  mk('a8', { technicianUid: 'aT2', technicianName: 'Tech 2', scheduledDate: dayIso(5), scheduledStartTime: '10:00', scheduledEndTime: '11:00' });
  await by('checkScheduleOnUpdate_centerRequests', 'centerRequests/a8', { technicianUid: 'aT3', technicianName: 'Tech 3' }, 'aC', { docId: 'a8' });
  ok(/approved leave/.test(rejected('a8')) && get('centerRequests/a8').technicianUid === 'aT2', 'reassigned onto someone on approved leave: refused');
  mk('a9', { technicianUid: 'aT2', technicianName: 'Tech 2', scheduledDate: dayIso(3), scheduledStartTime: '10:00', scheduledEndTime: '11:00' });
  await by('checkScheduleOnUpdate_centerRequests', 'centerRequests/a9', { technicianUid: 'aT1', technicianName: 'Tech 1' }, 'aC', { docId: 'a9' });
  ok(!rejected('a9') && get('centerRequests/a9').technicianUid === 'aT1', 'reassigned to a free technician: accepted');
  // First assignment (no technician before) that clashes: status goes back too.
  mk('a10', { status: 'new', scheduledDate: D, scheduledStartTime: '09:30', scheduledEndTime: '10:30' });
  await by('checkScheduleOnUpdate_centerRequests', 'centerRequests/a10', { technicianUid: 'aT1', technicianName: 'Tech 1', status: 'assigned' }, 'aC', { docId: 'a10' });
  ok(!get('centerRequests/a10').technicianUid && get('centerRequests/a10').status === 'new' && /already booked/.test(rejected('a10')), 'first assignment refused: technician and status back as before');

  // Writes with no signed-in user (the functions themselves) are not re-checked.
  await by('checkScheduleOnUpdate_centerRequests', 'centerRequests/a1', { scheduledDate: dayIso(-3) }, undefined, { docId: 'a1' });
  ok(!rejected('a1'), 'server writes are not second-guessed');

  // The customer's tracking record keeps every change: booked, moved, cancelled.
  const track = async (id) => F.trackSync_centerRequests.handler({ data: { after: new Snap(ref('centerRequests/' + id)) }, params: { docId: id } });
  mk('t1', { requestId: 'PE-T1', technicianUid: 'aT1', technicianName: 'Tech 1' });
  await track('t1');
  ok(get('customerTracking/PE-T1').appointmentHistory.length === 0 && get('customerTracking/PE-T1').appointment === null, 'no appointment yet, nothing in the history');
  set('centerRequests/t1', { ...get('centerRequests/t1'), scheduledDate: dayIso(2), scheduledStartTime: '10:00', scheduledEndTime: '12:00' });
  await track('t1'); await track('t1');
  set('centerRequests/t1', { ...get('centerRequests/t1'), scheduledStartTime: '14:00', scheduledEndTime: '16:00' });
  await track('t1');
  set('centerRequests/t1', { ...get('centerRequests/t1'), scheduledDate: '', scheduledStartTime: '', scheduledEndTime: '' });
  await track('t1');
  const h = get('customerTracking/PE-T1').appointmentHistory;
  ok(h.length === 3 && h[0].start === '10:00' && h[0].technicianName === 'Tech 1' && h[1].start === '14:00' && h[2].cancelled === true, 'booked -> moved -> cancelled, once each');
  ok(get('customerTracking/PE-T1').appointment === null, 'current appointment cleared');
});

// ---------------------------------------------------------------------
// Item 8 — Service job lifecycle
// ---------------------------------------------------------------------
test('P9.8 job lifecycle: the legal path, every illegal jump, closure evidence, staff powers, history', async () => {
  set('users/lT', { role: 'technician', name: 'LT', linkedServiceCenterUid: 'lC' });
  set('users/lT2', { role: 'technician', name: 'LT2' });
  set('users/lC', { role: 'servicecenter', name: 'LC' });
  set('users/lSA', { role: 'superadmin', name: 'Boss' });
  set('users/lWH', { role: 'warehouse', name: 'WH' });
  const CLOSE = { closureCode: 'REPAIRED', actionTaken: 'Replaced element', partsUsedNotes: 'Element x1' };
  for (const coll of ['centerRequests', 'serviceJobs']) {
    const fn = 'checkLifecycle_' + coll;
    const path = `${coll}/lf-${coll}`; const params = { docId: 'lf-' + coll };
    set(path, { requestId: 'PE-LF', jobId: 'PE-LF', serviceCenterUid: 'lC', technicianUid: 'lT', customerPhone: '9100000081', status: 'new', category: 'Geyser' });
    const move = async (to, who, extra = {}) => { await by(fn, path, { status: to, ...extra }, who, params); return get(path); };
    const stays = async (to, who, extra) => { const t = await move(to, who, extra); ok(t.status === to && !t.lifecycleRejected, `${coll}: ${to} by ${who}`); };
    const refuses = async (to, who, re, extra) => { const from = get(path).status; const t = await move(to, who, extra); ok(t.status === from && re.test((t.lifecycleRejected || {}).reason || ''), `${coll}: ${from} -> ${to} by ${who} refused (${(t.lifecycleRejected || {}).reason})`); const wipe = {}; for (const k of Object.keys(extra || {})) wipe[k] = ''; set(path, { ...get(path), ...wipe, lifecycleRejected: null }); };

    await refuses('accepted', 'lT', /can't move from "new" to "accepted"/);
    await refuses('completed', 'lT', /can't move/);
    await stays('assigned', 'lC');
    await refuses('completed', 'lT', /can't move from "assigned" to "completed"/, { ...CLOSE, closedByUid: 'lT' });
    await refuses('verification', 'lT', /can't move/);
    await refuses('closed', 'lT', /can't move/);
    await refuses('reopened', 'lT', /can't move/);
    await stays('accepted', 'lT');
    await stays('on_the_way', 'lT');
    await stays('at_customer', 'lT');
    await stays('in_progress', 'lT');
    // Waiting for a spare and back to work.
    await stays('waiting_spare', 'lT'); await refuses('completed', 'lT', /can't move/); await stays('in_progress', 'lT');
    // Completion needs the evidence, under the closer's own account.
    await refuses('completed', 'lT', /Closing needs: closureCode, actionTaken, partsUsedNotes/);
    await refuses('completed', 'lT', /Closing needs: actionTaken/, { closureCode: 'X', partsUsedNotes: 'p', actionTaken: '   ' });
    await refuses('completed', 'lT', /under your own account/, { ...CLOSE, closedByUid: 'someoneElse' });
    await stays('completed', 'lT', { ...CLOSE, closedByUid: 'lT' });
    // Nothing moves a finished job except Head Office.
    for (const to of ['in_progress', 'assigned', 'new', 'cancelled', 'reopened', 'closed']) await refuses(to, 'lT', /can't move from "completed"/);
    await refuses('closed', 'lC', /can't move from "completed"/);
    await stays('verification', 'lWH');
    await stays('closed', 'lSA');
    await stays('reopened', 'lSA');
    // A reopened job goes back to the technician's flow; cancelling is final for them.
    await refuses('closed', 'lT', /can't move from "reopened"/);
    await stays('in_progress', 'lT');
    await stays('cancelled', 'lT');
    for (const to of ['in_progress', 'assigned', 'completed']) await refuses(to, 'lT', /can't move from "cancelled"/);
    await stays('assigned', 'lWH');
    // Declined by the technician, handed back, reassigned.
    await stays('accepted', 'lT');
    await stays('reassignment_required', 'lT');
    await refuses('accepted', 'lT', /can't move from "reassignment_required"/);
    await stays('assigned', 'lC');
    // Same status is not a move; server writes and unknown accounts are not checked.
    await by(fn, path, { notes: 'x' }, 'lT', params); ok(get(path).status === 'assigned', 'same status ignored');
    await by(fn, path, { status: 'closed' }, undefined, params); ok(get(path).status === 'closed', 'server write not checked');
    await by(fn, path, { status: 'new' }, 'ghost-uid', params); ok(get(path).status === 'new', 'a uid with no user account is not checked');
  }

  // The customer's timeline follows the same steps in order, once each.
  set('centerRequests/lh', { requestId: 'PE-LH', serviceCenterUid: 'lC', customerPhone: '9100000082', status: 'new', type: 'service', category: 'Geyser', createdAt: Timestamp.now() });
  for (const st of ['new', 'assigned', 'assigned', 'accepted', 'in_progress', 'completed', 'completed', 'closed']) {
    set('centerRequests/lh', { ...get('centerRequests/lh'), status: st });
    await F.trackSync_centerRequests.handler({ data: { after: new Snap(ref('centerRequests/lh')) }, params: { docId: 'lh' } });
  }
  ok(get('customerTracking/PE-LH').history.map((h) => h.status).join() === 'new,assigned,accepted,in_progress,completed,closed', 'tracking history: each status once, in order');
});

// ---------------------------------------------------------------------
// Item 9 — Spare parts lifecycle
// ---------------------------------------------------------------------
test('P9.9 spares: request -> pipeline -> stock -> use on a job -> defective return, with every failure path', async () => {
  set('spareParts/spE', { name: 'Heating Element', partCode: 'HE-1', reorderLevel: 2 });
  set('spareParts/spK', { name: 'Knob' });
  set('users/sC', { role: 'servicecenter', email: 'sc@x', name: 'SC' });
  set('users/sC2', { role: 'servicecenter', email: 'sc2@x' });
  set('users/sT', { role: 'technician', email: 'st@x', linkedServiceCenterUid: 'sC' });
  set('users/sT2', { role: 'technician', email: 'st2@x', linkedServiceCenterUid: 'sC2' });
  set('users/sWH', { role: 'warehouse', email: 'wh@x' });
  set('users/sSA', { role: 'superadmin', email: 'sa@x' });
  set('centerRequests/sJ', { requestId: 'PE-SJ', serviceCenterUid: 'sC', technicianUid: 'sT', status: 'in_progress', category: 'Geyser' });
  const job = { coll: 'centerRequests', id: 'sJ' };
  const op = async (id, data) => { set(`stockOps/${id}`, { status: 'pending', ...data }); await created('sparesOpCreated', `stockOps/${id}`, { opId: id }); return get(`stockOps/${id}`); };
  const qty = (loc, uid, part) => (get(`inventory/${loc}_${uid}_${part}`) || {}).quantity || 0;

  // A technician asks for a part; a second identical request is flagged.
  const request = async (id, over = {}) => { set(`spareRequests/${id}`, { requestId: 'PE-SR-' + id, partId: 'spE', item: 'Heating Element', quantity: 1, status: 'new', sourceJobId: 'sJ', sourceJobCollection: 'centerRequests', requestedByUid: 'sT', ...over }); await created('flagDuplicateSpareRequest', `spareRequests/${id}`, { docId: id }); return get(`spareRequests/${id}`); };
  ok((await request('q1')).possibleDuplicateOf.length === 0, 'first request: not a duplicate');
  ok((await request('q2')).possibleDuplicateOf.join() === 'PE-SR-q1', 'same part, same job, still open -> flagged with the first request');
  ok((await request('q3', { partId: 'spK' })).possibleDuplicateOf.length === 0, 'a different part is not a duplicate');
  ok((await request('q4', { sourceJobId: 'otherJob' })).possibleDuplicateOf.length === 0, 'the same part on another job is not a duplicate');
  set('spareRequests/q1', { ...get('spareRequests/q1'), status: 'received' });
  ok((await request('q5')).possibleDuplicateOf.join() === 'PE-SR-q2', 'a request that was received no longer counts');
  ok((await request('q6', { status: 'fulfilled_by_center' })).possibleDuplicateOf === undefined, 'issued from the center\'s own shelf: nothing to flag');

  // The warehouse pipeline: only legal steps, dispatch needs a transporter and docket.
  const pipe = (id, to, who, extra = {}) => by('checkSparePipeline', `spareRequests/${id}`, { status: to, ...extra }, who, { docId: id });
  const pipeState = (id) => get(`spareRequests/${id}`);
  set('spareRequests/pl', { requestId: 'PE-PL', partId: 'spE', status: 'new', requestedByUid: 'sT' });
  await pipe('pl', 'received', 'sWH'); ok(pipeState('pl').status === 'new' && pipeState('pl').pipelineRejected, 'new -> received refused, even for Warehouse');
  await pipe('pl', 'approved', 'sWH'); ok(pipeState('pl').status === 'approved', 'approved');
  await pipe('pl', 'dispatched', 'sWH'); ok(pipeState('pl').status === 'approved', 'dispatch without transporter/docket refused');
  await pipe('pl', 'picking', 'sWH'); await pipe('pl', 'packing', 'sWH');
  await pipe('pl', 'dispatched', 'sWH', { transport: { transporter: 'VRL', docket: '123' } }); ok(pipeState('pl').status === 'dispatched', 'dispatched with docket');
  await pipe('pl', 'new', 'sSA'); ok(pipeState('pl').status === 'dispatched', 'cannot go backwards, even Super Admin');
  await pipe('pl', 'intransit', 'sWH'); await pipe('pl', 'received', 'sT'); ok(pipeState('pl').status === 'received', 'received');
  await pipe('pl', 'dispatched', 'sSA'); ok(pipeState('pl').status === 'received', 'received is final');

  // Stock arrives at the center (the dispatch screen moves it in the same step); center -> technician -> job.
  set('inventory/servicecenter_sC_spE', { partId: 'spE', location: 'servicecenter', serviceCenterUid: 'sC', quantity: 3 });
  let r = await op('o1', { type: 'transfer_to_technician', byUid: 'sC', techUid: 'sT', lines: [{ partId: 'spE', qty: 2 }], job });
  ok(r.status === 'done' && qty('servicecenter', 'sC', 'spE') === 1 && qty('technician', 'sT', 'spE') === 2, 'center -> technician: 3 becomes 1 + 2');
  // Failure paths: nothing changes.
  const stock = () => [qty('servicecenter', 'sC', 'spE'), qty('technician', 'sT', 'spE')].join();
  const refused = async (id, data, re) => { const s0 = stock(), n0 = all('stockMovements').length; const x = await op(id, data); ok(x.status === 'rejected' && re.test(x.reason), `${id}: ${x.reason}`); ok(stock() === s0 && all('stockMovements').length === n0, `${id}: nothing moved`); };
  await refused('f1', { type: 'consume', byUid: 'sT', lines: [{ partId: 'spE', qty: 3 }], job }, /Only 2 of Heating Element/);
  await refused('f2', { type: 'consume', byUid: 'sT2', lines: [{ partId: 'spE', qty: 1 }], job }, /isn't assigned to you/);
  await refused('f3', { type: 'consume', byUid: 'sC2', lines: [{ partId: 'spE', qty: 1 }], job }, /isn't your center's/);
  await refused('f4', { type: 'consume', byUid: 'sT', lines: [{ partId: 'spE', qty: 1 }] }, /against a job/);
  await refused('f5', { type: 'consume', byUid: 'sT', lines: [{ partId: 'spE', qty: 1 }], job: { coll: 'users', id: 'sT' } }, /Unknown job/);
  await refused('f6', { type: 'consume', byUid: 'sT', lines: [{ partId: 'spE', qty: 1 }], job: { coll: 'centerRequests', id: 'gone' } }, /no longer exists/);
  await refused('f7', { type: 'consume', byUid: 'sT', lines: [{ partId: 'nope', qty: 1 }], job }, /part master/);
  for (const [lines, re] of [[[{ partId: 'spE', qty: 0 }], /whole numbers/], [[{ partId: 'spE', qty: -1 }], /whole numbers/], [[{ partId: 'spE', qty: 1.5 }], /whole numbers/], [[{ partId: 'spE', qty: 1001 }], /whole numbers/],
    [[{ partId: 'spE', qty: 1 }, { partId: 'spE', qty: 1 }], /twice/], [[], /No parts/], [null, /No parts/], [Array.from({ length: 21 }, (_, i) => ({ partId: 'p' + i, qty: 1 })), /At most 20/]]) {
    await refused('v' + Math.random().toString(36).slice(2, 6), { type: 'consume', byUid: 'sT', lines, job }, re);
  }
  await refused('f8', { type: 'send_back', byUid: 'sT', lines: [{ partId: 'spE', qty: 1 }] }, /Only a service center sends stock back/);
  await refused('f9', { type: 'send_back', byUid: 'sC', lines: [{ partId: 'spE', qty: 5 }] }, /Only 1 of Heating Element/);
  await refused('f10', { type: 'transfer_to_technician', byUid: 'sT', techUid: 'sT', lines: [{ partId: 'spE', qty: 1 }] }, /Only a service center/);
  await refused('f11', { type: 'transfer_to_technician', byUid: 'sC', techUid: 'sT2', lines: [{ partId: 'spE', qty: 1 }] }, /isn't linked to your center/);
  await refused('f12', { type: 'draw_from_center', byUid: 'sC', lines: [{ partId: 'spE', qty: 1 }] }, /Only a technician/);
  await refused('f13', { type: 'remove', byUid: 'sC', lines: [{ partId: 'spE', qty: 1 }], reason: 'x' }, /reason/);
  await refused('f14', { type: 'teleport', byUid: 'sC', lines: [{ partId: 'spE', qty: 1 }] }, /Unknown operation/);
  await refused('f15', { type: 'consume', byUid: 'sWH', lines: [{ partId: 'spE', qty: 1 }], job }, /Only service centers and technicians/);
  await refused('f16', { type: 'consume', byUid: 'nobody', lines: [{ partId: 'spE', qty: 1 }], job }, /Only service centers and technicians/);

  // Use on the job: stock down, ledger line, defective return due at month end, once.
  r = await op('o2', { type: 'consume', byUid: 'sT', lines: [{ partId: 'spE', qty: 1 }], job });
  ok(r.status === 'done' && qty('technician', 'sT', 'spE') === 1, 'one element fitted');
  const ret = all('returns', (d) => d.opId === 'o2')[0];
  ok(ret && ret.status === 'sent_to_center' && ret.serviceCenterUid === 'sC' && ret.sourceJobId === 'sJ' && ret.quantity === 1 && ret.defectiveDueBy && /^PE-RT-\d{8}-\d{4}-Technician$/.test(ret.returnId), 'defective return opened for the technician, due to the center');
  ok(all('stockMovements', (d) => d.opId === 'o2' && d.type === 'consume' && d.sourceJobId === 'sJ' && d.technicianUid === 'sT').length === 1, 'ledger line for the use');
  const s1 = stock(), rets = all('returns').length;
  await created('sparesOpCreated', 'stockOps/o2', { opId: 'o2' });
  ok(stock() === s1 && all('returns').length === rets, 'a retried trigger does not use the part twice');
  // The center hands the defective parts back to Head Office in one send-back.
  set('inventory/servicecenter_sC_spK', { partId: 'spK', location: 'servicecenter', serviceCenterUid: 'sC', quantity: 4 });
  r = await op('o3', { type: 'send_back', byUid: 'sC', lines: [{ partId: 'spK', qty: 2 }], reason: 'Faulty batch' });
  ok(r.status === 'done' && qty('servicecenter', 'sC', 'spK') === 2 && all('returns', (d) => d.opId === 'o3')[0].status === 'requested', 'send-back reduces stock and opens a return');
  ok(new Set(all('returns').map((d) => d.returnId)).size === all('returns').length, 'return ids are unique');

  // Parts can't be added to a finished or cancelled job.
  for (const st of ['completed', 'verification', 'closed', 'cancelled']) {
    set('centerRequests/sJ', { ...get('centerRequests/sJ'), status: st });
    await refused('late-' + st, { type: 'consume', byUid: 'sT', lines: [{ partId: 'spE', qty: 1 }], job }, new RegExp(`already ${st}`));
  }
  set('centerRequests/sJ', { ...get('centerRequests/sJ'), status: 'completed' });
  const rc = await op('late-center', { type: 'consume', byUid: 'sC', lines: [{ partId: 'spK', qty: 1 }], job });
  ok(rc.status === 'done', 'the center may still record a part on a job the technician completed (it bills the job)');
  set('centerRequests/sJ', { ...get('centerRequests/sJ'), status: 'closed' });
  await refused('late-center-closed', { type: 'consume', byUid: 'sC', lines: [{ partId: 'spK', qty: 1 }], job }, /already closed/);

  // No inventory document ever went below zero, and every movement names who did it.
  ok(all('inventory').every((d) => d.quantity >= 0), 'no negative stock anywhere');
  ok(all('stockMovements').every((m) => m.byUid && m.partId && m.quantity > 0 && m.opId), 'every ledger line has actor, part, quantity and op');
});

// ---------------------------------------------------------------------
// Item 10 — Billing & warranty claims
// ---------------------------------------------------------------------
test('P9.10 billing: the server decides the warranty and the charge; claims lock, verify, pay once', async () => {
  const rate = (cat, amt) => set(`serviceChargeRates/${Billing.rateCardKey('default', null, cat, 'repair', null)}`, { amount: amt });
  rate('Geyser', 450);
  set('users/bC', { role: 'servicecenter', name: 'B Center' });
  set('users/bC2', { role: 'servicecenter', name: 'B Center 2' });
  set('users/bT', { role: 'technician', name: 'BT', linkedServiceCenterUid: 'bC' });
  set('users/bT2', { role: 'technician', name: 'BT2' });
  const months = (n) => { const d = new Date(); d.setMonth(d.getMonth() - n); return d.toISOString().slice(0, 10); };
  set('productRegistrations/bR1', { registrationId: 'PE-REG-B1', customerPhone: '9100000091', purchaseDate: months(6), warrantyMonths: 12, serialNumber: 'B-SN-1' });
  set('productRegistrations/bR2', { registrationId: 'PE-REG-B2', customerPhone: '9100000091', purchaseDate: months(30), warrantyMonths: 12, serialNumber: 'B-SN-2' });
  const ticket = (id, reg, over = {}) => set(`centerRequests/${id}`, { requestId: id, serviceCenterUid: 'bC', technicianUid: 'bT', status: 'in_progress', category: 'Geyser', type: 'service', customerPhone: '9100000091', linkedRegistrationId: reg, ...over });
  const complete = async (id) => by('billOnClose_centerRequests', `centerRequests/${id}`, { status: 'completed', closureCode: 'REPAIRED', actionTaken: 'x', partsUsedNotes: 'x', closedByUid: 'bT' }, 'bT', { docId: id });

  // In warranty: the technician's wallet is credited; the customer is not charged; the center's ticket is a zero-total claim line.
  ticket('b1', 'PE-REG-B1'); await complete('b1');
  const t1 = get('centerRequests/b1');
  ok(t1.warrantyStatus === 'in_warranty' && t1.billingType === 'claim' && t1.billingStatus === 'ready_to_claim' && t1.billingTotal === 0 && t1.serviceCharge === 450, 'in warranty: claim line, no customer charge');
  const credit = get('walletTransactions/credit_centerRequests_b1');
  ok(credit.amount === 450 && credit.status === 'unclaimed' && credit.technicianUid === 'bT', 'technician credited the rate-card amount');
  // Out of warranty: no claim, no credit, nothing billed yet (the center bills the customer).
  ticket('b2', 'PE-REG-B2'); await complete('b2');
  ok(get('centerRequests/b2').warrantyStatus === 'out_of_warranty' && !get('centerRequests/b2').billingType && !get('walletTransactions/credit_centerRequests_b2'), 'out of warranty: no credit, not billed yet');

  // Center billing requests.
  const bill = async (id, req, who = 'bC') => { await by('applyBillingRequest', `centerRequests/${id}`, { billingRequest: { byUid: who, requestedAt: Timestamp.now(), ...req } }, who, { docId: id }); return get(`centerRequests/${id}`); };
  const wait = () => new Promise((r) => setTimeout(r, 4));
  let t = await bill('b2', { treatAs: 'out', sparePartsCost: 300.456, otherCharges: 50, serviceCharge: 200, paymentMethod: 'upi', paymentRef: 'UPI-9' });
  ok(t.billingType === 'customer' && t.billingStatus === 'collected' && t.billingTotal === 550.46 && t.customerPaymentMethod === 'upi' && !t.billingRejected, 'out of warranty: total worked out by the server (' + t.billingTotal + ')');
  await wait(); t = await bill('b2', { treatAs: 'out', sparePartsCost: 1, otherCharges: 0, serviceCharge: 0 });
  ok(/Already billed/.test(t.billingRejected.reason) && t.billingTotal === 550.46, 'billed once only');
  // Refusals, each leaves the ticket unbilled.
  const refusal = async (id, req, re, who) => { await wait(); const x = await bill(id, req, who); ok(!x.billingStatus && re.test((x.billingRejected || {}).reason || ''), `${id}: ${(x.billingRejected || {}).reason}`); };
  ticket('b3', 'PE-REG-B2', { status: 'completed' });
  for (const [req, re] of [[{ treatAs: 'out', sparePartsCost: -1, otherCharges: 0, serviceCharge: 0 }, /between 0 and 10,00,000/], [{ treatAs: 'out', sparePartsCost: 'abc', otherCharges: 0, serviceCharge: 0 }, /between 0 and/],
    [{ treatAs: 'out', sparePartsCost: 0, otherCharges: 2000000, serviceCharge: 0 }, /between 0 and/], [{ treatAs: 'out', sparePartsCost: 0, otherCharges: 'Infinity', serviceCharge: 0 }, /between 0 and/],
    [{ treatAs: 'in' }, /out of warranty — bill the customer/], [{ treatAs: 'free' }, /Choose in-warranty or out-of-warranty/], [{}, /Choose/]]) await refusal('b3', req, re);
  await refusal('b3', { treatAs: 'out', sparePartsCost: 1, otherCharges: 1, serviceCharge: 1 }, /Only the ticket's service center/, 'bC2');
  ticket('b4', 'PE-REG-B1', { status: 'in_progress' });
  await refusal('b4', { treatAs: 'in' }, /only after it is completed/);
  rate('Heater', 0); ticket('b5', 'PE-REG-B1', { status: 'completed', category: 'Heater' });
  await refusal('b5', { treatAs: 'in' }, /No service charge rate is set/);
  // In warranty billed by the center after the technician was already credited: no double claim.
  ticket('b6', 'PE-REG-B1', { status: 'completed', serviceCharge: 450, billingComputedAt: Timestamp.now() });
  t = await bill('b6', { treatAs: 'in' });
  ok(t.billingStatus === 'ready_to_claim' && t.billingTotal === 0 && t.serviceCharge === 450, 'technician already credited -> the center claims nothing extra');
  // In warranty billed by the center when the technician was not credited: rate-card amount, never a typed amount.
  ticket('b7', 'PE-REG-B1', { status: 'completed' });
  t = await bill('b7', { treatAs: 'in', billingTotal: 99999, serviceCharge: 99999 });
  ok(t.billingStatus === 'ready_to_claim' && t.billingTotal === 450, 'claim amount is the rate card, typed amounts ignored');
  // Payment method is a closed list.
  ticket('b8', 'PE-REG-B2', { status: 'completed' });
  t = await bill('b8', { treatAs: 'out', sparePartsCost: 0, otherCharges: 0, serviceCharge: 100, paymentMethod: 'bitcoin', paymentRef: 'x'.repeat(200) });
  ok(t.customerPaymentMethod === 'other' && t.customerPaymentRef.length === 80, 'unknown payment method -> other; reference trimmed');

  // Claims. A technician's wallet credit, then the center's ticket claim.
  const claim = async (id, data) => { set(`claims/${id}`, { claimId: 'CL-' + id, status: 'submitted', ...data }); await created('checkClaim', `claims/${id}`, { docId: id }); return get(`claims/${id}`); };
  const lockedFail = async (id, data, re) => { const c = await claim(id, data); ok(c.status === 'rejected' && c.lock.status === 'failed' && re.test(c.rejectReason), `${id}: ${c.rejectReason}`); };
  set('walletTransactions/wX', { technicianUid: 'bT2', amount: 100, status: 'unclaimed', sourceJobLabel: 'X' });
  await lockedFail('c1', { claimantUid: 'bT', claimantType: 'technician', amount: 100, walletTxnIds: ['wX'] }, /belongs to someone else/);
  await lockedFail('c2', { claimantUid: 'bT', claimantType: 'technician', amount: 100, walletTxnIds: ['ghost'] }, /does not exist/);
  await lockedFail('c3', { claimantUid: 'bT', claimantType: 'technician', amount: 900, walletTxnIds: ['credit_centerRequests_b1', 'credit_centerRequests_b1'] }, /listed twice/);
  const empty = await claim('c4', { claimantUid: 'bT', claimantType: 'technician', amount: 5, walletTxnIds: [] });
  ok(empty.lock.status === 'manual' && !all('walletTransactions', (d) => d.status === 'claimed' && d.claimId === 'CL-c4').length, 'a claim listing nothing is a free-form claim for a person to verify, and locks nothing');
  await lockedFail('c5', { claimantUid: 'bT', claimantType: 'technician', amount: 1, walletTxnIds: Array.from({ length: 51 }, (_, i) => 'w' + i) }, /At most 50/);
  const good = await claim('c6', { claimantUid: 'bT', claimantType: 'technician', amount: 450, walletTxnIds: ['credit_centerRequests_b1'] });
  ok(good.lock.status === 'locked' && good.claimCheck.status === 'ok' && good.claimCheck.verified === 450 && get('walletTransactions/credit_centerRequests_b1').status === 'claimed', 'valid claim locks the credit');
  await lockedFail('c7', { claimantUid: 'bT', claimantType: 'technician', amount: 450, walletTxnIds: ['credit_centerRequests_b1'] }, /already claimed/);
  const wrong = await claim('c8', { claimantUid: 'bT', claimantType: 'technician', amount: 1000, walletTxnIds: ['credit_centerRequests_b1'] });
  ok(wrong.status === 'rejected', 'a second claim on a locked credit is refused whatever the amount');
  // Center ticket claims: ready tickets only, own tickets only.
  await lockedFail('c9', { claimantUid: 'bC', claimantType: 'servicecenter', amount: 1, ticketIds: ['b2'] }, /is collected/);
  await lockedFail('c10', { claimantUid: 'bC2', claimantType: 'servicecenter', amount: 1, ticketIds: ['b7'] }, /isn't this center's/);
  const tc = await claim('c11', { claimantUid: 'bC', claimantType: 'servicecenter', amount: 450, ticketIds: ['b7'] });
  ok(tc.lock.status === 'locked' && get('centerRequests/b7').billingStatus === 'claimed' && get('centerRequests/b7').claimId === 'CL-c11', 'ticket locked to the claim');
  await lockedFail('c12', { claimantUid: 'bC', claimantType: 'servicecenter', amount: 450, ticketIds: ['b7'] }, /is claimed/);
  const mism = await claim('c13', { claimantUid: 'bC', claimantType: 'servicecenter', amount: 500, ticketIds: ['b6'] });
  ok(mism.lock.status === 'locked' && mism.claimCheck.status === 'mismatch' && /claimed ₹500 but the tickets add up to ₹0/.test(mism.claimCheck.issues[0]), 'claimed amount that does not match the tickets is flagged for the verifier');
  const manual = await claim('c14', { claimantUid: 'bT', claimantType: 'technician', amount: 250, claimType: 'travel', attachmentUrl: 'https://example.com/bill.jpg' });
  ok(manual.lock.status === 'manual' && manual.claimCheck.status === 'manual', 'free-form claim goes to a person');
  // Reject releases; verify + pay writes one payment of the approved amount; paying again changes nothing.
  await by('claimUpdated', 'claims/c11', { status: 'rejected', rejectReason: 'wrong job', rejectedByUid: 'wh' }, 'wh', { docId: 'c11' });
  ok(get('centerRequests/b7').billingStatus === 'ready_to_claim' && get('centerRequests/b7').claimId === null && get('claims/c11').lock.status === 'released', 'rejected claim frees the ticket');
  ok(all('notifications', (d) => d.recipientValue === 'bC' && d.title === 'Claim rejected').length === 1, 'claimant told why');
  const tc2 = await claim('c15', { claimantUid: 'bC', claimantType: 'servicecenter', amount: 450, ticketIds: ['b7'] });
  ok(tc2.lock.status === 'locked', 'the freed ticket can be claimed again');
  await by('claimUpdated', 'claims/c15', { status: 'verified', approvedAmount: 400, verifiedByUid: 'wh' }, 'wh', { docId: 'c15' });
  await by('claimUpdated', 'claims/c15', { status: 'settled', paidByUid: 'sa', paymentMethod: 'NEFT', paymentRef: 'UTR1' }, 'sa', { docId: 'c15' });
  const pay = get('payments/claim_c15');
  ok(pay.amount === 400 && pay.payeeUid === 'bC' && pay.verifiedByUid === 'wh' && pay.paidByUid === 'sa' && pay.referenceNumber === 'UTR1', 'payment = approved amount, verifier and payer recorded');
  await by('claimUpdated', 'claims/c15', { status: 'settled', paymentRef: 'UTR-AGAIN' }, 'sa', { docId: 'c15' });
  ok(all('payments', (d) => d.sourceId === 'c15').length === 1 && get('payments/claim_c15').referenceNumber === 'UTR1', 'one payment per claim');
  ok(get('claims/c15').history.map((h) => h.to).join() === 'verified,settled', 'every status change in the claim history');
});
