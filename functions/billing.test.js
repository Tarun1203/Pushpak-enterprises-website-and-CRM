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

test('claim items lock only if they are the claimant\'s own and still open', () => {
  const B = require('./billing');
  const claim = { claimantUid: 't1', walletTxnIds: ['a', 'b'] };
  const ok = B.lockCheck(claim, [{ id: 'a', technicianUid: 't1', status: 'unclaimed', amount: 300 }, { id: 'b', technicianUid: 't1', status: 'unclaimed', amount: 200.5 }], 'wallet');
  assert.deepStrictEqual(ok, { ok: true, total: 500.5 });
  assert.match(B.lockCheck(claim, [{ id: 'a', technicianUid: 't1', status: 'claimed', claimId: 'CL-1' }, { id: 'b', technicianUid: 't1', status: 'unclaimed' }], 'wallet').reason, /already claimed \(CL-1\)/);
  assert.match(B.lockCheck(claim, [{ id: 'a', technicianUid: 'x', status: 'unclaimed' }, { id: 'b', technicianUid: 't1', status: 'unclaimed' }], 'wallet').reason, /someone else/);
  assert.match(B.lockCheck({ claimantUid: 't1', walletTxnIds: ['a', 'a'] }, [], 'wallet').reason, /twice/);
  const tk = B.lockCheck({ claimantUid: 'c1', ticketIds: ['t'] }, [{ id: 't', serviceCenterUid: 'c1', billingStatus: 'ready_to_claim', billingTotal: 450 }], 'ticket');
  assert.deepStrictEqual(tk, { ok: true, total: 450 });
  assert.ok(!B.lockCheck({ claimantUid: 'c1', ticketIds: ['t'] }, [{ id: 't', serviceCenterUid: 'c1', billingStatus: 'claimed' }], 'ticket').ok);
});

test('center billing decision is checked on the server', () => {
  const B = require('./billing');
  const done = { status: 'completed' };
  assert.deepStrictEqual(B.billingDecision(done, null, { treatAs: 'in' }, 450).update.billingTotal, 450);
  assert.match(B.billingDecision(done, false, { treatAs: 'in' }, 450).error, /out of warranty/);
  assert.match(B.billingDecision(done, true, { treatAs: 'in' }, 0).error, /No service charge rate/);
  const techClosed = { status: 'completed', serviceCharge: 300, billingComputedAt: 1 };
  assert.strictEqual(B.billingDecision(techClosed, true, { treatAs: 'in' }, 450).update.billingTotal, 0);
  const out = B.billingDecision(done, true, { treatAs: 'out', sparePartsCost: '100', otherCharges: 0, serviceCharge: 250.555, paymentMethod: 'upi' }, 450).update;
  assert.strictEqual(out.billingTotal, 350.56);
  assert.strictEqual(out.billingStatus, 'collected');
  assert.match(B.billingDecision({ status: 'completed', billingStatus: 'claimed' }, true, { treatAs: 'out' }, 0).error, /Already billed/);
  assert.match(B.billingDecision({ status: 'in_progress' }, true, { treatAs: 'in' }, 10).error, /completed/);
  assert.match(B.billingDecision(done, true, { treatAs: 'out', sparePartsCost: -1, otherCharges: 0, serviceCharge: 0 }, 0).error, /Amounts/);
});
