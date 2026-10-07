const test = require('node:test');
const assert = require('node:assert');
const C = require('./customer');

const NOW = Date.UTC(2026, 9, 7, 3, 0, 0); // 2026-10-07 08:30 IST
const contact = { name: 'Asha', address: '12 MG Road', city: 'Raichur', state: 'Karnataka', pincode: '584101' };
const reg = (o) => Object.assign({ brand: 'MakWell', categoryId: 'geyser', category: 'Geyser', modelNo: 'G15', serialNumber: ' ab-1234 ', purchaseDate: '2026-09-01' }, contact, o);

test('istDate rolls over at IST midnight', () => {
  assert.strictEqual(C.istDate(Date.UTC(2026, 9, 6, 18, 29)).iso, '2026-10-06');
  assert.strictEqual(C.istDate(Date.UTC(2026, 9, 6, 18, 31)).iso, '2026-10-07');
  assert.strictEqual(C.istDate(NOW).ymd, '20261007');
  assert.strictEqual(C.istDate(NOW).ym, '202610');
});

test('registration validation', () => {
  const ok = C.validateRegistration(reg({}), NOW);
  assert.ok(ok.value);
  assert.strictEqual(ok.value.serialNumber, 'AB-1234');
  assert.strictEqual(ok.value.brandId, 'makwell');
  assert.strictEqual(ok.value.installationRequired, false);
  const bad = (o, re) => assert.match(C.validateRegistration(reg(o), NOW).error, re);
  bad({ brand: 'Acme' }, /brand/i);
  bad({ categoryId: '' }, /category/i);
  bad({ modelNo: ' ' }, /model/i);
  bad({ serialNumber: 'a/b' }, /serial/i);
  bad({ serialNumber: 'AB' }, /serial/i);
  bad({ purchaseDate: '2026-10-08' }, /future/);
  bad({ purchaseDate: '2026-02-30' }, /purchase date/i);
  bad({ purchaseDate: '2015-01-01' }, /too old/);
  bad({ pincode: '12345' }, /pincode/i);
  bad({ name: '' }, /name/i);
  assert.strictEqual(C.validateRegistration(reg({ serialNumber: '' }), NOW).value.serialNumber, '');
  assert.strictEqual(C.validateRegistration(reg({ purchaseDate: '2026-10-07' }), NOW).value.purchaseDate, '2026-10-07');
  assert.strictEqual(C.validateRegistration(reg({ installationRequired: 'yes' }), NOW).value.installationRequired, false);
});

test('booking validation', () => {
  const b = (o) => C.validateBooking(Object.assign({ requestType: 'service', issueDescription: 'No heating', registrationId: 'PE-REG-1' }, contact, o));
  assert.ok(b({}).value);
  assert.match(b({ issueDescription: '' }).error, /problem/);
  assert.ok(b({ requestType: 'installation', issueDescription: '' }).value);
  assert.match(b({ registrationId: '' }).error, /brand/i);
  assert.match(b({ registrationId: '', brand: 'MakWell' }).error, /category/i);
  assert.ok(b({ registrationId: '', brand: 'MakWell', category: 'Geyser', serialNumber: 'xy-9999' }).value.serialNumber === 'XY-9999');
  assert.match(b({ pincode: 'abc' }).error, /pincode/i);
});

test('tracking record keeps a history, only customer-safe fields, and no duplicates', () => {
  const t0 = { id: 't0' }, t1 = { id: 't1' }, t2 = { id: 't2' };
  const src = { requestId: 'PE-SVC-1', customerPhone: '9000000001', status: 'new', type: 'service', category: 'Geyser', customerName: 'Asha', address: 'Secret', closureNotes: 'internal' };
  const a = C.buildTrack(null, src, t0);
  assert.deepStrictEqual(a.data.history, [{ status: 'new', at: t0 }]);
  assert.ok(!('customerName' in a.data) && !('address' in a.data) && !('closureNotes' in a.data));
  const same = C.buildTrack(a.data, src, t1);
  assert.strictEqual(same.data.history.length, 1);
  const b = C.buildTrack(a.data, Object.assign({}, src, { status: 'assigned', technicianName: 'Ravi', serviceCenterName: 'SC', scheduledDate: '2026-10-09', scheduledStartTime: '10:00', scheduledEndTime: '12:00' }), t2);
  assert.deepStrictEqual(b.data.history.map((h) => h.status), ['new', 'assigned']);
  assert.deepStrictEqual(b.data.appointment, { date: '2026-10-09', start: '10:00', end: '12:00' });
  assert.strictEqual(b.data.technicianName, 'Ravi');
  assert.strictEqual(C.buildTrack(null, { requestId: 'x', customerPhone: '9000000001' }, t0), null);
  assert.strictEqual(C.buildTrack(null, { requestId: 'PE-SVC-1' }, t0), null);
  assert.strictEqual(C.buildTrack(null, { jobId: 'PE-JOB-7', customerPhone: '9', type: 'installation' }, t0).data.requestType, 'installation');
});
