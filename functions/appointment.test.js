const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const A = require('./appointment');
// 2026-10-06 10:00 IST = 04:30 UTC
const NOW = Date.UTC(2026, 9, 6, 4, 30);
const slot = (date, start, end) => ({ date, start, end });

test('crm copy is identical to the functions copy', () => {
  assert.strictEqual(fs.readFileSync(path.join(__dirname, 'appointment.js'), 'utf8'),
    fs.readFileSync(path.join(__dirname, '..', 'crm', 'appointment.js'), 'utf8'));
});
test('IST date is used, not UTC', () => {
  assert.strictEqual(A.todayIST(Date.UTC(2026, 9, 5, 20, 0)), '2026-10-06');
});
test('valid slot passes; date-only passes; nothing passes', () => {
  assert.strictEqual(A.validateSlot(slot('2026-10-07', '10:00', '12:00'), NOW), null);
  assert.strictEqual(A.validateSlot(slot('2026-10-07', '', ''), NOW), null);
  assert.strictEqual(A.validateSlot(slot('', '', ''), NOW), null);
});
test('times without a date, bad date, past date are rejected', () => {
  assert.match(A.validateSlot(slot('', '10:00', '11:00'), NOW), /date/i);
  assert.match(A.validateSlot(slot('2026-13-45', '10:00', '11:00'), NOW), /not valid/);
  assert.match(A.validateSlot(slot('2026-10-05', '10:00', '11:00'), NOW), /past/);
});
test('time rules: missing half, order, hours, min, max', () => {
  assert.match(A.validateSlot(slot('2026-10-07', '10:00', ''), NOW), /both/);
  assert.match(A.validateSlot(slot('2026-10-07', '12:00', '11:00'), NOW), /after/);
  assert.match(A.validateSlot(slot('2026-10-07', '06:00', '09:00'), NOW), /between/);
  assert.match(A.validateSlot(slot('2026-10-07', '19:00', '21:00'), NOW), /between/);
  assert.match(A.validateSlot(slot('2026-10-07', '10:00', '10:15'), NOW), /at least/);
  assert.match(A.validateSlot(slot('2026-10-07', '08:00', '18:00'), NOW), /at most/);
});
test('today: start already passed is rejected, later start is fine', () => {
  assert.match(A.validateSlot(slot('2026-10-06', '09:00', '11:00'), NOW), /passed/);
  assert.strictEqual(A.validateSlot(slot('2026-10-06', '14:00', '16:00'), NOW), null);
});
test('approved leave blocks; pending and other dates do not', () => {
  const leave = [{ status: 'APPROVED', startDate: '2026-10-07', endDate: '2026-10-09' }, { status: 'PENDING', startDate: '2026-10-12', endDate: '2026-10-13' }];
  assert.ok(A.onApprovedLeave(leave, '2026-10-08'));
  assert.ok(!A.onApprovedLeave(leave, '2026-10-12'));
  assert.ok(!A.onApprovedLeave(leave, '2026-10-10'));
});
test('conflicts: overlap detected, touching ends are fine, inactive ignored', () => {
  const others = [
    { date: '2026-10-07', start: '10:00', end: '12:00', status: 'assigned', label: 'A' },
    { date: '2026-10-07', start: '13:00', end: '14:00', status: 'cancelled', label: 'B' },
    { date: '2026-10-07', start: '', end: '', status: 'assigned', label: 'C' },
    { date: '2026-10-08', start: '10:00', end: '12:00', status: 'assigned', label: 'D' }
  ];
  assert.strictEqual(A.findConflict(slot('2026-10-07', '11:00', '13:00'), others).label, 'A');
  assert.strictEqual(A.findConflict(slot('2026-10-07', '12:00', '13:00'), others), null);
  assert.strictEqual(A.findConflict(slot('2026-10-07', '13:00', '14:00'), others), null);
});
test('suggestSlots skips busy windows and respects hours', () => {
  const others = [{ date: '2026-10-07', start: '08:00', end: '12:00', status: 'assigned' }];
  const s = A.suggestSlots('2026-10-07', 60, others, NOW, 3);
  assert.strictEqual(s[0].start, '12:00'); assert.strictEqual(s.length, 3);
  assert.deepStrictEqual(A.suggestSlots('2026-10-07', 60, [{ date: '2026-10-07', start: '08:00', end: '20:00', status: 'new' }], NOW), []);
});
