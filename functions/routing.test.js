const test = require('node:test');
const assert = require('node:assert');
const { findCandidates, pickLeastLoaded } = require('./routing');
const T = '2026-10-06';
const c = (uid, o = {}) => ({ uid, pincodesCovered: [], districtsCovered: [], brandsAuthorized: ['makwell'], ...o });
const tk = { pincode: '584101', brand: 'MakWell' };

test('exact pincode + brand routes (tier 1)', () => {
  const r = findCandidates(tk, [c('a', { pincodesCovered: ['584101'] })], null, T);
  assert.strictEqual(r.method, 'pincode'); assert.strictEqual(r.candidates[0].uid, 'a');
});
test('brand not authorized is left manual with a reason', () => {
  const r = findCandidates({ ...tk, brand: 'Flyvision' }, [c('a', { pincodesCovered: ['584101'] })], null, T);
  assert.strictEqual(r.method, null); assert.strictEqual(r.reason, 'brand_not_authorized');
});
test('expired temporary contract and blocked profile status are excluded', () => {
  const centers = [
    c('a', { pincodesCovered: ['584101'], accountType: 'temporary', contractEndDate: '2026-01-01' }),
    c('b', { pincodesCovered: ['584101'], profileStatus: 'INACTIVE' }),
    c('d', { pincodesCovered: ['584101'], profileStatus: 'PENDING_REVIEW' }),
  ];
  assert.strictEqual(findCandidates(tk, centers, null, T).candidates.length, 0);
});
test('permanent account with a contract date is not treated as expired', () => {
  const r = findCandidates(tk, [c('a', { pincodesCovered: ['584101'], accountType: 'permanent', contractEndDate: '2020-01-01' })], null, T);
  assert.strictEqual(r.method, 'pincode');
});
test('missing profile status is allowed', () => {
  assert.strictEqual(findCandidates(tk, [c('a', { pincodesCovered: ['584101'] })], null, T).method, 'pincode');
});
test('district fallback routes only when exactly one center covers it', () => {
  const pin = { district: 'Raichur', active: true };
  const one = findCandidates(tk, [c('a', { districtsCovered: ['raichur'] })], pin, T);
  assert.strictEqual(one.method, 'district');
  const two = findCandidates(tk, [c('a', { districtsCovered: ['Raichur'] }), c('b', { districtsCovered: ['Raichur'] })], pin, T);
  assert.strictEqual(two.method, null); assert.strictEqual(two.reason, 'multiple_district_candidates'); assert.strictEqual(two.candidates.length, 2);
});
test('inactive pincode in master blocks district fallback', () => {
  const r = findCandidates(tk, [c('a', { districtsCovered: ['Raichur'] })], { district: 'Raichur', active: false }, T);
  assert.strictEqual(r.method, null);
});
test('reasons for unrouted requests', () => {
  assert.strictEqual(findCandidates({ brand: 'x' }, [], null, T).reason, 'no_pincode');
  assert.strictEqual(findCandidates(tk, [], null, T).reason, 'pincode_not_in_master');
  assert.strictEqual(findCandidates(tk, [], { district: 'Raichur', active: true }, T).reason, 'no_center_covers_district');
  assert.strictEqual(findCandidates(tk, [], { active: true }, T).reason, 'no_center_covers_pincode');
});
test('blank brand skips the brand check', () => {
  assert.strictEqual(findCandidates({ pincode: '584101' }, [c('a', { pincodesCovered: ['584101'], brandsAuthorized: [] })], null, T).method, 'pincode');
});
test('least-loaded wins, uid breaks ties', () => {
  const list = [c('b'), c('a'), c('d')];
  assert.strictEqual(pickLeastLoaded(list, { a: 3, b: 1, d: 1 }).uid, 'b');
  assert.strictEqual(pickLeastLoaded(list, {}).uid, 'a');
});

// ---- Areas with no service center: a technician who covers the area directly
const { findDirectTechnicians, NO_CENTER_REASONS } = require('./routing');
test('direct technician: pincode match wins, then district; brand and switched-off accounts respected', () => {
  const techs = [
    { uid: 't1', pincodesCovered: ['584128'], brandsAuthorized: [] },
    { uid: 't2', districtsCovered: ['Raichur'], brandsAuthorized: ['makwell'] },
    { uid: 't3', districtsCovered: ['Raichur'], brandsAuthorized: ['flyvision'] },
    { uid: 't4', pincodesCovered: ['584128'], accessDisabled: true },
    { uid: 't5', pincodesCovered: ['584128'], accountType: 'temporary', contractEndDate: '2020-01-01' },
    { uid: 't6' } // no direct coverage: works only through a center
  ];
  const pin = { district: 'Raichur' };
  let r = findDirectTechnicians({ pincode: '584128', brand: 'MakWell' }, techs, pin, '2026-10-12');
  assert.strictEqual(r.method, 'technician_pincode');
  assert.deepStrictEqual(r.candidates.map((t) => t.uid), ['t1']);
  r = findDirectTechnicians({ pincode: '584101', brand: 'MakWell' }, techs, pin, '2026-10-12');
  assert.strictEqual(r.method, 'technician_district');
  assert.deepStrictEqual(r.candidates.map((t) => t.uid), ['t2']);
  r = findDirectTechnicians({ pincode: '584101', brand: 'Skevia' }, techs, pin, '2026-10-12');
  assert.strictEqual(r.method, null);
  r = findDirectTechnicians({ pincode: '' }, techs, pin, '2026-10-12');
  assert.strictEqual(r.method, null);
  r = findDirectTechnicians({ pincode: '999999' }, techs, null, '2026-10-12');
  assert.strictEqual(r.method, null);
});
test('direct technician is only a fallback when no center can take the ticket', () => {
  assert.ok(NO_CENTER_REASONS.includes('no_center_covers_district'));
  assert.ok(NO_CENTER_REASONS.includes('no_center_covers_pincode'));
  assert.ok(!NO_CENTER_REASONS.includes('multiple_district_candidates'));
});
