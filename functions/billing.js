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

// Free-form claim types (a bill / receipt photo is required for these).
const CLAIM_TYPES = ['travel', 'local_purchase', 'tools', 'other'];

// Can every item a claim lists be locked to it? Wallet credits must be the
// claimant's own and still unclaimed; tickets must be the claimant
// center's own and ready to claim. Returns { ok, reason, total }.
function lockCheck(claim, items, kind) {
  const ids = (kind === 'wallet' ? claim.walletTxnIds : claim.ticketIds) || [];
  if (!ids.length) return { ok: false, reason: 'No items listed.' };
  if (ids.length > 50) return { ok: false, reason: 'At most 50 items per claim.' };
  if (new Set(ids).size !== ids.length) return { ok: false, reason: 'The same item is listed twice.' };
  let total = 0;
  for (const id of ids) {
    const it = items.find((x) => x.id === id);
    if (!it) return { ok: false, reason: `${id} does not exist.` };
    if (kind === 'wallet') {
      if (it.technicianUid !== claim.claimantUid) return { ok: false, reason: `Credit ${it.sourceJobLabel || id} belongs to someone else.` };
      if (it.status !== 'unclaimed') return { ok: false, reason: `Credit ${it.sourceJobLabel || id} is already ${it.status}${it.claimId ? ' (' + it.claimId + ')' : ''}.` };
      total += Number(it.amount) || 0;
    } else {
      if (it.serviceCenterUid !== claim.claimantUid) return { ok: false, reason: `Ticket ${it.requestId || id} isn't this center's.` };
      if (it.billingStatus !== 'ready_to_claim') return { ok: false, reason: `Ticket ${it.requestId || id} is ${it.billingStatus || 'not billed yet'}${it.claimId ? ' (' + it.claimId + ')' : ''}.` };
      total += Number(it.billingTotal) || 0;
    }
  }
  return { ok: true, total: round2(total) };
}

// A service center's billing decision on a completed ticket, checked here
// instead of trusted from the browser. verdict: true / false / null (the
// server's own warranty check); rate: the center's rate-card amount.
// req: { treatAs: 'in'|'out', sparePartsCost, otherCharges, serviceCharge, paymentMethod, paymentRef }
function billingDecision(ticket, verdict, req, rate) {
  if (!['completed', 'verification', 'closed'].includes(ticket.status)) return { error: 'Bill a ticket only after it is completed.' };
  if (ticket.billingStatus) return { error: `Already billed (${ticket.billingStatus}).` };
  const money = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 1000000 ? round2(n) : null; };
  if (req.treatAs === 'in') {
    if (verdict === false) return { error: 'The warranty check says this product is out of warranty — bill the customer instead.' };
    const techCredited = !!(ticket.serviceCharge && ticket.billingComputedAt);
    const claimable = techCredited ? 0 : (Number(rate) || 0);
    if (!techCredited && !(claimable > 0)) return { error: 'No service charge rate is set for this category/type — set it under Service Charge Rates first.' };
    return { update: {
      warrantyStatus: 'in_warranty', billingType: 'claim', billingStatus: 'ready_to_claim', billingTotal: claimable,
      serviceCharge: techCredited ? ticket.serviceCharge : claimable, sparePartsCost: 0, otherCharges: 0
    } };
  }
  if (req.treatAs === 'out') {
    const spare = money(req.sparePartsCost), other = money(req.otherCharges), svc = money(req.serviceCharge);
    if (spare === null || other === null || svc === null) return { error: 'Amounts must be between 0 and 10,00,000.' };
    return { update: {
      warrantyStatus: 'out_of_warranty', billingType: 'customer', billingStatus: 'collected',
      sparePartsCost: spare, otherCharges: other, serviceCharge: svc, billingTotal: round2(spare + other + svc),
      customerPaymentMethod: ['cash', 'upi', 'card', 'other'].includes(req.paymentMethod) ? req.paymentMethod : 'other',
      customerPaymentRef: String(req.paymentRef || '').slice(0, 80) || null
    } };
  }
  return { error: 'Choose in-warranty or out-of-warranty.' };
}

module.exports = {
  CLAIM_TYPES, lockCheck, billingDecision,
  computeClosureWarranty, rateCardKey, rateLookupKeys, pickRate, verifyWalletClaim, verifyTicketClaim
};
