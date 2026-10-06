const test = require('node:test');
const assert = require('node:assert');
const L = require('./lookup');

test('normalizePhone / phoneFromToken', () => {
  assert.strictEqual(L.normalizePhone('+91 98765-43210'), '9876543210');
  assert.strictEqual(L.normalizePhone('919876543210'), '9876543210');
  assert.strictEqual(L.normalizePhone('5876543210'), null);
  assert.strictEqual(L.normalizePhone('98765'), null);
  assert.strictEqual(L.normalizePhone(9876543210), null);
  assert.strictEqual(L.phoneFromToken('+919876543210'), '9876543210');
  assert.strictEqual(L.phoneFromToken('+14155550100'), null);
  assert.strictEqual(L.phoneFromToken(undefined), null);
});

test('ticket ids and masking', () => {
  assert.strictEqual(L.cleanTicketId(' PE-SVC-20260910-0001-CustomerSite '), 'PE-SVC-20260910-0001-CustomerSite');
  assert.strictEqual(L.cleanTicketId('a/b'), null);
  assert.strictEqual(L.cleanTicketId('ab'), null);
  assert.strictEqual(L.maskSerial('ABCD12345'), '••••2345');
  assert.strictEqual(L.maskSerial('AB'), '••••');
  assert.strictEqual(L.maskSerial(''), '');
});

test('rate limit keys and verdict', () => {
  const k = L.limitKeys('iphash', '9876543210', 'PE-CR-1', 7200000 * 3);
  assert.strictEqual(k.length, 3);
  assert.ok(k[0].id.endsWith('_6'));
  assert.deepStrictEqual(L.checkLimits(k, {}), { ok: true });
  assert.strictEqual(L.checkLimits(k, { [k[1].id]: 25 }).ok, false);
  assert.strictEqual(L.limitKeys('h', null, null, 0).length, 1);
});

test('customer profile comes only from a verified phone and never overrides another role', () => {
  assert.strictEqual(L.buildCustomerProfile({ email: 'a@b.c' }, 'A', null).error, 'phone-not-verified');
  assert.strictEqual(L.buildCustomerProfile({ phone_number: '+919876543210' }, 'A', { role: 'dealer' }).error, 'not-a-customer');
  const p = L.buildCustomerProfile({ phone_number: '+919876543210', email: 'x@y.z' }, ' Asha ', null).profile;
  assert.deepStrictEqual(p, { role: 'customer', phone10: '9876543210', name: 'Asha', email: 'x@y.z' });
  assert.strictEqual('name' in L.buildCustomerProfile({ phone_number: '+919876543210' }, '', { role: 'customer', name: 'Old' }).profile, false);
});
