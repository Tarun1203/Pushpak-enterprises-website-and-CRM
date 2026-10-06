// Finished-goods stock helpers (pure, unit-testable).
// Stock lives at a location: 'warehouse' (Head Office) or 'dist_<uid>'
// (a distributor). productStock/<location>_<modelId> holds onHand (units
// physically there) and reserved (units promised to approved orders).
// Every unit has a serial: unitSerials/<SERIAL>.
// One Firestore transaction can write ~500 documents, and every unit's
// serial is its own document, so a receipt or an order is capped at 400.
const MAX_RECEIPT_SERIALS = 400;
const SERIAL_RE = /^[A-Z0-9][A-Z0-9-]{3,39}$/; // no '/' — serials are document ids

const stockDocId = (location, modelId) => `${location}_${modelId}`;
const locationForSeller = (seller) => (seller === 'company' ? 'warehouse' : `dist_${seller}`);

function normalizeSerial(s) { return String(s || '').trim().toUpperCase(); }

// Splits pasted text (one per line, or comma/space separated) into serials.
function parseSerials(text) {
  return String(text || '').split(/[\s,;]+/).map(normalizeSerial).filter(Boolean);
}

function validateReceiptSerials(serials) {
  if (!Array.isArray(serials) || !serials.length) return 'Enter at least one serial number.';
  if (serials.length > MAX_RECEIPT_SERIALS) return `At most ${MAX_RECEIPT_SERIALS} serials per receipt.`;
  const seen = new Set();
  for (const raw of serials) {
    const s = normalizeSerial(raw);
    if (!SERIAL_RE.test(s)) return `"${raw}" is not a valid serial number.`;
    if (seen.has(s)) return `Serial ${s} is entered twice.`;
    seen.add(s);
  }
  return null;
}

// How much more to reserve for an order.
// lines: [{ modelId, qty }]; stock: { modelId: { onHand, reserved } };
// allocation: { modelId: alreadyReservedForThisOrder }
function planReservation(lines, stock, allocation) {
  const add = {};
  const next = { ...(allocation || {}) };
  let ready = true;
  (lines || []).forEach((l) => {
    const have = next[l.modelId] || 0;
    const need = l.qty - have;
    if (need <= 0) return;
    const s = stock[l.modelId] || { onHand: 0, reserved: 0 };
    const free = Math.max(0, (s.onHand || 0) - (s.reserved || 0) - (add[l.modelId] || 0));
    const take = Math.min(need, free);
    if (take > 0) { add[l.modelId] = (add[l.modelId] || 0) + take; next[l.modelId] = have + take; }
    if (have + take < l.qty) ready = false;
  });
  return { add, allocation: next, ready };
}

// Checks the serials entered for a dispatch.
// serialsByModel: { modelId: [serial] }; serialDocs: { SERIAL: doc|null }
function validateDispatchSerials(lines, serialsByModel, serialDocs, location) {
  const all = new Set();
  for (const l of lines || []) {
    const list = (serialsByModel && serialsByModel[l.modelId]) || [];
    if (list.length !== l.qty) return `${l.label || l.modelId}: ${l.qty} unit(s) ordered but ${list.length} serial(s) entered.`;
    for (const raw of list) {
      const s = normalizeSerial(raw);
      if (all.has(s)) return `Serial ${s} is entered twice.`;
      all.add(s);
      const d = serialDocs[s];
      if (!d) return `Serial ${s} was never received into stock.`;
      if (d.modelId !== l.modelId) return `Serial ${s} belongs to a different model.`;
      if (d.location !== location || d.status !== 'in_stock') return `Serial ${s} is not in stock here (${d.status || 'unknown'}${d.location && d.location !== location ? ' at another location' : ''}).`;
    }
  }
  const extra = Object.keys(serialsByModel || {}).filter((m) => !(lines || []).some((l) => l.modelId === m));
  if (extra.length) return 'Serials were entered for a product that is not on this order.';
  return null;
}

module.exports = {
  MAX_RECEIPT_SERIALS, SERIAL_RE, stockDocId, locationForSeller, normalizeSerial, parseSerials,
  validateReceiptSerials, planReservation, validateDispatchSerials
};
