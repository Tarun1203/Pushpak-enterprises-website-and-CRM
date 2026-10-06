const test = require('node:test');
const assert = require('node:assert');
const S = require('./spares');

test('op lines', () => {
  assert.strictEqual(S.validateOpLines([{ partId: 'p', qty: 2 }]), null);
  assert.ok(S.validateOpLines([]));
  assert.ok(S.validateOpLines([{ partId: 'p', qty: 0 }]));
  assert.ok(S.validateOpLines([{ partId: 'p', qty: 1.5 }]));
  assert.ok(S.validateOpLines([{ partId: 'p', qty: 1 }, { partId: 'p', qty: 1 }]));
});

test('defectives used in a month are due by the end of the next month (IST)', () => {
  const due = S.defectiveDueDate(new Date('2026-10-06T10:00:00Z'));
  assert.strictEqual(due.toISOString(), '2026-11-30T18:29:59.999Z'); // 30 Nov 23:59:59.999 IST
  const dec = S.defectiveDueDate(new Date('2026-12-31T19:00:00Z')); // 1 Jan 2027 00:30 IST
  assert.strictEqual(dec.toISOString(), '2027-02-28T18:29:59.999Z');
});

test('return id format matches the CRM pages', () => {
  assert.strictEqual(S.returnId(new Date('2026-10-06T20:00:00Z'), 7, 'ServiceCenter'), 'PE-RT-20261007-0007-ServiceCenter');
});

test('stock changes per op type', () => {
  const lines = [{ partId: 'p1', qty: 2 }];
  assert.deepStrictEqual(S.stockChanges('consume', lines, { role: 'technician', uid: 't' }), [{ loc: 'technician', uid: 't', partId: 'p1', delta: -2 }]);
  assert.deepStrictEqual(S.stockChanges('transfer_to_technician', lines, { role: 'servicecenter', uid: 'c', techUid: 't' }),
    [{ loc: 'servicecenter', uid: 'c', partId: 'p1', delta: -2 }, { loc: 'technician', uid: 't', partId: 'p1', delta: 2 }]);
  assert.deepStrictEqual(S.stockChanges('draw_from_center', lines, { role: 'technician', uid: 't', centerUid: 'c' }),
    [{ loc: 'servicecenter', uid: 'c', partId: 'p1', delta: -2 }, { loc: 'technician', uid: 't', partId: 'p1', delta: 2 }]);
});

test('stock never goes below zero', () => {
  const ch = [{ loc: 'servicecenter', uid: 'c', partId: 'p1', delta: -3 }];
  assert.match(S.applyChanges(ch, { servicecenter_c_p1: 2 }, { p1: 'Thermostat' }).error, /Only 2 of Thermostat/);
  assert.deepStrictEqual(S.applyChanges(ch, { servicecenter_c_p1: 3 }).next, { servicecenter_c_p1: 0 });
});
