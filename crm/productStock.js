// Finished-goods stock screens: stock levels and receiving (Warehouse /
// Super Admin), serial lookup, and a distributor's own stock. Stock levels
// and serial records are written only by the Cloud Functions; receiving
// files a stockReceipts document that processStockReceipt checks and books.
import {
  collection, doc, getDoc, getDocs, query, where, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { loadCatalog } from './tradeOrders.js';

function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const panel = (title, inner) => `<div class="panel" style="margin-bottom:16px;"><div class="panel-header"><h2>${title}</h2></div><div class="panel-body">${inner}</div></div>`;
const when = (ts) => (ts && ts.toDate ? ts.toDate().toLocaleString('en-IN') : '—');
const parseSerials = (t) => String(t || '').split(/[\s,;]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);
const SERIAL_RE = /^[A-Z0-9][A-Z0-9-]{3,39}$/;

async function stockAt(db, location) {
  const snap = await getDocs(query(collection(db, 'productStock'), where('location', '==', location)));
  const out = {};
  snap.forEach((d) => { const x = d.data(); out[x.modelId] = { onHand: x.onHand || 0, reserved: x.reserved || 0 }; });
  return out;
}

function stockTable(catalog, stock, { showZero }) {
  const rows = catalog.map((c) => ({ c, s: stock[c.modelId] || { onHand: 0, reserved: 0 } }))
    .filter((r) => showZero || r.s.onHand || r.s.reserved);
  if (!rows.length) return '<div class="empty-row">No stock yet.</div>';
  return `<table style="width:100%;font-size:13px;"><thead><tr><th>Product — Model</th><th style="text-align:right;">On hand</th><th style="text-align:right;">Reserved for orders</th><th style="text-align:right;">Available</th></tr></thead><tbody>
    ${rows.map(({ c, s }) => `<tr><td>${esc(c.label)}${c.status !== 'active' ? ' <span style="color:var(--stone);font-size:11.5px;">(inactive)</span>' : ''}</td>
      <td style="text-align:right;">${s.onHand}</td><td style="text-align:right;">${s.reserved}</td>
      <td style="text-align:right;${s.onHand - s.reserved <= 0 ? 'color:var(--err);font-weight:600;' : ''}">${s.onHand - s.reserved}</td></tr>`).join('')}</tbody></table>`;
}

// -----------------------------------------------------------------
// Head Office stock + receiving (Warehouse / Super Admin).
// -----------------------------------------------------------------
export async function renderWarehouseStock(el, opts) {
  const { db, user } = opts;
  el.innerHTML = panel('Finished goods — Head Office warehouse', 'Loading…');
  try {
    const [catalog, stock, recSnap, brSnap] = await Promise.all([
      loadCatalog(db, { includeInactive: true, refresh: true }), stockAt(db, 'warehouse'), getDocs(collection(db, 'stockReceipts')),
      getDocs(query(collection(db, 'brandReturns'), where('status', '==', 'sent'))).catch(() => null)
    ]);
    const brOptions = [];
    if (brSnap) brSnap.forEach((d) => { const b = d.data(); brOptions.push(`<option value="${esc(d.id)}">${esc(b.brand)} — sent ${esc(b.sentOn || '')} (${(b.unitSerials || []).length} units)</option>`); });
    const receipts = [];
    recSnap.forEach((d) => receipts.push({ id: d.id, ...d.data() }));
    receipts.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    const today = new Date().toISOString().slice(0, 10);
    el.innerHTML = panel('Receive stock (GRN)', `
        <div class="form-row"><label>Product — Model</label><select id="ps-model"><option value="">Select…</option>${catalog.map((c) => `<option value="${esc(c.modelId)}">${esc(c.label)}</option>`).join('')}</select></div>
        <div class="form-row"><label>Serial numbers (one per unit)</label><textarea id="ps-serials" rows="6" placeholder="Scan or type one serial per line"></textarea></div>
        <div id="ps-count" style="font-size:12px;color:var(--stone);margin:-4px 0 8px;">0 units</div>
        <div class="form-row"><label>Supplier</label><input type="text" id="ps-supplier" maxlength="100"></div>
        <div class="form-row"><label>Supplier invoice / ref</label><input type="text" id="ps-ref" maxlength="60"></div>
        <div class="form-row"><label>Received on</label><input type="date" id="ps-date" value="${today}" max="${today}"></div>
        ${brOptions.length ? `<div class="form-row"><label>Replacements from a brand return? (optional)</label><select id="ps-br"><option value="">No</option>${brOptions.join('')}</select></div>` : ''}
        <div class="form-row"><label>Notes</label><input type="text" id="ps-notes" maxlength="300"></div>
        <div style="font-size:12px;color:var(--stone);margin-bottom:8px;">Up to 400 units per receipt. If any serial was already received before, the whole receipt is refused so nothing is double-counted.</div>
        <div class="modal-error" id="ps-err"></div><div id="ps-ok" style="color:#1E7B34;font-weight:600;margin:6px 0;"></div>
        <button type="button" class="btn-primary" id="ps-save">Receive</button>`)
      + panel('Stock', stockTable(catalog, stock, { showZero: false }))
      + panel('Recent receipts', receipts.length ? `<table style="width:100%;font-size:13px;"><thead><tr><th>When</th><th>Model</th><th style="text-align:right;">Units</th><th>Supplier / ref</th><th>Result</th></tr></thead><tbody>
          ${receipts.slice(0, 40).map((r) => `<tr><td>${esc(r.receivedOn || when(r.createdAt))}</td><td>${esc(r.modelLabel || r.modelId)}</td><td style="text-align:right;">${(r.serials || []).length}</td>
            <td>${esc(r.supplier)} ${esc(r.invoiceRef)}</td>
            <td>${r.status === 'accepted' ? '<span style="color:#1E7B34;font-weight:600;">Added to stock</span>' : r.status === 'rejected' ? `<span style="color:var(--err);">Refused: ${esc(r.reason)}</span>` : 'Processing…'}</td></tr>`).join('')}</tbody></table>` : '<div class="empty-row">No receipts yet.</div>');
    const ta = el.querySelector('#ps-serials');
    ta.addEventListener('input', () => { el.querySelector('#ps-count').textContent = `${parseSerials(ta.value).length} units`; });
    el.querySelector('#ps-save').addEventListener('click', async () => {
      const err = el.querySelector('#ps-err'); const ok = el.querySelector('#ps-ok');
      err.classList.remove('show'); ok.textContent = '';
      const modelId = el.querySelector('#ps-model').value;
      const serials = parseSerials(ta.value);
      const bad = serials.find((x) => !SERIAL_RE.test(x));
      const dup = serials.find((x, i) => serials.indexOf(x) !== i);
      let problem = !modelId ? 'Choose the product model.' : !serials.length ? 'Enter the serial numbers.' : serials.length > 400 ? 'At most 400 units per receipt.'
        : bad ? `"${bad}" is not a valid serial (letters, digits and dashes, 4–40 characters).` : dup ? `${dup} is entered twice.` : null;
      if (problem) { err.textContent = problem; err.classList.add('show'); return; }
      const label = (catalog.find((c) => c.modelId === modelId) || {}).label || modelId;
      if (!confirm(`Receive ${serials.length} unit(s) of ${label} into the warehouse?`)) return;
      const btn = el.querySelector('#ps-save'); btn.disabled = true;
      try {
        await addDoc(collection(db, 'stockReceipts'), {
          modelId, modelLabel: label, serials,
          supplier: el.querySelector('#ps-supplier').value.trim(), invoiceRef: el.querySelector('#ps-ref').value.trim(),
          receivedOn: el.querySelector('#ps-date').value, notes: el.querySelector('#ps-notes').value.trim(),
          ...(el.querySelector('#ps-br') && el.querySelector('#ps-br').value ? { brandReturnId: el.querySelector('#ps-br').value } : {}),
          createdByUid: user.uid, createdByEmail: user.email || '', createdAt: serverTimestamp()
        });
        ok.textContent = 'Sent — it will show in stock in a few seconds (waiting orders get it first).';
        setTimeout(() => renderWarehouseStock(el, opts), 3000);
      } catch (e) {
        console.error('Receive stock failed:', e);
        err.textContent = 'Could not save the receipt. Check console for details.'; err.classList.add('show');
        btn.disabled = false;
      }
    });
  } catch (err) {
    console.error('Load stock failed:', err);
    el.innerHTML = panel('Finished goods', `<div style="color:var(--err);">Couldn't load stock. Check console for details.</div>`);
  }
}

// -----------------------------------------------------------------
// Serial lookup: where a unit is, who it was sold to, its history.
// -----------------------------------------------------------------
export async function renderSerialLookup(el, { db }) {
  el.innerHTML = panel('Serial lookup', `<div class="form-row"><label>Serial number</label><input type="text" id="sl-serial" maxlength="40"></div>
    <button type="button" class="btn-primary" id="sl-go">Look up</button><div id="sl-out" style="margin-top:12px;"></div>`);
  const out = el.querySelector('#sl-out');
  const go = async () => {
    const serial = el.querySelector('#sl-serial').value.trim().toUpperCase();
    if (!serial) return;
    out.textContent = 'Looking up…';
    try {
      const snap = await getDoc(doc(db, 'unitSerials', serial));
      if (!snap.exists()) { out.innerHTML = `<div style="color:var(--err);">${esc(serial)} was never received into stock.</div>`; return; }
      const u = snap.data();
      const catalog = await loadCatalog(db, { includeInactive: true });
      const model = (catalog.find((c) => c.modelId === u.modelId) || {}).label || u.modelId;
      const STATUS = { in_stock: 'In stock', dispatched: 'In transit', delivered: 'Delivered' };
      const hist = (u.history || []).slice().sort((a, b) => (a.at?.seconds || 0) - (b.at?.seconds || 0));
      out.innerHTML = `<table style="font-size:13px;"><tbody>
        <tr><td style="color:var(--stone);padding-right:12px;">Serial</td><td><b>${esc(u.serial)}</b></td></tr>
        <tr><td style="color:var(--stone);">Model</td><td>${esc(model)}</td></tr>
        <tr><td style="color:var(--stone);">Status</td><td>${esc(STATUS[u.status] || u.status)}${u.location === 'warehouse' ? ' — Head Office warehouse' : String(u.location || '').startsWith('dist_') ? ' — at distributor' + (u.soldToType === 'distributor' && u.soldToName ? ' ' + esc(u.soldToName) : '') : String(u.location || '').startsWith('dealer_') ? ' — with dealer' : ''}</td></tr>
        <tr><td style="color:var(--stone);">Sold to</td><td>${esc(u.soldToName || '—')}${u.soldToType ? ' (' + esc(u.soldToType) + ')' : ''}</td></tr>
        <tr><td style="color:var(--stone);">Order / invoice</td><td>${esc(u.orderId || '—')} ${u.invoiceNo ? '· ' + esc(u.invoiceNo) : ''}</td></tr>
        <tr><td style="color:var(--stone);">Warranty registration</td><td>${esc(u.registrationId || 'not registered')}</td></tr>
        <tr><td style="color:var(--stone);">Received</td><td>${when(u.receivedAt)}${u.supplier ? ' from ' + esc(u.supplier) : ''}</td></tr></tbody></table>
        ${hist.length ? `<div style="font-size:12px;color:var(--stone);margin-top:8px;">${hist.map((h) => `${when(h.at)} — ${esc(h.event)}${h.orderId ? ' ' + esc(h.orderId) : ''}${h.registrationId ? ' ' + esc(h.registrationId) : ''}`).join('<br>')}</div>` : ''}`;
    } catch (err) {
      console.error('Serial lookup failed:', err);
      out.innerHTML = `<div style="color:var(--err);">Lookup failed.</div>`;
    }
  };
  el.querySelector('#sl-go').addEventListener('click', go);
  el.querySelector('#sl-serial').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
}

// -----------------------------------------------------------------
// A distributor's own stock (filled by Head Office deliveries).
// -----------------------------------------------------------------
export async function renderDistributorStock(el, { db, uid }) {
  el.innerHTML = panel('My stock', 'Loading…');
  try {
    const location = 'dist_' + uid;
    const [catalog, stock, unitSnap] = await Promise.all([
      loadCatalog(db, { includeInactive: true }), stockAt(db, location),
      getDocs(query(collection(db, 'unitSerials'), where('location', '==', location)))
    ]);
    const byModel = {};
    unitSnap.forEach((d) => { const u = d.data(); if (u.status === 'in_stock') (byModel[u.modelId] = byModel[u.modelId] || []).push(u.serial); });
    const label = (m) => (catalog.find((c) => c.modelId === m) || {}).label || m;
    el.innerHTML = panel('My stock', `<div style="font-size:12.5px;color:var(--stone);margin-bottom:8px;">Units delivered to you by Head Office are added here automatically; dispatching to your dealers (with serials) takes them out. Approved dealer orders reserve stock until dispatched.</div>
        ${stockTable(catalog, stock, { showZero: false })}`)
      + panel('Serial numbers in stock', Object.keys(byModel).length
        ? Object.entries(byModel).map(([m, list]) => `<details style="margin-bottom:6px;"><summary>${esc(label(m))} — ${list.length}</summary><div style="font-size:12px;">${list.sort().map(esc).join(', ')}</div></details>`).join('')
        : '<div class="empty-row">No units in stock.</div>');
  } catch (err) {
    console.error('Load my stock failed:', err);
    el.innerHTML = panel('My stock', `<div style="color:var(--err);">Couldn't load your stock.</div>`);
  }
}
