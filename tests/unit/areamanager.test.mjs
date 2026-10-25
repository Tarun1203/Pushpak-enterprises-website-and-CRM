// Area Manager portal: SLA rule choice, coverage gaps, performance and CSV.
import test from 'node:test';
import assert from 'node:assert';
import { slaRuleFor, slaState, coverage, performance, csv, sameDistricts } from '../../crm/areamanager.js';

const H = 3600000;
test('SLA: district rule beats service-type rule beats the 24/48 h default', () => {
  const rules = [{ matchType: 'servicetype', matchValue: 'installation', dueSoonHours: 12, breachedHours: 24, name: 'Install' }, { matchType: 'district', matchValue: 'Raichur', dueSoonHours: 6, breachedHours: 10, name: 'Raichur' }];
  assert.strictEqual(slaRuleFor(rules, 'raichur', 'installation').name, 'Raichur');
  assert.strictEqual(slaRuleFor(rules, 'Koppal', 'installation').breachedHours, 24);
  assert.deepStrictEqual(slaRuleFor(rules, 'Koppal', 'service'), { dueSoonHours: 24, breachedHours: 48, name: 'Default' });
});
test('SLA state: ok, due soon, breached; closed tickets have none', () => {
  const now = 1_000_000 * H;
  assert.strictEqual(slaState({ status: 'new', createdAt: now - 2 * H }, [], now), 'ok');
  assert.strictEqual(slaState({ status: 'assigned', createdAt: now - 30 * H }, [], now), 'due_soon');
  assert.strictEqual(slaState({ status: 'in_progress', createdAt: { toMillis: () => now - 50 * H } }, [], now), 'breached');
  assert.strictEqual(slaState({ status: 'closed', createdAt: now - 500 * H }, [], now), null);
});
test('coverage: pincode match first, then district; gaps are flagged', () => {
  const pins = [{ id: '584101', district: 'Raichur' }, { id: '584199', district: 'Raichur' }, { id: '583101', district: 'Ballari' }];
  const centers = [{ uid: 'c1', name: 'Center 1', pincodesCovered: ['584101'] }];
  const techs = [{ uid: 't1', name: 'Tech 1', districtsCovered: ['ballari'] }];
  const rows = coverage(pins, centers, techs);
  assert.deepStrictEqual(rows.map((r) => r.covered), [true, false, true]);
  assert.deepStrictEqual(rows[2].technicians, ['Tech 1']);
});
test('performance counts and average hours to close', () => {
  const r = performance([
    { serviceCenterUid: 'a', status: 'closed', createdAt: H, closedAt: 11 * H },
    { serviceCenterUid: 'a', status: 'completed', createdAt: H, closedAt: 21 * H },
    { serviceCenterUid: 'a', status: 'new', createdAt: 0 },
    { serviceCenterUid: 'b', status: 'cancelled' }
  ], (t) => t.serviceCenterUid);
  assert.deepStrictEqual(r[0], { key: 'a', total: 3, open: 1, done: 2, hours: 30, timed: 2, avgHours: 15, completion: 67 });
  assert.strictEqual(r[1].open, 0);
});
test('CSV quotes commas, quotes and newlines; district match ignores case', () => {
  assert.strictEqual(csv([['a,b', 'say "hi"', 'x\ny', 3]]), '"a,b","say ""hi""","x\ny",3');
  assert.ok(sameDistricts(['RAICHUR '], ['raichur']));
  assert.ok(!sameDistricts([], ['raichur']));
});
