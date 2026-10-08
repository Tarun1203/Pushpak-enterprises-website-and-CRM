'use strict';
// Pure helpers for the customer portal: product registration, service
// booking and the customer-facing tracking record. Nothing here touches
// Firestore, so it is unit tested directly. The callables in index.js
// use these and always take the phone number and ownership from the
// signed-in token, never from the request body.

const { SERIAL_RE, normalizeSerial } = require('./stock');

const BRANDS = { MakWell: 'makwell', Flyvision: 'flyvision', Skevia: 'skevia' };
const PINCODE_RE = /^[1-9][0-9]{5}$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const IST_OFFSET_MS = 330 * 60000;

// Today in India, as {ymd:'20261007', ym:'202610', iso:'2026-10-07'}.
function istDate(nowMs) {
  const d = new Date(nowMs + IST_OFFSET_MS);
  const y = d.getUTCFullYear(), m = String(d.getUTCMonth() + 1).padStart(2, '0'), day = String(d.getUTCDate()).padStart(2, '0');
  return { ymd: `${y}${m}${day}`, ym: `${y}${m}`, iso: `${y}-${m}-${day}`, dayBucket: Math.floor((nowMs + IST_OFFSET_MS) / 86400000) };
}

function s(v, max) { return typeof v === 'string' ? v.trim().slice(0, max) : ''; }

function validIsoDate(str) {
  const m = DATE_RE.exec(str || '');
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function contactFields(input, out) {
  out.customerName = s(input.name, 100);
  out.address = s(input.address, 300);
  out.city = s(input.city, 60);
  out.state = s(input.state, 60);
  out.pincode = s(input.pincode, 6);
  if (!out.customerName) return 'Enter your name.';
  if (!out.address) return 'Enter your address.';
  if (!out.city) return 'Enter your city.';
  if (!PINCODE_RE.test(out.pincode)) return 'Enter a valid 6-digit pincode.';
  return null;
}

// ---- Warranty from a plan ---------------------------------------------
// A warranty plan lists components (e.g. Full Product 2y, Heating Element
// 5y). The registration's overall cover (`warrantyMonths`, used for the
// intake read and for the closure decision when no part matches) is the
// plan's whole-product line. Without a plan, or a whole-product line, it is
// the standard 12 months. Part cover is kept separately, per component.
const DEFAULT_WARRANTY_MONTHS = 12;
const WHOLE_PRODUCT_RE = /^(full|whole|complete|entire|total)?\s*(product|unit|appliance|machine)$|^(full|whole|complete|entire|total)\b/i;

function overallWarrantyMonths(plan) {
  const comps = plan && Array.isArray(plan.components) ? plan.components : [];
  const whole = comps.find((c) => c && typeof c.componentName === 'string' && WHOLE_PRODUCT_RE.test(c.componentName.trim()));
  const years = whole ? Number(whole.durationYears) : NaN;
  if (!Number.isFinite(years) || years <= 0) return DEFAULT_WARRANTY_MONTHS;
  return Math.max(1, Math.min(120, Math.round(years * 12)));
}

// ---- Register Product ------------------------------------------------
function validateRegistration(input, nowMs) {
  const i = input || {};
  const out = {};
  const brand = s(i.brand, 30);
  if (!BRANDS[brand]) return { error: 'Choose a brand.' };
  out.brand = brand;
  out.brandId = BRANDS[brand];
  out.categoryId = s(i.categoryId, 80);
  out.category = s(i.category, 60);
  if (!out.categoryId || !out.category) return { error: 'Choose a product category.' };
  out.modelNo = s(i.modelNo, 60);
  if (!out.modelNo) return { error: 'Enter the model number.' };
  const serial = normalizeSerial(i.serialNumber);
  if (serial && !SERIAL_RE.test(serial)) return { error: 'That serial number does not look right. Use letters, digits and dashes only (4–40 characters).' };
  out.serialNumber = serial;
  const today = istDate(nowMs).iso;
  const pd = s(i.purchaseDate, 10);
  if (!validIsoDate(pd)) return { error: 'Enter the purchase date.' };
  if (pd > today) return { error: 'The purchase date cannot be in the future.' };
  const tenYearsAgo = `${+today.slice(0, 4) - 10}${today.slice(4)}`;
  if (pd < tenYearsAgo) return { error: 'That purchase date is too old to register.' };
  out.purchaseDate = pd;
  const contactErr = contactFields(i, out);
  if (contactErr) return { error: contactErr };
  out.dealerName = s(i.dealerName, 100);
  out.installationRequired = i.installationRequired === true;
  return { value: out };
}

// ---- Book Service ----------------------------------------------------
function validateBooking(input) {
  const i = input || {};
  const out = {};
  out.requestType = i.requestType === 'installation' ? 'installation' : 'service';
  out.registrationId = s(i.registrationId, 80);
  out.issueDescription = out.requestType === 'service' ? s(i.issueDescription, 1000) : '';
  if (out.requestType === 'service' && !out.issueDescription) return { error: 'Describe the problem.' };
  if (!out.registrationId) {
    const brand = s(i.brand, 30);
    if (!BRANDS[brand]) return { error: 'Choose a brand, or pick one of your registered products.' };
    out.brand = brand;
    out.category = s(i.category, 60);
    if (!out.category) return { error: 'Choose a product category.' };
    out.modelNo = s(i.modelNo, 60);
    const serial = normalizeSerial(i.serialNumber);
    if (serial && !SERIAL_RE.test(serial)) return { error: 'That serial number does not look right.' };
    out.serialNumber = serial;
    out.purchaseDate = validIsoDate(s(i.purchaseDate, 10)) ? s(i.purchaseDate, 10) : '';
  }
  const contactErr = contactFields(i, out);
  if (contactErr) return { error: contactErr };
  return { value: out };
}

// ---- customer-facing tracking record ----------------------------------
// Built (on the server) from the real ticket whenever it changes. It holds
// only what the customer should see, plus a status history that the
// browser can never write.
function ticketIdOf(d) { return String((d && (d.requestId || d.jobId || d.ticketId)) || ''); }

// prev: existing tracking doc data or null; src: the ticket's data;
// at: a timestamp for a new history entry. Returns {id, data} or null
// if the ticket has no id / no phone to attach it to.
function buildTrack(prev, src, at) {
  const id = ticketIdOf(src);
  const phone = src && src.customerPhone;
  if (!id || !phone || !/^[A-Za-z0-9][A-Za-z0-9-]{3,79}$/.test(id)) return null;
  const status = String(src.status || 'new').slice(0, 40);
  const history = Array.isArray(prev && prev.history) ? prev.history.slice(-40) : [];
  if (!history.length || history[history.length - 1].status !== status) history.push({ status, at });
  const hasSlot = src.scheduledDate;
  const data = {
    ticketId: id,
    customerPhone: String(phone),
    requestType: (src.type === 'installation' || src.requestType === 'installation') ? 'installation' : 'service',
    category: String(src.category || '').slice(0, 60),
    brand: String(src.brand || '').slice(0, 60),
    product: String(src.product || '').slice(0, 160),
    status,
    warrantyStatus: String(src.warrantyStatus || '').slice(0, 30),
    technicianName: src.technicianName ? String(src.technicianName).slice(0, 100) : '',
    serviceCenterName: src.serviceCenterName ? String(src.serviceCenterName).slice(0, 100) : '',
    appointment: hasSlot ? {
      date: String(src.scheduledDate).slice(0, 10),
      start: String(src.scheduledStartTime || '').slice(0, 5),
      end: String(src.scheduledEndTime || '').slice(0, 5)
    } : null,
    history,
    // For the customer's service history: which product this was, what
    // was done, and what the customer paid (only when they paid — a
    // warranty job's billingTotal is the company's claim, not their bill).
    serialNumber: String(src.serialNumber || '').slice(0, 40),
    linkedRegistrationId: String(src.linkedRegistrationId || '').slice(0, 80),
    actionTaken: src.actionTaken ? String(src.actionTaken).slice(0, 300) : '',
    customerCharge: src.billingType === 'customer' && Number.isFinite(Number(src.billingTotal)) ? Number(src.billingTotal) : null
  };
  if (src.customerUid) data.customerUid = String(src.customerUid);
  return { id, data };
}

// ---- Support tickets ---------------------------------------------------
const SUPPORT_CATEGORIES = ['Product question', 'Service complaint', 'Warranty', 'Billing', 'Other'];
const MAX_MESSAGES = 100;

function validateSupportCreate(input) {
  const i = input || {};
  const category = SUPPORT_CATEGORIES.includes(i.category) ? i.category : null;
  if (!category) return { error: 'Choose what this is about.' };
  const subject = s(i.subject, 120);
  if (!subject) return { error: 'Add a short subject.' };
  const text = s(i.message, 2000);
  if (!text) return { error: 'Write your message.' };
  const relatedTicketId = s(i.relatedTicketId, 80);
  if (relatedTicketId && !/^[A-Za-z0-9][A-Za-z0-9-]{3,79}$/.test(relatedTicketId)) return { error: 'Invalid related request.' };
  return { value: { category, subject, text, relatedTicketId } };
}

// actor: 'customer' | 'staff'; action: 'reply' | 'close' | 'reopen'.
// Returns {error} or {update} (status/messages/lastFrom) for the ticket.
function applySupportAction(ticket, action, actor, text, name, at) {
  if (!ticket) return { error: 'Ticket not found.' };
  const msgs = Array.isArray(ticket.messages) ? ticket.messages.slice() : [];
  if (action === 'reply') {
    const body = s(text, 2000);
    if (!body) return { error: 'Write your message.' };
    if (msgs.length >= MAX_MESSAGES) return { error: 'This conversation is too long. Please open a new ticket.' };
    if (ticket.status === 'closed' && actor === 'staff') return { error: 'Reopen the ticket before replying.' };
    msgs.push({ from: actor, name: s(name, 100), text: body, at });
    return { update: { messages: msgs, status: actor === 'staff' ? 'awaiting_customer' : 'open', lastFrom: actor } };
  }
  if (action === 'close') {
    if (ticket.status === 'closed') return { error: 'Already closed.' };
    msgs.push({ from: 'system', name: '', text: actor === 'staff' ? 'Closed by support.' : 'Closed by customer.', at });
    return { update: { messages: msgs, status: 'closed', lastFrom: actor } };
  }
  if (action === 'reopen') {
    if (ticket.status !== 'closed') return { error: 'This ticket is not closed.' };
    msgs.push({ from: 'system', name: '', text: 'Reopened.', at });
    return { update: { messages: msgs, status: 'open', lastFrom: actor } };
  }
  return { error: 'Unknown action.' };
}

module.exports = {
  BRANDS, DEFAULT_WARRANTY_MONTHS, overallWarrantyMonths, istDate, validIsoDate, validateRegistration, validateBooking, buildTrack, ticketIdOf,
  SUPPORT_CATEGORIES, validateSupportCreate, applySupportAction
};
