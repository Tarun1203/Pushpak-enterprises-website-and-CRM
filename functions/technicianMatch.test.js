const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { rankTechnicians } = require('./technicianMatch');
const T = '2026-10-06';
const ticket = { brandId: 'makwell', category: 'Geyser' };
const user = (o = {}) => ({ brandsAuthorized: ['makwell'], skills: [{ category: 'Geyser', level: 'expert' }], ...o });
const run = (roster, users = {}, avail = {}, openCounts = {}, t = ticket) => rankTechnicians({ ticket: t, roster, users, avail, openCounts, today: T });

test('crm copy is identical to the functions copy', () => {
  assert.strictEqual(
    fs.readFileSync(path.join(__dirname, 'technicianMatch.js'), 'utf8'),
    fs.readFileSync(path.join(__dirname, '..', 'crm', 'technicianMatch.js'), 'utf8'));
});
test('blocked employment states are excluded', () => {
  for (const s of ['SUSPENDED', 'TERMINATED', 'RESIGNED', 'ON_LEAVE']) {
    const r = run([{ id: 'r', name: 'A', technicianUid: 'u', employmentStatus: s }], { u: user() });
    assert.strictEqual(r[0].eligible, false, s);
  }
});
test('suspended availability, expired contract, leave and holiday are excluded', () => {
  const roster = [{ id: 'r', name: 'A', technicianUid: 'u' }];
  assert.strictEqual(run(roster, { u: user() }, { u: { suspended: true } })[0].eligible, false);
  assert.strictEqual(run(roster, { u: user({ accountType: 'temporary', contractEndDate: '2026-01-01' }) })[0].eligible, false);
  assert.strictEqual(run(roster, { u: user() }, { u: { status: 'leave' } })[0].eligible, false);
  assert.strictEqual(run(roster, { u: user() }, { u: { status: 'holiday' } })[0].eligible, false);
});
test('declared brands that exclude the ticket brand rule the technician out', () => {
  const r = run([{ id: 'r', name: 'A', technicianUid: 'u' }], { u: user({ brandsAuthorized: ['flyvision'] }) });
  assert.strictEqual(r[0].eligible, false); assert.match(r[0].excludedReason, /brand/);
});
test('undeclared brand or skills only warn, never exclude', () => {
  const r = run([{ id: 'r', name: 'A', technicianUid: 'u' }], { u: { brandsAuthorized: [], skills: [] } });
  assert.strictEqual(r[0].eligible, true); assert.ok(r[0].warnings.length >= 2);
});
test('category mismatch is a warning, not a block', () => {
  const r = run([{ id: 'r', name: 'A', technicianUid: 'u' }], { u: user({ skills: [{ category: 'LED TV' }] }) });
  assert.strictEqual(r[0].eligible, true); assert.ok(r[0].warnings.some((w) => /category/.test(w)));
});
test('roster productCapabilities count for brand and category', () => {
  const r = run([{ id: 'r', name: 'A', technicianUid: '', productCapabilities: [{ brand: 'makwell', category: 'geyser', certified: true }] }]);
  assert.strictEqual(r[0].eligible, true); assert.ok(r[0].score >= 45);
});
test('unlinked technician is allowed with a warning', () => {
  const r = run([{ id: 'r', name: 'A', technicianUid: '' }]);
  assert.strictEqual(r[0].eligible, true); assert.ok(r[0].warnings[0].includes('no linked account'));
});
test('ranking: available beats busy, fewer open jobs wins, ineligible last', () => {
  const roster = [
    { id: '1', name: 'Busy', technicianUid: 'b' }, { id: '2', name: 'Free', technicianUid: 'f' },
    { id: '3', name: 'Loaded', technicianUid: 'l' }, { id: '4', name: 'Gone', technicianUid: 'g', employmentStatus: 'RESIGNED' }
  ];
  const users = { b: user(), f: user(), l: user(), g: user() };
  const avail = { b: { status: 'in_progress' }, f: { status: 'available' }, l: { status: 'available' } };
  const r = run(roster, users, avail, { l: 5 });
  assert.deepStrictEqual(r.map((x) => x.name), ['Free', 'Loaded', 'Busy', 'Gone']);
});
test('ticket brand label is matched case-insensitively', () => {
  const r = run([{ id: 'r', name: 'A', technicianUid: 'u' }], { u: user() }, {}, {}, { brand: 'MakWell', category: 'geyser' });
  assert.strictEqual(r[0].eligible, true); assert.strictEqual(r[0].warnings.length, 0);
});
