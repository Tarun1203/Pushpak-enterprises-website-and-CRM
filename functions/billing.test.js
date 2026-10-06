const test = require('node:test');
const assert = require('node:assert');
const B = require('./billing');
const NOW = new Date('2026-10-06T00:00:00Z');

test('component cover outlasts overall cover', () => {
  const reg = { purchaseDate: '2024-01-01', warrantyMonths: 12, warrantyComponents: [{ componentName: 'Compressor', durationYears: 5 }] };
  assert.deepStrictEqual(B.computeClosureWarranty(reg, {}, ['Compressor Assembly'], NOW), { inWarranty: true, source: 'component' });
  assert.strictEqual(B.computeClosureWarranty(reg, {}, ['Knob'], NOW).inWarranty, false);
  assert.strictEqual(B.computeClosureWarranty(reg, {}, [], NOW).source, 'registration');
});
test('registration, ticket date and unknown fallbacks', () => {
  assert.strictEqual(B.computeClosureWarranty({ purchaseDate: '2026-05-01', warrantyMonths: 12 }, {}, [], NOW).inWarranty, true);
  assert.deepStrictEqual(B.computeClosureWarranty(null, { purchaseDate: '2024-01-01' }, [], NOW), { inWarranty: false, source: 'ticket' });
  assert.deepStrictEqual(B.computeClosureWarranty(null, {}, [], NOW), { inWarranty: null, source: 'none' });
  assert.strictEqual(B.computeClosureWarranty({ purchaseDate: 'junk' }, {}, [], NOW).inWarranty, null);
});
test('rate keys: center first, then default, then flat fallbacks', () => {
  const keys = B.rateLookupKeys({ category: 'LED TV', type: 'repair', sizeBucket: '32 inch' }, 'c1');
  assert.deepStrictEqual(keys, ['center_c1_led_tv_repair_32_inch', 'default_led_tv_repair_32_inch', 'center_c1_led_tv_repair_flat', 'default_led_tv_repair_flat']);
  assert.deepStrictEqual(B.rateLookupKeys({ category: 'Geyser', type: 'installation' }, null), ['default_geyser_installation_flat']);
});
test('pickRate takes the first existing key, 0 when none', () => {
  const keys = ['a', 'b', 'c'];
  assert.strictEqual(B.pickRate(keys, { b: 150, c: 99 }), 150);
  assert.strictEqual(B.pickRate(keys, {}), 0);
  assert.strictEqual(B.pickRate(keys, { a: 'x' }), 0);
});
const wc = { claimId: 'CL1', claimantUid: 'u1', walletTxnIds: ['t1', 't2'], amount: 300 };
test('wallet claim: matching total is ok', () => {
  const r = B.verifyWalletClaim(wc, [{ id: 't1', technicianUid: 'u1', amount: 100, status: 'claimed', claimId: 'CL1' }, { id: 't2', technicianUid: 'u1', amount: 200, status: 'unclaimed' }]);
  assert.strictEqual(r.status, 'ok'); assert.strictEqual(r.verified, 300);
});
test('wallet claim: inflated, foreign, duplicate and already-claimed credits are flagged', () => {
  const r = B.verifyWalletClaim({ ...wc, amount: 900, walletTxnIds: ['t1', 't1', 't2', 't3'] }, [
    { id: 't1', technicianUid: 'u1', amount: 100, status: 'unclaimed' },
    { id: 't2', technicianUid: 'other', amount: 200, status: 'unclaimed' }]);
  assert.strictEqual(r.status, 'mismatch');
  assert.ok(r.issues.some((i) => /someone else/.test(i)) && r.issues.some((i) => /twice/.test(i)) && r.issues.some((i) => /does not exist/.test(i)) && r.issues.some((i) => /claimed ₹900/.test(i)));
  const used = B.verifyWalletClaim({ ...wc, walletTxnIds: ['t1'], amount: 100 }, [{ id: 't1', technicianUid: 'u1', amount: 100, status: 'claimed', claimId: 'CL9' }]);
  assert.match(used.issues[0], /already in claim CL9/);
});
test('ticket claim: totals, ownership and reuse', () => {
  const claim = { claimId: 'CL2', claimantUid: 'c1', ticketIds: ['a', 'b'], amount: 500.5 };
  assert.strictEqual(B.verifyTicketClaim(claim, [{ id: 'a', serviceCenterUid: 'c1', billingTotal: 200.25 }, { id: 'b', serviceCenterUid: 'c1', billingTotal: 300.25 }]).status, 'ok');
  const bad = B.verifyTicketClaim(claim, [{ id: 'a', serviceCenterUid: 'c1', billingTotal: 200 }, { id: 'b', serviceCenterUid: 'zzz', billingTotal: 300 }]);
  assert.strictEqual(bad.status, 'mismatch');
  assert.match(bad.issues.join(' '), /another center/);
});
