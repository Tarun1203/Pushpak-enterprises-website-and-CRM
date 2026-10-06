'use strict';
// Pure helpers for the public lookups (warranty check, track service,
// "find my registered product") and for customer accounts.
//
// Customers are not staff, and the website used to let ANYONE read every
// product registration and ticket record (names, addresses, phones).
// Those reads are now closed in firestore.rules; the website asks the
// publicLookup Cloud Function instead, which answers one phone / ticket
// at a time, returns only the fields a customer needs, and is rate
// limited. Nothing here touches Firestore, so it is unit tested directly.

const PHONE_RE = /^[6-9][0-9]{9}$/;
const TICKET_RE = /^[A-Za-z0-9][A-Za-z0-9-]{4,79}$/;

// Accepts "9876543210", "+91 98765-43210", "919876543210"; returns the
// 10 digits or null.
function normalizePhone(raw) {
  if (typeof raw !== 'string') return null;
  let d = raw.replace(/[\s-]/g, '');
  d = d.replace(/^(\+91|91)(?=[0-9]{10}$)/, '');
  return PHONE_RE.test(d) ? d : null;
}

// Firebase phone-auth token value ("+919876543210") -> 10 digits or null.
function phoneFromToken(tokenPhone) {
  if (typeof tokenPhone !== 'string') return null;
  const m = /^\+91([6-9][0-9]{9})$/.exec(tokenPhone);
  return m ? m[1] : null;
}

function cleanTicketId(raw) {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  return TICKET_RE.test(t) ? t : null;
}

function maskSerial(serial) {
  const s = String(serial || '').trim();
  if (!s) return '';
  if (s.length <= 4) return '••••';
  return '••••' + s.slice(-4);
}

function toIso(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate().toISOString();
  if (typeof ts.toMillis === 'function') return new Date(ts.toMillis()).toISOString();
  if (ts instanceof Date) return ts.toISOString();
  return null;
}

function str(v, max) {
  return typeof v === 'string' ? v.slice(0, max || 200) : '';
}

// A registration as the customer-facing lookups show it. Never the name,
// address, dealer or internal fields. `fullSerial` is only for the
// "book a service" prefill, which needs it to match the warranty record.
function shapeRegistration(d, opts) {
  const o = opts || {};
  const comps = Array.isArray(d.warrantyComponents) ? d.warrantyComponents.slice(0, 20).map((c) => ({
    componentName: str(c && c.componentName, 80),
    coverage: str(c && c.coverage, 120),
    durationYears: Number(c && c.durationYears) || 0
  })) : [];
  return {
    registrationId: str(d.registrationId, 60),
    product: str(d.product, 120),
    brand: str(d.brand, 60),
    category: str(d.category, 60),
    modelNo: str(d.modelNo, 60),
    serialNumber: o.fullSerial ? str(d.serialNumber, 60) : maskSerial(d.serialNumber),
    purchaseDate: str(d.purchaseDate, 20),
    warrantyMonths: Number(d.warrantyMonths) || 0,
    warrantyComponents: comps,
    createdAt: toIso(d.createdAt)
  };
}

// A ticket as shown publicly (also used for the signed-in customer's list).
function shapeTicket(d, id) {
  return {
    ticketId: str(d.ticketId || id, 80),
    category: str(d.category, 60),
    brand: str(d.brand, 60),
    requestType: d.requestType === 'installation' ? 'installation' : 'service',
    status: str(d.status, 40) || 'new',
    warrantyStatus: str(d.warrantyStatus, 30),
    createdAt: toIso(d.createdAt)
  };
}

// ---- rate limiting --------------------------------------------------
// Counters live in lookupLimits/{id}; one per hour per IP and per phone /
// ticket. A bucket id changes every hour so old buckets simply stop being
// read (they carry expireAt so a Firestore TTL policy can clear them).
const LIMITS = { ip: 60, phone: 25, ticket: 25 };

function hourBucket(nowMs) {
  return Math.floor(nowMs / 3600000);
}

// ipHash: any stable short string for the caller's IP.
function limitKeys(ipHash, phone, ticket, nowMs) {
  const b = hourBucket(nowMs);
  const keys = [{ id: `ip_${ipHash}_${b}`, max: LIMITS.ip }];
  if (phone) keys.push({ id: `ph_${phone}_${b}`, max: LIMITS.phone });
  if (ticket) keys.push({ id: `tk_${ticket.replace(/[^A-Za-z0-9-]/g, '')}_${b}`, max: LIMITS.ticket });
  return keys;
}

// counts: {id: currentCount}. Returns {ok:true} or {ok:false, id}.
function checkLimits(keys, counts) {
  for (const k of keys) {
    if ((counts[k.id] || 0) >= k.max) return { ok: false, id: k.id };
  }
  return { ok: true };
}

// ---- customer profile -----------------------------------------------
// The portal profile is always written by the ensureCustomerProfile
// function from a VERIFIED phone number in the sign-in token. Returns the
// fields to store, or {error}.
function buildCustomerProfile(token, name, existing) {
  const phone10 = phoneFromToken(token && token.phone_number);
  if (!phone10) return { error: 'phone-not-verified' };
  if (existing && existing.role && existing.role !== 'customer') return { error: 'not-a-customer' };
  const cleanName = typeof name === 'string' ? name.trim().slice(0, 100) : '';
  const out = { role: 'customer', phone10 };
  if (cleanName) out.name = cleanName;
  else if (!existing || !existing.name) out.name = '';
  if (token && typeof token.email === 'string') out.email = token.email.slice(0, 200);
  return { profile: out };
}

module.exports = {
  normalizePhone, phoneFromToken, cleanTicketId, maskSerial, shapeRegistration,
  shapeTicket, toIso, hourBucket, limitKeys, checkLimits, buildCustomerProfile, LIMITS
};
