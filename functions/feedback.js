// Customer feedback helpers (pure, unit-testable).
const LOW_RATING_MAX = 2;

// Fields copied from the real ticket onto the feedback record so the
// service center / technician can be shown their own feedback.
function enrichmentFor(ticket, mirror, sourceCollection, sourceDocId) {
  return {
    sourceCollection, sourceDocId,
    requestId: (ticket && (ticket.requestId || ticket.jobId)) || (mirror && mirror.ticketId) || null,
    serviceCenterUid: (ticket && ticket.serviceCenterUid) || null,
    technicianUid: (ticket && ticket.technicianUid) || null,
    category: (ticket && ticket.category) || (mirror && mirror.category) || null
  };
}

const FEEDBACK_STATUSES = ['completed', 'verification', 'closed'];

// The real ticket must carry this ticket ID, be finished, and belong to
// the phone number the customer typed.
function ticketAcceptsFeedback(ticket, ticketId, phone) {
  if (!ticket) return false;
  if ((ticket.requestId || ticket.jobId) !== ticketId) return false;
  if (!FEEDBACK_STATUSES.includes(ticket.status)) return false;
  return !!phone && ticket.customerPhone === phone;
}

const isLowRating = (rating) => Number(rating) <= LOW_RATING_MAX;

// Average and count over feedback docs (used by tests and mirrored by the dashboards).
function summarize(list) {
  const rated = (list || []).filter((f) => Number.isInteger(f.rating) && f.rating >= 1 && f.rating <= 5);
  if (!rated.length) return { count: 0, average: null };
  const sum = rated.reduce((a, f) => a + f.rating, 0);
  return { count: rated.length, average: Math.round((sum / rated.length) * 10) / 10 };
}

module.exports = { FEEDBACK_STATUSES, ticketAcceptsFeedback, enrichmentFor, isLowRating, summarize, LOW_RATING_MAX };
