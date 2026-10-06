const test = require('node:test');
const assert = require('node:assert');
const { enrichmentFor, isLowRating, summarize, ticketAcceptsFeedback } = require('./feedback');

test('enrichment copies center, technician and category from the ticket', () => {
  const e = enrichmentFor({ requestId: 'PE-CR-1', serviceCenterUid: 'c', technicianUid: 't', category: 'Geyser' }, { ticketId: 'x' }, 'centerRequests', 'doc1');
  assert.deepStrictEqual(e, { sourceCollection: 'centerRequests', sourceDocId: 'doc1', requestId: 'PE-CR-1', serviceCenterUid: 'c', technicianUid: 't', category: 'Geyser' });
});
test('enrichment tolerates a ticket without center or technician', () => {
  const e = enrichmentFor({ jobId: 'PE-JOB-9' }, { ticketId: 'PE-JOB-9', category: 'LED TV' }, 'serviceJobs', 'd');
  assert.strictEqual(e.serviceCenterUid, null); assert.strictEqual(e.technicianUid, null); assert.strictEqual(e.category, 'LED TV'); assert.strictEqual(e.requestId, 'PE-JOB-9');
});
test('low rating is 1 or 2', () => {
  assert.ok(isLowRating(1) && isLowRating(2)); assert.ok(!isLowRating(3) && !isLowRating(5));
});
test('summarize averages valid ratings only', () => {
  assert.deepStrictEqual(summarize([{ rating: 5 }, { rating: 4 }, { rating: 4 }, { rating: 9 }, {}]), { count: 3, average: 4.3 });
  assert.deepStrictEqual(summarize([]), { count: 0, average: null });
});
test('feedback accepted only for a finished ticket with matching id and phone', () => {
  const t = { requestId: 'PE-CR-1', status: 'closed', customerPhone: '9876543210' };
  assert.ok(ticketAcceptsFeedback(t, 'PE-CR-1', '9876543210'));
  assert.ok(!ticketAcceptsFeedback(t, 'PE-CR-2', '9876543210'));
  assert.ok(!ticketAcceptsFeedback(t, 'PE-CR-1', '9999999999'));
  assert.ok(!ticketAcceptsFeedback({ ...t, status: 'in_progress' }, 'PE-CR-1', '9876543210'));
  assert.ok(ticketAcceptsFeedback({ jobId: 'PE-JOB-3', status: 'completed', customerPhone: '1' }, 'PE-JOB-3', '1'));
});
