// Pure intake helpers (no Firebase imports, unit-testable).
// Warranty at intake is a first read from what is on file when the
// request arrives. The billing decision at closure (part-level
// component cover) stays authoritative and writes `warrantyStatus`;
// this writes the separate, server-only `intakeWarranty`.

const OPEN_STATUSES = ['new', 'assigned', 'accepted', 'on_the_way', 'at_customer', 'in_progress', 'waiting_spare'];
const DUPLICATE_WINDOW_DAYS = 30;
const DEFAULT_WARRANTY_MONTHS = 12;

function addMonths(date, months) {
  const d = new Date(date.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}

function warrantyFrom(purchaseDate, months, source, now) {
  const purchase = new Date(purchaseDate);
  if (!purchaseDate || isNaN(purchase.getTime())) return null;
  const expiry = addMonths(purchase, months);
  return {
    status: expiry.getTime() >= now.getTime() ? 'in_warranty' : 'out_of_warranty',
    expiresOn: expiry.toISOString().slice(0, 10),
    source
  };
}

// reg: matching productRegistrations doc data, or null.
function computeIntakeWarranty(reg, ticket, now = new Date()) {
  if (reg) {
    const months = Number(reg.warrantyMonths) || DEFAULT_WARRANTY_MONTHS;
    const w = warrantyFrom(reg.purchaseDate, months, 'registration', now);
    if (w) return w;
  }
  const purchase = ticket && (ticket.purchaseDate || null);
  const w = warrantyFrom(purchase, DEFAULT_WARRANTY_MONTHS, 'ticket-purchase-date', now);
  if (w) return w;
  return { status: 'unknown', expiresOn: null, source: 'none' };
}

// Another ticket is a possible duplicate when it is a different ticket,
// still open (or opened inside the window) and matches on serial
// number, or on phone + category when no serial was given.
function isPossibleDuplicate(candidate, ticket, now = new Date()) {
  if (!candidate || candidate.id === ticket.id) return false;
  const created = candidate.createdAtMs;
  const recent = created && (now.getTime() - created) <= DUPLICATE_WINDOW_DAYS * 86400000;
  const open = OPEN_STATUSES.includes(candidate.status);
  if (!open && !recent) return false;
  const serial = (ticket.serialNumber || '').trim().toLowerCase();
  if (serial) return (candidate.serialNumber || '').trim().toLowerCase() === serial;
  return !!ticket.customerPhone && candidate.customerPhone === ticket.customerPhone
    && !!ticket.category && candidate.category === ticket.category;
}

module.exports = { computeIntakeWarranty, isPossibleDuplicate, OPEN_STATUSES, DUPLICATE_WINDOW_DAYS };
