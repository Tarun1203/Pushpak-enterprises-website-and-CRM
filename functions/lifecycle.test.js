const test = require('node:test');
const assert = require('node:assert');
const { checkTransition, TRANSITIONS } = require('./lifecycle');
const done = { closureCode: 'REPAIRED', actionTaken: 'Replaced element', partsUsedNotes: 'None', closedByUid: 'u1' };

test('unchanged or missing status is never blocked', () => {
  assert.strictEqual(checkTransition({ status: 'new' }, { status: 'new' }, 'u1'), null);
  assert.strictEqual(checkTransition({ status: 'new' }, {}, 'u1'), null);
});
test('the technician happy path is allowed end to end', () => {
  const path = ['assigned', 'accepted', 'on_the_way', 'at_customer', 'in_progress'];
  for (let i = 0; i < path.length - 1; i++) assert.strictEqual(checkTransition({ status: path[i] }, { status: path[i + 1] }, 'u1'), null, path[i]);
  assert.strictEqual(checkTransition({ status: 'in_progress' }, { status: 'completed', ...done }, 'u1'), null);
});
test('service center moves from the existing UI are allowed', () => {
  for (const [a, b] of [['new', 'assigned'], ['assigned', 'in_progress'], ['in_progress', 'waiting_spare'], ['waiting_spare', 'in_progress'], ['new', 'cancelled']])
    assert.strictEqual(checkTransition({ status: a }, { status: b }, 'u1'), null, `${a}>${b}`);
});
test('skipping to completed or closed is rejected', () => {
  assert.match(checkTransition({ status: 'assigned' }, { status: 'completed', ...done }, 'u1'), /can't move/);
  assert.match(checkTransition({ status: 'in_progress' }, { status: 'closed' }, 'u1'), /can't move/);
  assert.match(checkTransition({ status: 'in_progress' }, { status: 'verification' }, 'u1'), /can't move/);
});
test('closed, completed, cancelled and verification are terminal for non-admins', () => {
  for (const s of ['closed', 'completed', 'cancelled', 'verification']) assert.match(checkTransition({ status: s }, { status: 'in_progress' }, 'u1'), /can't move/, s);
});
test('completed needs every closure field, trimmed', () => {
  assert.match(checkTransition({ status: 'in_progress' }, { status: 'completed', ...done, partsUsedNotes: '  ' }, 'u1'), /partsUsedNotes/);
  assert.match(checkTransition({ status: 'in_progress' }, { status: 'completed' }, 'u1'), /closureCode, actionTaken, partsUsedNotes/);
});
test('closure must be under the actor\'s own uid', () => {
  assert.match(checkTransition({ status: 'in_progress' }, { status: 'completed', ...done, closedByUid: 'someone-else' }, 'u1'), /own account/);
});
test('unknown previous status is not blocked; every target in the table is itself a known status or terminal', () => {
  assert.strictEqual(checkTransition({ status: 'weird' }, { status: 'assigned' }, 'u1'), null);
  for (const targets of Object.values(TRANSITIONS)) for (const t of targets) assert.ok(t in TRANSITIONS, t);
});
