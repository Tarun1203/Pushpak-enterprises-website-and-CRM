// Job lifecycle rules (pure, unit-testable). Enforced server-side for
// non-admin writers (technicians and service centers); Super Admin and
// Warehouse may move a ticket anywhere (verify / close / reopen).

// Moves a technician or service center may make. Verification, closed
// and reopened are staff-only steps and appear nowhere on the right.
const TRANSITIONS = {
  new:                   ['assigned', 'cancelled'],
  assigned:              ['accepted', 'in_progress', 'waiting_spare', 'reassignment_required', 'cancelled'],
  accepted:              ['on_the_way', 'in_progress', 'waiting_spare', 'reassignment_required', 'cancelled'],
  on_the_way:            ['at_customer', 'in_progress', 'waiting_spare', 'cancelled'],
  at_customer:           ['in_progress', 'waiting_spare', 'cancelled'],
  in_progress:           ['waiting_spare', 'completed', 'cancelled'],
  waiting_spare:         ['in_progress', 'cancelled'],
  reassignment_required: ['assigned', 'new', 'cancelled'],
  reopened:              ['assigned', 'accepted', 'in_progress', 'cancelled'],
  completed:             [],
  verification:          [],
  closed:                [],
  cancelled:             []
};

// What must be on the ticket for it to be marked completed.
const CLOSURE_FIELDS = ['closureCode', 'actionTaken', 'partsUsedNotes'];

function str(v) { return typeof v === 'string' ? v.trim() : ''; }

// Returns an error message, or null when the move is acceptable.
// before / after: ticket data; actorUid: the signed-in uid making the change.
function checkTransition(before, after, actorUid) {
  const from = before && before.status;
  const to = after && after.status;
  if (!to || from === to) return null;
  if (from && Object.prototype.hasOwnProperty.call(TRANSITIONS, from) && !TRANSITIONS[from].includes(to)) {
    return `A ticket can't move from "${from}" to "${to}" here.`;
  }
  if (to === 'completed') {
    const missing = CLOSURE_FIELDS.filter((f) => !str(after[f]));
    if (missing.length) return `Closing needs: ${missing.join(', ')}.`;
    if (after.closedByUid && after.closedByUid !== actorUid) return 'A ticket can only be closed under your own account.';
  }
  return null;
}

// Spare request pipeline (Warehouse / Super Admin / requester). Both
// dispatch screens can dispatch straight from any not-yet-sent stage,
// so every pre-dispatch stage may go to "dispatched".
const SPARE_TRANSITIONS = {
  new:                 ['approved', 'backorder', 'dispatched'],
  approved:            ['picking', 'packing', 'backorder', 'dispatched'],
  picking:             ['packing', 'backorder', 'dispatched'],
  packing:             ['dispatched', 'backorder'],
  dispatched:          ['intransit', 'received'],
  intransit:           ['received'],
  backorder:           ['new'],
  received:            [],
  fulfilled_by_center: []
};

// Returns an error message, or null when the move is acceptable.
function checkSpareTransition(before, after) {
  const from = before && before.status;
  const to = after && after.status;
  if (!to || from === to) return null;
  if (from && Object.prototype.hasOwnProperty.call(SPARE_TRANSITIONS, from) && !SPARE_TRANSITIONS[from].includes(to)) {
    return `A spare request can't move from "${from}" to "${to}".`;
  }
  if (to === 'dispatched') {
    const t = after.transport || {};
    if (!str(t.transporter) || !str(t.docket)) return 'Dispatch needs the transporter name and docket number.';
  }
  return null;
}

module.exports = { TRANSITIONS, CLOSURE_FIELDS, checkTransition, SPARE_TRANSITIONS, checkSpareTransition };
