// Pushpak CRM — live updates and pop-up details (all roles).
// While a dashboard is open, watches the records that role works with. When a
// new ticket, product registration, warranty claim, enquiry, spare request or
// notification arrives (or the status of one of your tickets changes) it
// shows a pop-up alert, updates the bell, refreshes the screen you are on when
// that is safe, and "View" opens the record's details in a pop-up window.
// Read-only: it never writes data. Uses the same Firebase app the page already
// started, so there is no second sign-in or connection set-up.
import { getFirestore, collection, query, where, orderBy, limit, onSnapshot }
  from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const NICE = {
  new: 'New', assigned: 'Assigned', assigned_to_center: 'Sent to service center', accepted: 'Accepted', on_the_way: 'Technician on the way',
  at_customer: 'Technician at customer', in_progress: 'In progress', waiting_spare: 'Waiting for spare', completed: 'Completed', closed: 'Closed',
  cancelled: 'Cancelled', reopened: 'Re-opened', verification: 'Awaiting verification', reassignment_required: 'Needs re-assignment',
  submitted: 'Submitted', approved: 'Approved', rejected: 'Rejected', paid: 'Paid', pending: 'Pending'
};
const nice = (s) => NICE[s] || String(s || '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

// What each role watches. `order` = newest-first with a small limit (needs no
// composite index); otherwise the query is scoped by one field, exactly as the
// role's own screens already query it.
function watchesFor(role, uid) {
  const mine = (coll, field, kind, extra) => Object.assign({ coll, where: [field, '==', uid], kind }, extra || {});
  const all = (coll, kind, extra) => Object.assign({ coll, order: true, kind }, extra || {});
  const W = {
    superadmin: [all('publicServiceRequests', 'ticket'), all('productRegistrations', 'registration'), all('claims', 'claim'), all('contactEnquiries', 'enquiry')],
    warehouse: [all('spareRequests', 'spare'), all('claims', 'claim'), all('returns', 'return')],
    servicecenter: [mine('centerRequests', 'serviceCenterUid', 'ticket', { modified: true })],
    technician: [mine('serviceJobs', 'technicianUid', 'ticket', { modified: true }), mine('centerRequests', 'technicianUid', 'ticket', { modified: true })],
    dealer: [mine('productRegistrations', 'dealerUid', 'registration'), mine('dealerOrders', 'dealerUid', 'order', { modified: true }), mine('dealerEnquiries', 'dealerUid', 'enquiry')],
    distributor: [mine('distributorProductRegistrations', 'distributorUid', 'registration'), mine('distributorOrders', 'distributorUid', 'order', { modified: true }), mine('dealerOrders', 'distributorUid', 'order'), mine('distributorEnquiries', 'distributorUid', 'enquiry')],
    areamanager: []
  };
  const list = (W[role] || []).slice();
  // Server-sent notices (claim paid, spare decided, escalations ...) for everyone.
  list.push({ coll: 'notifications', where: ['recipientType', '==', 'uid'], where2: ['recipientValue', '==', uid], kind: 'notice' });
  if (role === 'superadmin' || role === 'warehouse') list.push({ coll: 'notifications', where: ['recipientType', '==', 'role'], where2: ['recipientValue', '==', role], kind: 'notice' });
  return list;
}

const KIND = {
  ticket: { icon: 'wrench', noun: 'service ticket', nav: [/^service$/i, /service request|center requests|my jobs/i], doc: 'voucher' },
  registration: { icon: 'shield', noun: 'product registration', nav: [/serial & registration/i, /product registration|registration/i], doc: 'warranty' },
  claim: { icon: 'wallet', noun: 'claim', nav: [/claims verification|claim processing/i, /claim/i], doc: 'claim' },
  enquiry: { icon: 'mail', noun: 'enquiry', nav: [/enquir/i] },
  spare: { icon: 'box', noun: 'spare request', nav: [/new requests/i, /spare/i] },
  return: { icon: 'box', noun: 'return', nav: [/return/i] },
  order: { icon: 'box', noun: 'order', nav: [/order/i] },
  notice: { icon: 'bell', noun: 'notification', nav: [] }
};
const ICON = {
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  wallet: '<rect x="2" y="6" width="20" height="14" rx="2"/><path d="M16 13h2M2 10h20"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  box: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/>',
  bell: '<path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7z"/><path d="M10 20a2 2 0 0 0 4 0"/>'
};

function titleFor(kind, d, isNew) {
  const id = d.requestId || d.jobId || d.registrationId || d.claimId || d.orderId || d.returnId || d.enquiryId || '';
  const who = d.customerName || d.name || d.claimantName || d.dealerName || '';
  const what = d.product || d.productName || d.category || d.partName || d.item || '';
  if (kind === 'notice') return { head: d.title || 'Notification', line: d.message || '' };
  if (!isNew) return { head: `${id} updated`, line: `Now: ${nice(d.status)}${who ? ' · ' + who : ''}` };
  const head = { ticket: 'New service ticket', registration: 'New product registration', claim: 'New claim', enquiry: 'New enquiry', spare: 'New spare request', return: 'New return', order: 'New order' }[kind];
  return { head: `${head}${id ? ' — ' + id : ''}`, line: [who, what].filter(Boolean).join(' · ') };
}

/* ---------------- UI: toasts ---------------- */
function toastHost() {
  let h = $('.ui-toasts');
  if (!h) {
    h = document.createElement('div');
    h.className = 'ui-toasts';
    h.setAttribute('role', 'region');
    h.setAttribute('aria-label', 'Live alerts');
    h.setAttribute('aria-live', 'polite');
    document.body.appendChild(h);
  }
  return h;
}
function toast(kind, head, line, onView) {
  const host = toastHost();
  while (host.children.length >= 4) host.firstChild.remove();
  const t = document.createElement('div');
  t.className = 'ui-toast';
  t.setAttribute('role', 'status');
  const k = KIND[kind] || KIND.notice;
  t.innerHTML = `<span class="ui-toast-ic"><svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k.icon] || ICON.bell}</svg></span>` +
    `<div class="ui-toast-tx"><b>${esc(head)}</b><span>${esc(line)}</span></div>` +
    `<div class="ui-toast-ac">${onView ? '<button type="button" class="ui-toast-view">View</button>' : ''}<button type="button" class="ui-toast-x" aria-label="Dismiss">&times;</button></div>`;
  let timer;
  const close = () => { clearTimeout(timer); t.classList.add('out'); setTimeout(() => t.remove(), 220); };
  const arm = () => { clearTimeout(timer); timer = setTimeout(close, 9000); };
  t.addEventListener('mouseenter', () => clearTimeout(timer));
  t.addEventListener('mouseleave', arm);
  t.addEventListener('focusin', () => clearTimeout(timer));
  $('.ui-toast-x', t).addEventListener('click', close);
  if (onView) $('.ui-toast-view', t).addEventListener('click', () => { close(); onView(); });
  host.appendChild(t);
  arm();
}

/* ---------------- UI: details pop-up ---------------- */
const SKIP = /^(id|uid|.*Uid|.*Ids|createdBy.*|.*Token|serialCheck|claimCheck|lock|history|_.*|opId|statusLog)$/;
const LABEL = { requestId: 'Request no.', jobId: 'Job no.', registrationId: 'Registration no.', claimId: 'Claim no.', customerName: 'Customer', customerPhone: 'Phone', serialNumber: 'Serial no.', modelNo: 'Model', pincode: 'Pincode', warrantyMonths: 'Warranty (months)', purchaseDate: 'Purchase date', serviceCenterName: 'Service center', technicianName: 'Technician', warrantyStatus: 'Warranty', issue: 'Problem', dealerName: 'Dealer' };
const FIRST = ['requestId', 'jobId', 'registrationId', 'claimId', 'status', 'customerName', 'name', 'customerPhone', 'phone', 'product', 'productName', 'category', 'brand', 'modelNo', 'serialNumber', 'issue', 'description', 'message', 'warrantyStatus', 'warrantyMonths', 'purchaseDate', 'serviceCenterName', 'technicianName', 'address', 'city', 'pincode', 'amount', 'approvedAmount', 'scheduledDate', 'createdAt'];
const labelOf = (k) => LABEL[k] || k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
function show(v) {
  if (v && typeof v.toDate === 'function') return v.toDate().toLocaleString();
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.every((x) => typeof x !== 'object') ? v.join(', ') : '';
  if (v && typeof v === 'object') return '';
  return String(v);
}
function findNav(role, kind) {
  const items = $$('.sidebar .nav-item');
  for (const re of (KIND[kind] || KIND.notice).nav) { const m = items.find((n) => re.test(n.textContent.trim())); if (m) return m; }
  return null;
}
export function openDetails(kind, d, role) {
  $('.ui-live-dialog')?.remove();
  const k = KIND[kind] || KIND.notice;
  const ov = document.createElement('div');
  ov.className = 'modal-overlay show ui-dialog ui-live-dialog';
  const m = document.createElement('div');
  m.className = 'modal modal-wide';
  m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-labelledby', 'ui-live-h');
  const t = titleFor(kind, d, true);
  const keys = Object.keys(d).filter((x) => !SKIP.test(x) && show(d[x]) !== '');
  keys.sort((a, b) => { const ia = FIRST.indexOf(a), ib = FIRST.indexOf(b); return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.localeCompare(b); });
  const rows = keys.slice(0, 40).map((x) => `<div class="ui-kv-k">${esc(labelOf(x))}</div><div class="ui-kv-v">${x === 'status' ? `<span class="status-pill ${esc(d[x])}">${esc(nice(d[x]))}</span>` : esc(show(d[x]))}</div>`).join('');
  m.innerHTML = `<h3 id="ui-live-h">${esc(t.head)}</h3><div class="ui-kv">${rows || '<div class="ui-kv-v">No details on file.</div>'}</div><div class="ui-live-doc"></div><div class="modal-actions"><button type="button" class="btn-secondary ui-live-close">Close</button></div>`;
  ov.appendChild(m);
  document.body.appendChild(ov);
  const nav = findNav(role, kind);
  const acts = $('.modal-actions', m);
  if (nav) {
    const go = document.createElement('button'); go.type = 'button'; go.className = 'btn-primary'; go.textContent = 'Open in ' + nav.textContent.replace(/soon$/i, '').trim();
    go.addEventListener('click', () => { ov.remove(); nav.click(); });
    acts.appendChild(go);
  }
  if (k.doc && window.PEDocs && ['ticket', 'registration', 'claim'].includes(kind)) {
    try { window.PEDocs.attach($('.ui-live-doc', m), k.doc, d); } catch (e) { /* printing is optional */ }
  }
  const close = () => { ov.remove(); };
  $('.ui-live-close', m).addEventListener('click', close);
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
  ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  $('.ui-live-close', m).focus();
}

/* ---------------- refresh the screen when it is safe ---------------- */
let refreshTimer;
function refreshSoon() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    const typing = /^(input|textarea|select)$/i.test((document.activeElement || {}).tagName || '');
    if (typing || $('.modal-overlay.show') || document.hidden) return;
    const active = $('.sidebar .nav-item.active') || $('.sidebar .nav-item');
    if (active) active.click();
  }, 1500);
}
function bumpBell() {
  const b = $('#notif-badge');
  if (!b) return;
  const n = (parseInt(b.textContent, 10) || 0) + 1;
  b.textContent = n > 9 ? '9+' : String(n);
  b.style.display = 'block';
}

/* ---------------- watching ---------------- */
let started = false;
function start() {
  const id = window.PE_IDENTITY;
  if (started || !id || !id.uid || !id.role) return;
  started = true;
  const role = String(id.role).toLowerCase().replace(/[^a-z]/g, '');
  let db;
  try { db = getFirestore(); } catch (e) { return; }
  const seen = new Map();
  watchesFor(role, id.uid).forEach((w) => {
    const cons = [];
    if (w.where) cons.push(where(...w.where));
    if (w.where2) cons.push(where(...w.where2));
    if (w.order) cons.push(orderBy('createdAt', 'desc'), limit(15));
    let first = true;
    const status = new Map();
    try {
      onSnapshot(query(collection(db, w.coll), ...cons), (snap) => {
        let fresh = false;
        const changes = typeof snap.docChanges === 'function' ? snap.docChanges() : [];
        changes.forEach((c) => {
          const d = Object.assign({ id: c.doc.id }, c.doc.data());
          if (first) { status.set(c.doc.id, d.status); return; }
          if (c.doc.metadata && c.doc.metadata.hasPendingWrites) { status.set(c.doc.id, d.status); return; } // your own change
          const key = w.coll + '/' + c.doc.id + '/' + c.type + '/' + (d.status || '');
          if (seen.has(key)) return;
          seen.set(key, 1);
          if (c.type === 'added') {
            if (w.kind === 'notice' && d.read) return;
            const t = titleFor(w.kind, d, true);
            toast(w.kind, t.head, t.line, w.kind === 'notice' ? null : () => openDetails(w.kind, d, role));
            if (w.kind === 'notice') bumpBell();
            status.set(c.doc.id, d.status);
            fresh = true;
          } else if (c.type === 'modified' && w.modified && status.get(c.doc.id) !== d.status) {
            status.set(c.doc.id, d.status);
            const t = titleFor(w.kind, d, false);
            toast(w.kind, t.head, t.line, () => openDetails(w.kind, d, role));
            fresh = true;
          }
        });
        first = false;
        if (fresh) refreshSoon();
      }, () => { /* no access or offline: stay quiet, the screens still work */ });
    } catch (e) { /* ignore */ }
  });
  window.__peLiveStarted = true;
}

window.addEventListener('pe-identity', start);
if (window.PE_IDENTITY) start();
window.PE_LIVE = { openDetails, toast };
