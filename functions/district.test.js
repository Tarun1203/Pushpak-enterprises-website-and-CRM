const test = require('node:test');
const assert = require('node:assert');
const { districtFor } = require('./district');

test('district: keeps an existing one, then pincode master, then the center profile', () => {
  assert.strictEqual(districtFor({ district: 'Raichur' }, { district: 'Ballari' }, null), 'Raichur');
  assert.strictEqual(districtFor({ pincode: '584101' }, { district: ' Raichur ' }, { district: 'Ballari' }), 'Raichur');
  assert.strictEqual(districtFor({ pincode: '584101' }, { district: 'Raichur', active: false }, { district: 'Ballari' }), 'Ballari');
  assert.strictEqual(districtFor({ pincode: '' }, null, { district: 'Dharwad' }), 'Dharwad');
  assert.strictEqual(districtFor({}, null, null), null);
});
