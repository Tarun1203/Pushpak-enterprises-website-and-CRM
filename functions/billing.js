// Billing at closure (pure, unit-testable). Mirrors the logic the
// technician dashboard used to run in the browser, now run by a Cloud
// Function so a technician can't choose their own warranty verdict,
// charge or wallet credit.

function lc(v) { return String(v == null ? '' : v).trim().toLowerCase(); }

function warrantyVerdict(purchaseDate, months, now) {
  if (!purchaseDate) return null;
  const purchase = new Date(purchaseDate);
  if (isNaN(purchase.getTime())) return null;
  const expiry = new Date(purchase.getTime());
  expiry.setMonth(expiry.getMonth() + (months || 12));
  return expiry.getTime() >= now.getTime();
}

// reg: matching productRegistrations data or null.
// partNames: names of the spare parts replaced on this job.
// Component cover (per replaced part) wins, then the registration's
// overall cover, then the purchase date on the ticket (12 months).
function computeClosureWarranty(reg, ticket, partNames, now = new Date()) {
  if (reg && Array.isArray(reg.warrantyComponents) && reg.warrantyComponents.length && partNames && partNames.length) {
    for (const partName of partNames) {
      const pn = lc(partName);
      const comp = reg.warrantyComponents.find((c) => c && c.componentName &&
        (lc(c.componentName).includes(pn) || pn.includes(lc(c.componentName))));
      if (comp) return { inWarranty: warrantyVerdict(reg.purchaseDate, (comp.durationYears || 0) * 12, now), source: 'component' };
    }
  }
  if (reg) return { inWarranty: warrantyVerdict(reg.purchaseDate, reg.warrantyMonths, now), source: 'registration' };
  if (ticket && ticket.purchaseDate) return { inWarranty: warrantyVerdict(ticket.purchaseDate, 12, now), source: 'ticket' };
  return { inWarranty: null, source: 'none' };
}

function rateCardKey(scope, centerUid, category, rateType, bucket) {
  const safeCat = String(category || 'other').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const safeBucket = String(bucket || 'flat').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return scope === 'center' ? `center_${centerUid}_${safeCat}_${rateType}_${safeBucket}` : `default_${safeCat}_${rateType}_${safeBucket}`;
}

// Rate card doc ids in priority order: center override, default, then the
// flat (no size bucket) versions of each.
function rateLookupKeys(ticket, centerUid) {
  const rateType = ticket.type === 'installation' ? 'installation' : 'repair';
  const category = ticket.category || 'Other';
  const bucket = ticket.sizeBucket || null;
  const keys = [];
  if (centerUid) keys.push(rateCardKey('center', centerUid, category, rateType, bucket));
  keys.push(rateCardKey('default', null, category, rateType, bucket));
  if (bucket) {
    if (centerUid) keys.push(rateCardKey('center', centerUid, category, rateType, null));
    keys.push(rateCardKey('default', null, category, rateType, null));
  }
  return keys;
}

// amounts: { [docId]: amount } for whichever rate docs exist.
function pickRate(keys, amounts) {
  for (const k of keys) if (Object.prototype.hasOwnProperty.call(amounts, k)) return Number(amounts[k]) || 0;
  return 0;
}

// Claim checks. All return { kind, status: 'ok'|'mismatch'|'manual', claimed, verified, issues }.
const round2 = (n) => Math.round(n * 100) / 100;

// txns: [{ id, technicianUid, amount, status, claimId }] for claim.walletTxnIds that exist.
function verifyWalletClaim(claim, txns) {
  const issues = [];
  const ids = claim.walletTxnIds || [];
  let verified = 0;
  for (const id of ids) {
    const t = txns.find((x) => x.id === id);
    if (!t) { issues.push(`credit ${id} does not exist`); continue; }
    if (t.technicianUid !== claim.claimantUid) { issues.push(`credit ${id} belongs to someone else`); continue; }
    if (t.status === 'claimed' && t.claimId && t.claimId !== claim.claimId) { issues.push(`credit ${id} is already in claim ${t.claimId}`); continue; }
    verified += Number(t.amount) || 0;
  }
  if (new Set(ids).size !== ids.length) issues.push('the same credit is listed twice');
  verified = round2(verified);
  const claimed = round2(Number(claim.amount) || 0);
  if (claimed !== verified) issues.push(`claimed ₹${claimed} but the credits add up to ₹${verified}`);
  return { kind: 'wallet', status: issues.length ? 'mismatch' : 'ok', claimed, verified, issues };
}

// tickets: [{ id, serviceCenterUid, billingTotal, billingType, claimId, billingStatus }].
function verifyTicketClaim(claim, tickets) {
  const issues = [];
  const ids = claim.ticketIds || [];
  let verified = 0;
  for (const id of ids) {
    const t = tickets.find((x) => x.id === id);
    if (!t) { issues.push(`ticket ${id} does not exist`); continue; }
    if (t.serviceCenterUid !== claim.claimantUid) { issues.push(`ticket ${id} belongs to another center`); continue; }
    if (t.claimId && t.claimId !== claim.claimId) { issues.push(`ticket ${id} is already in claim ${t.claimId}`); continue; }
    verified += Number(t.billingTotal) || 0;
  }
  if (new Set(ids).size !== ids.length) issues.push('the same ticket is listed twice');
  verified = round2(verified);
  const claimed = round2(Number(claim.amount) || 0);
  if (claimed !== verified) issues.push(`claimed ₹${claimed} but the tickets add up to ₹${verified}`);
  return { kind: 'ticket', status: issues.length ? 'mismatch' : 'ok', claimed, verified, issues };
}

module.exports = {
  computeClosureWarranty, rateCardKey, rateLookupKeys, pickRate, verifyWalletClaim, verifyTicketClaim
};
