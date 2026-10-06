const test = require('node:test');
const assert = require('node:assert');
const { checkTransition, TRANSITIONS, checkSpareTransition, SPARE_TRANSITIONS } = require('./lifecycle');
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

const tr = { transporter: 'VRL', docket: 'D123' };
test('spare: the normal warehouse pipeline is allowed', () => {
  const path = ['new', 'approved', 'picking', 'packing', 'dispatched', 'intransit', 'received'];
  for (let i = 0; i < path.length - 1; i++) assert.strictEqual(checkSpareTransition({ status: path[i] }, { status: path[i + 1], transport: tr }), null, path[i]);
});
test('spare: direct dispatch from any pre-dispatch stage is allowed (Super Admin flow)', () => {
  for (const s of ['new', 'approved', 'picking', 'packing']) assert.strictEqual(checkSpareTransition({ status: s }, { status: 'dispatched', transport: tr }), null, s);
});
test('spare: dispatch without transport details is rejected', () => {
  assert.match(checkSpareTransition({ status: 'packing' }, { status: 'dispatched' }), /transporter/);
  assert.match(checkSpareTransition({ status: 'packing' }, { status: 'dispatched', transport: { transporter: 'VRL', docket: ' ' } }), /docket/);
});
test('spare: cannot skip to received, go backwards, or leave a final state', () => {
  assert.match(checkSpareTransition({ status: 'new' }, { status: 'received' }), /can't move/);
  assert.match(checkSpareTransition({ status: 'packing' }, { status: 'approved' }), /can't move/);
  assert.match(checkSpareTransition({ status: 'received' }, { status: 'new' }), /can't move/);
  assert.match(checkSpareTransition({ status: 'dispatched' }, { status: 'new' }), /can't move/);
});
test('spare: back order can only retry as new; unchanged and unknown are ignored', () => {
  assert.strictEqual(checkSpareTransition({ status: 'backorder' }, { status: 'new' }), null);
  assert.match(checkSpareTransition({ status: 'backorder' }, { status: 'approved' }), /can't move/);
  assert.strictEqual(checkSpareTransition({ status: 'new' }, { status: 'new' }), null);
  assert.strictEqual(checkSpareTransition({ status: 'weird' }, { status: 'approved' }), null);
  for (const targets of Object.values(SPARE_TRANSITIONS)) for (const x of targets) assert.ok(x in SPARE_TRANSITIONS, x);
});
