const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const F = require('./finance');

test('financial year flips on 1 April IST', () => {
  assert.strictEqual(F.fiscalYear(new Date('2026-03-31T18:00:00Z')), '2025-26'); // 31 Mar 23:30 IST
  assert.strictEqual(F.fiscalYear(new Date('2026-03-31T18:31:00Z')), '2026-27'); // 1 Apr 00:01 IST
  assert.strictEqual(F.fiscalYear(new Date('2027-01-15T00:00:00Z')), '2026-27');
  assert.strictEqual(F.invoiceNumber('PE', '2026-27', 42), 'PE/2026-27/00042');
});

test('state code from GSTIN', () => {
  assert.strictEqual(F.stateCodeFromGstin('29ABCDE1234F1Z5'), '29');
  assert.strictEqual(F.stateCodeFromGstin('bad'), null);
});

test('same state splits CGST/SGST, other state is IGST', () => {
  const lines = [{ modelId: 'm', qty: 1, taxable: 100, gst: 18.01, gstRate: 18 }];
  const same = F.splitGst(lines, '29', '29');
  assert.deepStrictEqual([same.totals.cgst, same.totals.sgst, same.totals.igst], [9.01, 9, 0]);
  assert.strictEqual(same.totals.total, 118.01);
  const other = F.splitGst(lines, '29', '33');
  assert.deepStrictEqual([other.totals.cgst, other.totals.sgst, other.totals.igst], [0, 0, 18.01]);
  assert.ok(other.interState);
  assert.strictEqual(F.splitGst(lines, '29', null).buyerStateKnown, false);
});

test('payments go to the oldest invoices first; extra stays as advance', () => {
  const r = F.allocatePayment(1500, [{ id: 'a', balance: 1000 }, { id: 'b', balance: 0 }, { id: 'c', balance: 800 }]);
  assert.deepStrictEqual(r.allocations, [{ invoiceId: 'a', amount: 1000 }, { invoiceId: 'c', amount: 500 }]);
  assert.strictEqual(r.unallocated, 0);
  assert.strictEqual(F.allocatePayment(300, [{ id: 'a', balance: 100 }]).unallocated, 200);
});

test('credit check: limit and overdue', () => {
  const now = new Date('2026-10-06T00:00:00Z');
  assert.ok(F.creditCheck({ creditLimit: 10000, outstanding: 4000 }, 6000, now).ok);
  const over = F.creditCheck({ creditLimit: 10000, outstanding: 4000 }, 6000.01, now);
  assert.ok(!over.ok);
  const overdue = F.creditCheck({ creditLimit: 1e6, outstanding: 0, oldestUnpaidDue: new Date('2026-10-01T00:00:00Z') }, 1, now);
  assert.ok(!overdue.ok && /overdue/i.test(overdue.reasons[0]));
  assert.ok(!F.creditCheck(undefined, 1, now).ok); // no account set up = no credit
  assert.ok(F.creditCheck({ creditLimit: 0, outstanding: -500 }, 500, now).ok); // paid in advance
});

test('aging buckets by days past due', () => {
  const now = new Date('2026-10-06T00:00:00Z');
  const inv = (days, bal, status) => ({ balance: bal, status, dueDate: new Date(now.getTime() - days * 86400000) });
  assert.deepStrictEqual(F.agingBuckets([inv(-5, 100), inv(10, 200), inv(45, 300), inv(75, 400), inv(120, 500), inv(10, 999, 'cancelled'), inv(10, 0)], now),
    { notDue: 100, d1_30: 200, d31_60: 300, d61_90: 400, d90plus: 500 });
});

test('the CRM copy is identical', () => {
  assert.strictEqual(fs.readFileSync(path.join(__dirname, 'finance.js'), 'utf8'), fs.readFileSync(path.join(__dirname, '..', 'crm', 'finance.js'), 'utf8'));
});
