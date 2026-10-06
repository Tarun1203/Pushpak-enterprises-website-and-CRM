const test = require('node:test');
const assert = require('node:assert');
const { buildAuditEntries } = require('./audit');

test('role change on a user is logged as role_changed', () => {
  const e = buildAuditEntries('users', 'u1', { role: 'dealer', email: 'a@x.com' }, { role: 'superadmin', email: 'a@x.com' });
  assert.strictEqual(e.length, 1);
  assert.strictEqual(e[0].action, 'role_changed');
  assert.deepStrictEqual(e[0].before, { role: 'dealer' });
  assert.deepStrictEqual(e[0].after, { role: 'superadmin' });
});
test('unrelated field edits produce nothing', () => {
  assert.deepStrictEqual(buildAuditEntries('users', 'u1', { role: 'dealer', name: 'a' }, { role: 'dealer', name: 'b' }), []);
});
test('user creation is logged, other creations are not', () => {
  assert.strictEqual(buildAuditEntries('users', 'u1', null, { role: 'warehouse', email: 'w@x.com' })[0].action, 'created');
  assert.deepStrictEqual(buildAuditEntries('centerTechnicians', 't1', null, { name: 'x' }), []);
});
test('deletes are logged', () => {
  assert.strictEqual(buildAuditEntries('serviceCenterProfiles', 's1', { status: 'ACTIVE' }, null)[0].action, 'deleted');
});
test('service center and technician status changes', () => {
  assert.strictEqual(buildAuditEntries('serviceCenterProfiles', 's1', { status: 'ACTIVE' }, { status: 'INACTIVE' })[0].action, 'status_changed');
  const t = buildAuditEntries('centerTechnicians', 't1', { employmentStatus: 'ACTIVE' }, { employmentStatus: 'SUSPENDED' });
  assert.strictEqual(t.length, 1);
  assert.deepStrictEqual(t[0].after, { employmentStatus: 'SUSPENDED' });
});
test('unwatched collection yields nothing', () => {
  assert.deepStrictEqual(buildAuditEntries('inventory', 'i', { a: 1 }, { a: 2 }), []);
});
test('field absent to present counts as a change', () => {
  assert.strictEqual(buildAuditEntries('users', 'u', { role: 'dealer' }, { role: 'dealer', status: 'disabled' }).length, 1);
});
