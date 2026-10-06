// One approval queue (changeRequests), applied by the server
// (applyChangeRequest) once Super Admin approves. Pure, unit-testable.
//   spare_price     — Warehouse changes a spare part's price
//   stock_reduction — Warehouse writes off / corrects Head Office spare stock downward
//   center_rate     — a service center changes its own service-charge rates
const KINDS = ['spare_price', 'stock_reduction', 'center_rate'];
const MAX_RATES = 200;

function validatePayload(kind, p) {
  p = p || {};
  if (kind === 'spare_price') {
    if (p.price !== null && !(typeof p.price === 'number' && p.price >= 0 && p.price <= 10000000)) return 'Price must be a number from 0.';
    return null;
  }
  if (kind === 'stock_reduction') {
    if (typeof p.partId !== 'string' || !p.partId) return 'No part given.';
    if (!Number.isInteger(p.qty) || p.qty < 1 || p.qty > 100000) return 'Quantity must be a whole number from 1.';
    if (typeof p.reason !== 'string' || p.reason.trim().length < 3) return 'Give a reason.';
    if (!['adjustment', 'issue'].includes(p.mode)) return 'Unknown kind of reduction.';
    return null;
  }
  if (kind === 'center_rate') {
    if (!Array.isArray(p.rates) || !p.rates.length) return 'No rates given.';
    if (p.rates.length > MAX_RATES) return `At most ${MAX_RATES} rates at once.`;
    for (const r of p.rates) {
      if (!r || typeof r.category !== 'string' || !r.category) return 'A rate has no category.';
      if (!['repair', 'installation'].includes(r.rateType)) return 'A rate has an unknown type.';
      if (r.amount !== null && !(typeof r.amount === 'number' && r.amount >= 0 && r.amount <= 100000)) return 'Rates must be from 0 to 1,00,000 (or empty to remove).';
    }
    return null;
  }
  return 'Unknown request type.';
}

// Applying a stock reduction to the current quantity.
function applyReduction(current, qty) {
  const have = Number(current) || 0;
  if (have < qty) return { error: `Only ${have} in Warehouse stock now — can't take ${qty}.` };
  return { next: have - qty };
}

module.exports = { KINDS, MAX_RATES, validatePayload, applyReduction };
