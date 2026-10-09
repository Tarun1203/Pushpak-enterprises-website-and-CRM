// Phase 10 items 1-5: account access, brand isolation, master data integrity,
// service center / technician readiness (working hours, closures, capacity).
const Module = require('module');
const fake = require('./testsupport/fakefs');
const orig = Module._load;
const wrap = (opts, handler) => ({ opts, handler });
const authCalls = [];
const authMock = { updateUser: async (uid, p) => { authCalls.push(['update', uid, p]); }, revokeRefreshTokens: async (uid) => { authCalls.push(['revoke', uid]); } };
Module._load = function (req, ...a) {
  if (req === 'firebase-admin/app') return { initializeApp() {} };
  if (req === 'firebase-admin/auth') return { getAuth: () => authMock };
  if (req === 'firebase-admin/firestore') return { getFirestore: () => fake.db, FieldValue: fake.FieldValue, Timestamp: fake.Timestamp };
  if (req === 'firebase-functions/v2/firestore') return new Proxy({}, { get: () => wrap });
  if (req === 'firebase-functions/v2/scheduler') return { onSchedule: wrap };
  if (req === 'firebase-functions/v2/https') return { onCall: wrap, HttpsError: class HttpsError extends Error { constructor(code, msg) { super(msg); this.code = code; } } };
  return orig.call(this, req, ...a);
};
const F = require('./index.js');
const Access = require('./access');
const Masters = require('./masters');
const Appointment = require('./appointment');
const { store, DocRef, Snap, Timestamp } = fake;
const test = require('node:test');
const assert = require('node:assert');
const get = (p) => store.get(p);
const ref = (p) => { const [c, id] = p.split('/'); return new DocRef(c, id); };
const set = (p, d) => store.set(p, d);
const ok = (cond, msg) => assert.ok(cond, msg);
const all = (coll, pred = () => true) => [...store.entries()].filter(([p, d]) => p.startsWith(coll + '/') && pred(d)).map(([p, d]) => ({ path: p, ...d }));
const created = (fn, p, params = {}) => F[fn].handler({ data: new Snap(ref(p)), params });
async function by(fn, p, change, authId, params = {}) {
  const before = new Snap(ref(p));
  set(p, { ...get(p), ...change });
  await F[fn].handler({ data: { before, after: new Snap(ref(p)) }, params, authId });
}
const dayIso = (n) => { const d = new Date(Date.now() + 330 * 60000); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// The next date (from tomorrow on) that falls on the given weekday: 0=Sun..6=Sat.
const nextWeekday = (wd) => { for (let i = 1; i < 15; i++) { if (new Date(dayIso(i) + 'T00:00:00Z').getUTCDay() === wd) return dayIso(i); } };
const wrote = (fn, p, before, after) => F[fn].handler({ data: { before: before ? { exists: true, data: () => before } : { exists: false, data: () => undefined }, after: after ? new Snap(ref(p)) : { exists: false, data: () => undefined } }, params: { docId: p.split('/')[1] } });

test('P10.2 access: the decision, and what each switch-off does to the account', () => {
  const D = Access.accessDecision;
  ok(!D({}).disabled && !D({ employmentStatuses: ['ACTIVE', 'ON_LEAVE', 'ON_PROBATION'] }).disabled, 'active, on leave and probation keep access');
  for (const s of ['SUSPENDED', 'TERMINATED', 'RESIGNED', 'suspended']) ok(D({ employmentStatuses: ['ACTIVE', s] }).disabled, s + ' (on any roster entry) switches access off');
  ok(D({ disabledByAdmin: true, employmentStatuses: ['ACTIVE'] }).disabled, 'Head Office can switch anyone off');
  ok(D({ centerStatus: 'INACTIVE' }).disabled && !D({ centerStatus: 'ACTIVE' }).disabled && !D({ centerStatus: 'PENDING' }).disabled, 'only an inactive center');
});

test('P10.2 access: suspended technician and inactive center stop working at once, and come back when restored', async () => {
  store.clear(); authCalls.length = 0;
  set('users/aT', { role: 'technician', name: 'Tech A', email: 'a@x' });
  set('centerTechnicians/ct1', { technicianUid: 'aT', employmentStatus: 'ACTIVE' });
  await wrote('syncAccess_centerTechnicians', 'centerTechnicians/ct1', null, true);
  ok(!get('users/aT').accessDisabled && !authCalls.length && !all('notifications').length, 'active technician: nothing changes');
  set('centerTechnicians/ct1', { technicianUid: 'aT', employmentStatus: 'SUSPENDED' });
  await wrote('syncAccess_centerTechnicians', 'centerTechnicians/ct1', { technicianUid: 'aT', employmentStatus: 'ACTIVE' }, true);
  ok(get('users/aT').accessDisabled === true && /suspended/.test(get('users/aT').accessDisabledReason), 'flag set on the user record (what the rules read)');
  ok(JSON.stringify(authCalls) === JSON.stringify([['update', 'aT', { disabled: true }], ['revoke', 'aT']]), 'sign-in account disabled and sessions revoked');
  ok(all('notifications', (d) => d.title === 'Account switched off' && d.recipientValue === 'superadmin').length === 1, 'Head Office told');
  await wrote('syncAccess_centerTechnicians', 'centerTechnicians/ct1', { technicianUid: 'aT', employmentStatus: 'ACTIVE' }, true);
  ok(authCalls.length === 2 && all('notifications').length === 1, 'a repeated trigger changes nothing');
  // Back to active: access restored, sign-in re-enabled.
  set('centerTechnicians/ct1', { technicianUid: 'aT', employmentStatus: 'ACTIVE' });
  await wrote('syncAccess_centerTechnicians', 'centerTechnicians/ct1', { technicianUid: 'aT', employmentStatus: 'SUSPENDED' }, true);
  ok(get('users/aT').accessDisabled === false && authCalls[2][2].disabled === false && authCalls.length === 3, 'restored');
  // Head Office switch beats an active roster entry; clearing it restores.
  set('users/aT', { ...get('users/aT'), disabledByAdmin: true });
  await by('syncAccess_users', 'users/aT', { disabledByAdmin: true }, 'sa');
  // (the before snapshot above already has the new value; call with a proper before/after)
  set('users/aT', { ...get('users/aT'), disabledByAdmin: false });
  const before = { get: (k) => (k === 'disabledByAdmin' ? true : undefined) };
  await F.syncAccess_users.handler({ data: { before, after: new Snap(ref('users/aT')) }, params: { docId: 'aT' } });
  ok(get('users/aT').accessDisabled === false, 'cleared by Head Office -> restored');
  set('users/aT', { ...get('users/aT'), disabledByAdmin: true });
  await F.syncAccess_users.handler({ data: { before: { get: () => false }, after: new Snap(ref('users/aT')) }, params: { docId: 'aT' } });
  ok(get('users/aT').accessDisabled === true && /Head Office/.test(get('users/aT').accessDisabledReason), 'disabled by Head Office');
  await F.syncAccess_users.handler({ data: { before: { get: () => true }, after: new Snap(ref('users/aT')) }, params: { docId: 'aT' } });
  ok(get('users/aT').accessDisabled === true, 'an unrelated edit does not switch anything');
  // Service center: inactive profile switches the account off; reactivating restores.
  set('users/aC', { role: 'servicecenter', name: 'Center A' });
  set('serviceCenterProfiles/aC', { status: 'INACTIVE' });
  await wrote('syncAccess_serviceCenterProfiles', 'serviceCenterProfiles/aC', { status: 'ACTIVE' }, true);
  ok(get('users/aC').accessDisabled === true, 'inactive center switched off');
  set('serviceCenterProfiles/aC', { status: 'ACTIVE' });
  await wrote('syncAccess_serviceCenterProfiles', 'serviceCenterProfiles/aC', { status: 'INACTIVE' }, true);
  ok(get('users/aC').accessDisabled === false, 'reactivated center restored');
  // A roster entry with no sign-in account, and an unknown user, are ignored.
  set('centerTechnicians/ct2', { employmentStatus: 'TERMINATED', name: 'No login' });
  await wrote('syncAccess_centerTechnicians', 'centerTechnicians/ct2', null, true);
  set('centerTechnicians/ct3', { technicianUid: 'ghost', employmentStatus: 'TERMINATED' });
  await wrote('syncAccess_centerTechnicians', 'centerTechnicians/ct3', null, true);
  ok(!get('users/ghost'), 'no invented users');
});

test('P10.5 working hours, closures and daily capacity are enforced on appointments', async () => {
  store.clear();
  const MON = nextWeekday(1), TUE = nextWeekday(2), SUN = nextWeekday(0);
  set('users/wC', { role: 'servicecenter', name: 'Center W' });
  set('serviceCenterProfiles/wC', { status: 'ACTIVE', holidaysAndClosures: [{ date: nextWeekday(3), endDate: '', reason: 'Local festival' }, { date: nextWeekday(4), endDate: nextWeekday(5), reason: 'Stock taking' }] });
  const sched = { mon: { working: true, start: '09:00', end: '18:00', breakStart: '13:00', breakEnd: '14:00' }, tue: { working: true, start: '10:00', end: '16:00' }, wed: { working: true, start: '09:00', end: '18:00' }, thu: { working: true, start: '09:00', end: '18:00' }, fri: { working: true, start: '09:00', end: '18:00' }, sat: { working: false }, sun: { working: false } };
  set('users/wT', { role: 'technician', name: 'Tech W', linkedServiceCenterUid: 'wC' });
  set('centerTechnicians/cw', { serviceCenterUid: 'wC', technicianUid: 'wT', name: 'Tech W', workingHours: sched, capacity: { maxJobsPerDay: 2 } });
  set('users/wU', { role: 'technician', name: 'Unconfigured', linkedServiceCenterUid: 'wC' });
  set('centerTechnicians/cu', { serviceCenterUid: 'wC', technicianUid: 'wU', name: 'Unconfigured' });
  let n = 0;
  const book = async (tech, date, start, end) => {
    const id = 'wk' + (++n);
    set(`centerRequests/${id}`, { requestId: id, serviceCenterUid: 'wC', technicianUid: tech, status: 'assigned' });
    await by('checkScheduleOnUpdate_centerRequests', `centerRequests/${id}`, { scheduledDate: date, scheduledStartTime: start, scheduledEndTime: end }, 'wC', { docId: id });
    return (get(`centerRequests/${id}`).scheduleRejected || {}).reason || null;
  };
  ok(await book('wT', MON, '09:30', '11:00') === null, 'inside Monday hours');
  ok(/outside the technician's working hours \(09:00-18:00\)/.test(await book('wT', MON, '08:00', '09:00')), 'before opening');
  ok(/outside the technician's working hours/.test(await book('wT', MON, '17:00', '19:00')), 'after closing');
  ok(/break \(13:00-14:00\)/.test(await book('wT', MON, '12:30', '13:30')), 'during the break');
  ok(await book('wT', MON, '14:00', '15:00') === null, 'right after the break');
  ok(/already has 2 jobs that day \(the limit is 2\)/.test(await book('wT', MON, '16:00', '17:00')), 'third job of the day refused (limit 2)');
  ok(/outside the technician's working hours \(10:00-16:00\)/.test(await book('wT', TUE, '09:00', '11:00')), 'Tuesday hours differ');
  ok(/doesn't work on Sundays/.test(await book('wT', SUN, '10:00', '11:00')), 'day off');
  ok(/closed on that date \(Local festival\)/.test(await book('wT', nextWeekday(3), '10:00', '11:00')), 'center closure (single day)');
  ok(/closed on that date \(Stock taking\)/.test(await book('wT', nextWeekday(5), '10:00', '11:00')), 'center closure (range, last day)');
  // A cancelled job frees a capacity slot; a technician with holiday override works closures.
  set('centerRequests/wk1', { ...get('centerRequests/wk1'), status: 'cancelled' });
  ok(await book('wT', MON, '16:00', '17:00') === null, 'cancelled job no longer counts');
  set('centerTechnicians/cw', { ...get('centerTechnicians/cw'), workingHoursMeta: { holidayOverride: true } });
  ok(await book('wT', nextWeekday(3), '10:00', '11:00') === null, 'holiday override works through a closure');
  // Nothing configured: no restriction beyond the general rules.
  ok(await book('wU', SUN, '10:00', '11:00') === null, 'unconfigured technician: any day');
  ok(await book('wU', MON, '09:00', '10:00') === null && await book('wU', MON, '10:00', '11:00') === null && await book('wU', MON, '11:00', '12:00') === null, 'unconfigured technician: no daily limit');
  // Pure function edge cases.
  const R = Appointment.rosterProblem;
  ok(R(null, null, { date: MON, start: '10:00', end: '11:00' }, 0) === null && R({}, {}, { date: MON, start: '10:00', end: '11:00' }, 99) === null, 'no data -> no restriction');
  ok(R({ capacity: { maxJobsPerDay: 0 } }, null, { date: MON, start: '10:00', end: '11:00' }, 50) === null && R({ capacity: { maxJobsPerDay: null } }, null, { date: MON, start: '10:00', end: '11:00' }, 50) === null, 'blank or zero limit = no limit');
  ok(R({ workingHours: sched }, null, { date: MON, start: '10:00', end: '11:00' }, 0) === null, 'plain working slot');
  ok(R({ workingHours: sched }, null, { date: MON, start: '', end: '' }, 0) === null, 'a date-only booking is not time-checked');
});

test('P10.4 master data: the same record twice is flagged, whichever way it is spelled', async () => {
  store.clear();
  ok(Masters.norm(' Heating-Element  ') === Masters.norm('heating element'), 'spelling is normalised');
  const make = async (coll, id, d) => { set(`${coll}/${id}`, d); await created(`checkMasterIntegrity_${coll}`, `${coll}/${id}`, { docId: id }); return get(`${coll}/${id}`); };
  // Spare parts: same code, or same name for the same brand.
  ok(!(await make('spareParts', 'p1', { name: 'Heating Element', partCode: 'SP-0001', brandCompatibility: 'MakWell' })).masterCheck, 'first part');
  const dupName = await make('spareParts', 'p2', { name: 'heating  element', partCode: 'SP-0002', brandCompatibility: 'MakWell' });
  ok(dupName.masterCheck.status === 'duplicate' && dupName.masterCheck.of.join() === 'p1', 'same name + brand, other spelling');
  ok((await make('spareParts', 'p3', { name: 'Heating Element', partCode: 'sp 0001', brandCompatibility: 'Flyvision' })).masterCheck.of.join() === 'p1', 'same part code');
  ok(!(await make('spareParts', 'p4', { name: 'Heating Element', partCode: 'SP-0004', brandCompatibility: 'Skevia' })).masterCheck, 'same name for another brand is a different part');
  ok(!(await make('spareParts', 'p5', { name: 'Thermostat', partCode: 'SP-0005', brandCompatibility: 'All' })).masterCheck, 'a different part is fine');
  // Models, products, categories, brands.
  await make('productModels', 'm1', { modelNumber: 'MW-G25', brandId: 'makwell' });
  ok((await make('productModels', 'm2', { modelNumber: 'mw g25', brandId: 'makwell' })).masterCheck, 'same model number for a brand');
  ok(!(await make('productModels', 'm3', { modelNumber: 'MW-G25', brandId: 'flyvision' })).masterCheck, 'same model number under another brand is allowed');
  await make('products', 'pr1', { name: '25L Geyser', brandId: 'makwell', categoryId: 'geyser' });
  ok((await make('products', 'pr2', { name: '25l  geyser', brandId: 'makwell', categoryId: 'geyser' })).masterCheck, 'same product');
  ok(!(await make('products', 'pr3', { name: '25L Geyser', brandId: 'makwell', categoryId: 'heater' })).masterCheck, 'same name, other category');
  await make('productCategories', 'c1', { name: 'Geyser' });
  ok((await make('productCategories', 'c2', { name: ' geyser ' })).masterCheck, 'category');
  await make('brands', 'b1', { name: 'MakWell' });
  ok((await make('brands', 'b2', { name: 'Makwell' })).masterCheck, 'brand');
  // Warranty plans: one active plan per brand + category (otherwise the warranty answer is ambiguous).
  await make('warrantyPlans', 'w1', { brandId: 'makwell', categoryId: 'geyser', status: 'active' });
  ok((await make('warrantyPlans', 'w2', { brandId: 'makwell', categoryId: 'geyser', status: 'active' })).masterCheck, 'two active plans for one brand + category');
  ok(!(await make('warrantyPlans', 'w3', { brandId: 'makwell', categoryId: 'geyser', status: 'inactive' })).masterCheck, 'an inactive plan is not a conflict');
  ok(!(await make('warrantyPlans', 'w4', { brandId: 'makwell', categoryId: 'tv', status: 'active' })).masterCheck, 'another category');
  // Originals untouched; Head Office told for each duplicate.
  ok(!get('spareParts/p1').masterCheck && !get('brands/b1').masterCheck && !get('warrantyPlans/w1').masterCheck, 'the original records are left alone');
  const n = all('notifications', (d) => d.title === 'Duplicate master record').length;
  ok(n === 7, 'one notice per duplicate (' + n + ')');
  // Records missing the key fields are not duplicates of each other.
  ok(!(await make('spareParts', 'e1', {})).masterCheck && !(await make('spareParts', 'e2', {})).masterCheck, 'empty records');
});

test('P10.3 brand isolation: a part made for one brand is not fitted on another brand\'s job', async () => {
  store.clear();
  set('users/bC', { role: 'servicecenter', name: 'BC' });
  set('users/bT', { role: 'technician', name: 'BT', linkedServiceCenterUid: 'bC' });
  set('spareParts/mk', { name: 'MakWell Element', brandCompatibility: 'MakWell' });
  set('spareParts/fv', { name: 'Flyvision Panel', brandCompatibility: 'Flyvision' });
  set('spareParts/all', { name: 'Universal Fuse', brandCompatibility: 'All' });
  set('spareParts/none', { name: 'Unlabelled' });
  for (const p of ['mk', 'fv', 'all', 'none']) set(`inventory/technician_bT_${p}`, { partId: p, location: 'technician', technicianUid: 'bT', quantity: 5 });
  set('centerRequests/bj', { requestId: 'PE-CR-BJ', serviceCenterUid: 'bC', technicianUid: 'bT', status: 'in_progress', brand: 'makwell', category: 'Geyser' });
  const op = async (id, part) => { set(`stockOps/${id}`, { status: 'pending', type: 'consume', byUid: 'bT', lines: [{ partId: part, qty: 1 }], job: { coll: 'centerRequests', id: 'bj' } }); await created('sparesOpCreated', `stockOps/${id}`, { opId: id }); return get(`stockOps/${id}`); };
  ok((await op('o1', 'mk')).status === 'done', 'MakWell part on a MakWell job (any letter case)');
  const bad = await op('o2', 'fv');
  ok(bad.status === 'rejected' && /Flyvision part; this job is for makwell/.test(bad.reason) && get('inventory/technician_bT_fv').quantity === 5, 'Flyvision part on a MakWell job is refused, stock untouched');
  ok((await op('o3', 'all')).status === 'done' && (await op('o4', 'none')).status === 'done', 'universal and unlabelled parts are allowed');
  set('centerRequests/bj', { ...get('centerRequests/bj'), brand: '' });
  ok((await op('o5', 'fv')).status === 'done', 'a job with no brand recorded is not blocked');
});
