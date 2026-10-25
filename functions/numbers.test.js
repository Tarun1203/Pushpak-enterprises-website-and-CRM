const test = require('node:test');
const assert = require('node:assert');
const N = require('./numbers');
test('numbers use the India date and the shared monthly counter', () => {
  const t = Date.UTC(2026, 9, 31, 20, 0); // 1 Nov 2026 01:30 IST
  assert.strictEqual(N.counterId('claim', t), 'claim-202611');
  assert.strictEqual(N.format('claim', 7, 'technician', t), 'PE-CL-20261101-0007-Technician');
  assert.strictEqual(N.format('servicejob', 12345, 'superadmin', t), 'PE-JOB-20261101-12345-SuperAdmin');
  assert.ok(N.ALLOWED.servicejob.includes('technician') && !N.ALLOWED.centerrequest.includes('technician'));
});
