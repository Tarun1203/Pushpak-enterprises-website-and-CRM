// RMA & Replacement and Brand Returns screens (Warehouse, Super Admin).
// Dispatching a replacement, receiving the defective unit and booking a
// brand return are done by Cloud Functions (rmaUpdated,
// processBrandReturn); these screens raise, approve and ask for them.
import {
  collection, doc, getDoc, getDocs, query, where, addDoc, updateDoc, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { loadCatalog } from './tradeOrders.js';

function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const panel = (title, inner, id) => `<div class="panel" style="margin-bottom:16px;"${id ? ` id="${id}"` : ''}><div class="panel-header"><h2>${title}</h2></div><div class="panel-body">${inner}</div></div>`;
const when = (ts) => (ts && ts.toDate ? ts.toDate().toLocaleDateString('en-IN') : '—');
const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const RMA_STATUS_LABELS = {
  requested: 'Requested', approved: 'Approved', replacement_dispatched: 'Replacement sent', defective_received: 'Defective unit received',
  sent_to_brand: 'Sent to brand', rejected: 'Rejected',
  // older RMAs
  inspecting: 'Inspecting', replaced: 'Replaced'
};
const TABS = [
  { key: 'requested', label: 'To approve', match: (s) => s === 'requested' },
  { key: 'approved', label: 'To dispatch', match: (s) => s === 'approved' },
  { key: 'replacement_dispatched', label: 'Awaiting defective unit', match: (s) => s === 'replacement_dispatched' },
  { key: 'done', label: 'Done', match: (s) => ['defective_received', 'sent_to_brand', 'rejected', 'replaced', 'inspecting'].includes(s) }
];

async function rmaId(db) {
  const d = new Date();
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const ref = doc(db, 'counters', `rma-${ym}`);
  const n = await runTransaction(db, async (t) => {
    const s = await t.get(ref);
    const next = (s.exists() ? s.data().value : 0) + 1;
    if (s.exists()) t.update(ref, { value: next }); else t.set(ref, { value: next });
    return next;
  });
  return `PE-RMA-${ym}${String(d.getDate()).padStart(2, '0')}-${String(n).padStart(4, '0')}`;
}

async function findTicket(db, ticketId) {
  for (const [coll, field] of [['centerRequests', 'requestId'], ['serviceJobs', 'jobId']]) {
    const snap = await getDocs(query(collection(db, coll), where(field, '==', ticketId)));
    if (!snap.empty) return { coll, id: snap.docs[0].id, ...snap.docs[0].data() };
  }
  return null;
}

// -----------------------------------------------------------------
// RMA list with actions. opts: { db, user, allowRaise }
// -----------------------------------------------------------------
export async function renderRmaList(el, opts) {
  const { db, user } = opts;
  const tab = opts.tab || 'requested';
  el.innerHTML = (opts.allowRaise ? panel('Raise an RMA', `
      <div style="font-size:12.5px;color:var(--stone);margin-bottom:8px;">For a customer's unit that can't be repaired: replace it from Head Office stock. Always against a real service ticket.</div>
      <div class="form-row"><label>Service ticket ID</label><input type="text" id="rma-ticket" placeholder="PE-CR-… or PE-JOB-…"></div>
      <div class="form-row"><label>Reason</label><input type="text" id="rma-reason" maxlength="300"></div>
      <div class="modal-error" id="rma-raise-err"></div><div id="rma-raise-ok" style="color:#1E7B34;font-weight:600;margin:6px 0;"></div>
      <button type="button" class="btn-primary" id="rma-raise">Raise RMA</button>`) : '')
    + panel('RMA & Replacement', `<div id="rma-tabs" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">${TABS.map((t) =>
        `<button type="button" class="btn-secondary" data-tab="${t.key}" style="${t.key === tab ? 'background:var(--blue);color:#fff;border-color:var(--blue);' : ''}">${t.label}</button>`).join('')}</div>
      <div id="rma-body">Loading…</div>`);
  el.querySelectorAll('#rma-tabs button').forEach((b) => b.addEventListener('click', () => renderRmaList(el, { ...opts, tab: b.dataset.tab })));
  if (opts.allowRaise) {
    el.querySelector('#rma-raise').addEventListener('click', async () => {
      const err = el.querySelector('#rma-raise-err'); const ok = el.querySelector('#rma-raise-ok');
      err.classList.remove('show'); ok.textContent = '';
      const ticketId = el.querySelector('#rma-ticket').value.trim();
      const reason = el.querySelector('#rma-reason').value.trim();
      if (!ticketId || reason.length < 3) { err.textContent = 'Enter the ticket ID and a reason.'; err.classList.add('show'); return; }
      try {
        const t = await findTicket(db, ticketId);
        if (!t) { err.textContent = 'No service ticket with that ID.'; err.classList.add('show'); return; }
        const id = await rmaId(db);
        await addDoc(collection(db, 'rmaRequests'), {
          rmaId: id, customerName: t.customerName || '', customerPhone: t.customerPhone || '',
          modelNo: t.modelNo || t.product || '', product: `${t.product || t.brand || ''} ${t.category || ''}`.trim(),
          serialNumber: t.serialNumber || t.serialNo || '', reason, sourceJobId: t.id, sourceJobCollection: t.coll, sourceTicketId: ticketId,
          raisedByUid: user.uid, raisedByEmail: user.email || '', status: 'requested', createdAt: serverTimestamp(), updatedAt: serverTimestamp()
        });
        ok.textContent = `Raised — ${id}`;
        setTimeout(() => renderRmaList(el, { ...opts, tab: 'requested' }), 800);
      } catch (e) {
        console.error('Raise RMA failed:', e);
        err.textContent = 'Could not raise the RMA. Check console for details.'; err.classList.add('show');
      }
    });
  }
  const body = el.querySelector('#rma-body');
  try {
    const [snap, catalog] = await Promise.all([getDocs(collection(db, 'rmaRequests')), loadCatalog(db, { includeInactive: true })]);
    const t = TABS.find((x) => x.key === tab);
    const list = [];
    snap.forEach((d) => { const x = d.data(); if (t.match(x.status)) list.push({ id: d.id, ...x }); });
    list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    if (!list.length) { body.innerHTML = '<div class="empty-row">Nothing here.</div>'; return; }
    const modelLabel = (id) => (catalog.find((c) => c.modelId === id) || {}).label || id;
    const guess = (r) => {
      const m = String(r.modelNo || '').trim().toLowerCase();
      const hit = m && catalog.find((c) => c.label.toLowerCase().includes(m));
      return hit ? hit.modelId : '';
    };
    body.innerHTML = list.map((r, i) => `<div style="border:1px solid var(--hairline, #e3e3e3);border-radius:8px;padding:12px;margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;"><div><b>${esc(r.rmaId || r.id)}</b> · ${when(r.createdAt)} · Ticket ${esc(r.sourceTicketId || '—')}</div><div><b>${esc(RMA_STATUS_LABELS[r.status] || r.status)}</b></div></div>
      <div style="font-size:13px;margin-top:6px;">${esc(r.customerName || '—')} ${r.customerPhone ? '· ' + esc(r.customerPhone) : ''} · ${esc(r.product || r.modelNo || '—')} · Defective serial: <b>${esc(r.serialNumber || 'not recorded')}</b></div>
      <div style="font-size:12.5px;color:var(--stone);margin-top:4px;">Reason: ${esc(r.reason || '—')}${r.modelId ? ' · Model: ' + esc(r.modelLabel || modelLabel(r.modelId)) : ''}</div>
      ${r.replacementSerial ? `<div style="font-size:12.5px;margin-top:4px;">Replacement serial: <b>${esc(r.replacementSerial)}</b>${r.dispatch ? ' · ' + esc(r.dispatch.transporter) + (r.dispatch.docket ? ' / ' + esc(r.dispatch.docket) : '') : ''}${r.warrantyCarried ? ` · warranty from ${esc(r.warrantyCarried.purchaseDate)} for ${esc(r.warrantyCarried.warrantyMonths)} months` : ' · <span style="color:var(--err);">no registration found for the original unit — warranty not carried over</span>'}</div>` : ''}
      ${r.rejectReason ? `<div style="font-size:12.5px;color:var(--err);margin-top:4px;">Rejected: ${esc(r.rejectReason)}</div>` : ''}
      ${r.status === 'approved' && r.rmaRejected ? `<div style="font-size:12.5px;color:var(--err);margin-top:4px;"><b>Dispatch refused:</b> ${esc(r.rmaRejected.reason)}</div>` : ''}
      <div class="rma-act" data-i="${i}" style="margin-top:10px;"></div></div>`).join('');
    body.querySelectorAll('.rma-act').forEach((box) => {
      const r = list[Number(box.dataset.i)];
      const ref = doc(db, 'rmaRequests', r.id);
      const reject = async () => {
        const reason = prompt('Reason for rejecting this RMA:', '');
        if (reason === null || reason.trim().length < 3) return;
        await updateDoc(ref, { status: 'rejected', rejectReason: reason.trim().slice(0, 300), rejectedByUid: user.uid, updatedAt: serverTimestamp() });
        renderRmaList(el, opts);
      };
      if (r.status === 'requested') {
        const g = guess(r);
        box.innerHTML = `<div class="form-row"><label>Product model (for the replacement)</label><select class="rma-model"><option value="">Select…</option>${catalog.map((c) => `<option value="${esc(c.modelId)}" ${c.modelId === g ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select></div>
          <button type="button" class="btn-primary rma-approve">Approve</button> <button type="button" class="btn-secondary rma-reject">Reject</button>`;
        box.querySelector('.rma-approve').addEventListener('click', async () => {
          const modelId = box.querySelector('.rma-model').value;
          if (!modelId) { alert('Choose the product model first.'); return; }
          try {
            await updateDoc(ref, { status: 'approved', modelId, modelLabel: modelLabel(modelId), approvedByUid: user.uid, approvedByEmail: user.email || '', approvedAt: serverTimestamp(), updatedAt: serverTimestamp() });
            renderRmaList(el, { ...opts, tab: 'approved' });
          } catch (e) { console.error(e); alert('Could not approve. Check console for details.'); }
        });
        box.querySelector('.rma-reject').addEventListener('click', reject);
      } else if (r.status === 'approved') {
        box.innerHTML = `<div style="font-size:12.5px;color:var(--stone);" class="rma-stock">Checking stock…</div>
          <div class="form-row"><label>Replacement unit serial (from Head Office stock)</label><input type="text" class="rma-serial" maxlength="40"></div>
          <div class="form-row"><label>Transporter / courier</label><input type="text" class="rma-courier" maxlength="100"></div>
          <div class="form-row"><label>Docket no.</label><input type="text" class="rma-docket" maxlength="60"></div>
          <button type="button" class="btn-primary rma-dispatch">Dispatch replacement</button> <button type="button" class="btn-secondary rma-reject">Reject</button>`;
        getDoc(doc(db, 'productStock', `warehouse_${r.modelId}`)).then((s) => {
          const d = s.exists() ? s.data() : {};
          box.querySelector('.rma-stock').textContent = `In stock for this model: ${(d.onHand || 0) - (d.reserved || 0)} free (${d.onHand || 0} on hand, ${d.reserved || 0} reserved for orders).`;
        }).catch(() => {});
        box.querySelector('.rma-reject').addEventListener('click', reject);
        box.querySelector('.rma-dispatch').addEventListener('click', async (e) => {
          const serial = box.querySelector('.rma-serial').value.trim().toUpperCase();
          const courier = box.querySelector('.rma-courier').value.trim();
          if (!serial || !courier) { alert('Enter the replacement serial and the transporter.'); return; }
          e.target.disabled = true; e.target.textContent = 'Checking serial…';
          try {
            await updateDoc(ref, { dispatchRequest: { replacementSerial: serial, transporter: courier.slice(0, 100), docket: box.querySelector('.rma-docket').value.trim().slice(0, 60), byUid: user.uid, requestedAt: serverTimestamp() }, updatedAt: serverTimestamp() });
            await sleep(3500);
          } catch (err) { console.error(err); alert('Could not send the dispatch. Check console for details.'); }
          renderRmaList(el, opts);
        });
      } else if (r.status === 'replacement_dispatched') {
        box.innerHTML = `<button type="button" class="btn-primary rma-recv">Defective unit received at warehouse</button>
          <span style="font-size:12px;color:var(--stone);margin-left:8px;">It is held as defective stock until it goes back to the brand.</span>`;
        box.querySelector('.rma-recv').addEventListener('click', async (e) => {
          if (!confirm(`Confirm the customer's defective unit (${r.serialNumber || 'no serial'}) has arrived at the warehouse?`)) return;
          e.target.disabled = true;
          try {
            await updateDoc(ref, { receiveRequest: { byUid: user.uid, requestedAt: serverTimestamp() }, updatedAt: serverTimestamp() });
            await sleep(2500);
          } catch (err) { console.error(err); alert('Could not record it. Check console for details.'); }
          renderRmaList(el, opts);
        });
      }
    });
  } catch (err) {
    console.error('Load RMAs failed:', err);
    body.innerHTML = `<div style="color:var(--err);">Couldn't load RMAs. Check console for details.</div>`;
  }
}

// -----------------------------------------------------------------
// Brand returns. opts: { db, user }
// -----------------------------------------------------------------
export async function renderBrandReturns(el, opts) {
  const { db, user } = opts;
  el.innerHTML = panel('New shipment to the brand', 'Loading…', 'br-new') + panel('Shipments', 'Loading…', 'br-list');
  try {
    const [units, spares, brs, catalog, partsSnap] = await Promise.all([
      getDocs(query(collection(db, 'unitSerials'), where('status', '==', 'defective'))),
      getDocs(query(collection(db, 'returns'), where('status', '==', 'defective'))),
      getDocs(collection(db, 'brandReturns')),
      loadCatalog(db, { includeInactive: true }),
      getDocs(collection(db, 'spareParts'))
    ]);
    const parts = {}; partsSnap.forEach((d) => { parts[d.id] = d.data(); });
    const label = (m) => (catalog.find((c) => c.modelId === m) || {}).label || m;
    const unitList = []; units.forEach((d) => { if (d.data().location === 'warehouse_defective') unitList.push({ id: d.id, ...d.data() }); });
    const spareList = []; spares.forEach((d) => spareList.push({ id: d.id, ...d.data() }));
    const today = new Date().toISOString().slice(0, 10);
    el.querySelector('#br-new .panel-body').innerHTML = (unitList.length || spareList.length) ? `
      <div style="font-weight:600;margin-bottom:4px;">Defective units (from RMAs)</div>
      ${unitList.length ? unitList.map((u) => `<label style="display:block;font-size:13px;"><input type="checkbox" class="br-unit" value="${esc(u.id)}" checked> ${esc(u.serial || u.id)} — ${esc(label(u.modelId))}${u.rmaId ? ' · ' + esc(u.rmaId) : ''}</label>`).join('') : '<div style="font-size:12.5px;color:var(--stone);">None.</div>'}
      <div style="font-weight:600;margin:10px 0 4px;">Defective spare parts (from returns)</div>
      ${spareList.length ? spareList.map((r) => `<label style="display:block;font-size:13px;"><input type="checkbox" class="br-spare" value="${esc(r.id)}" checked> ${esc((parts[r.partId] || {}).name || r.partName || r.partId)} × ${esc(r.quantity ?? 1)} — ${esc(r.returnId || r.id)}</label>`).join('') : '<div style="font-size:12.5px;color:var(--stone);">None.</div>'}
      <div class="form-row" style="margin-top:10px;"><label>Brand</label><input type="text" id="br-brand" placeholder="e.g. Haier" maxlength="60"></div>
      <div class="form-row"><label>Courier</label><input type="text" id="br-courier" maxlength="100"></div>
      <div class="form-row"><label>Docket no.</label><input type="text" id="br-docket" maxlength="60"></div>
      <div class="form-row"><label>Sent on</label><input type="date" id="br-date" value="${today}" max="${today}"></div>
      <div class="form-row"><label>Notes</label><input type="text" id="br-notes" maxlength="300"></div>
      <div class="modal-error" id="br-err"></div>
      <button type="button" class="btn-primary" id="br-send">Send to brand</button>` : '<div class="empty-row">No defective units or spare parts waiting to go back.</div>';
    const send = el.querySelector('#br-send');
    if (send) send.addEventListener('click', async () => {
      const err = el.querySelector('#br-err'); err.classList.remove('show');
      const unitSerials = [...el.querySelectorAll('.br-unit:checked')].map((c) => c.value);
      const spareReturnIds = [...el.querySelectorAll('.br-spare:checked')].map((c) => c.value);
      const brand = el.querySelector('#br-brand').value.trim();
      if (!brand || !(unitSerials.length + spareReturnIds.length)) { err.textContent = 'Enter the brand and select at least one item.'; err.classList.add('show'); return; }
      if (!confirm(`Send ${unitSerials.length} unit(s) and ${spareReturnIds.length} spare return(s) to ${brand}?`)) return;
      send.disabled = true;
      try {
        await addDoc(collection(db, 'brandReturns'), {
          brand, unitSerials, spareReturnIds, courier: el.querySelector('#br-courier').value.trim(), docket: el.querySelector('#br-docket').value.trim(),
          sentOn: el.querySelector('#br-date').value, notes: el.querySelector('#br-notes').value.trim(),
          createdByUid: user.uid, createdByEmail: user.email || '', createdAt: serverTimestamp(), status: 'pending'
        });
        await sleep(3000);
        renderBrandReturns(el, opts);
      } catch (e) {
        console.error('Brand return failed:', e);
        err.textContent = 'Could not save the shipment. Check console for details.'; err.classList.add('show'); send.disabled = false;
      }
    });
    const list = []; brs.forEach((d) => list.push({ id: d.id, ...d.data() }));
    list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    const listBody = el.querySelector('#br-list .panel-body');
    listBody.innerHTML = list.length ? list.map((b, i) => {
      const cns = Array.isArray(b.creditNotes) ? b.creditNotes : [];
      const cnTotal = cns.reduce((s, c) => s + (Number(c.amount) || 0), 0);
      return `<div style="border:1px solid var(--hairline, #e3e3e3);border-radius:8px;padding:12px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;"><div><b>${esc(b.brand)}</b> · sent ${esc(b.sentOn || when(b.createdAt))} · ${esc(b.courier || '')} ${esc(b.docket || '')}</div>
          <div><b>${b.status === 'sent' ? 'With brand' : b.status === 'closed' ? 'Closed' : b.status === 'rejected' ? 'Refused' : 'Processing…'}</b></div></div>
        ${b.status === 'rejected' ? `<div style="color:var(--err);font-size:12.5px;">${esc(b.reason)}</div>` : ''}
        <div style="font-size:13px;margin-top:6px;">${b.unitCount ?? (b.unitSerials || []).length} unit(s), ${b.spareCount ?? (b.spareReturnIds || []).length} spare return(s) · Replacement units received: <b>${b.replacementsReceived || 0}</b> · Credit notes: <b>${inr(cnTotal)}</b></div>
        ${cns.length ? `<div style="font-size:12.5px;color:var(--stone);margin-top:4px;">${cns.map((c) => `${esc(c.number)} — ${inr(c.amount)} (${esc(c.date)})`).join('<br>')}</div>` : ''}
        ${b.status === 'sent' ? `<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:flex-end;">
          <input type="text" class="cn-no" placeholder="Credit note no." maxlength="40" style="width:140px;">
          <input type="number" class="cn-amt" placeholder="Amount ₹" min="0" step="0.01" style="width:120px;">
          <input type="date" class="cn-date" value="${today}" style="width:150px;">
          <button type="button" class="btn-secondary cn-add" data-i="${i}">Add credit note</button>
          <button type="button" class="btn-secondary br-close" data-i="${i}">Close shipment</button></div>
          <div style="font-size:12px;color:var(--stone);margin-top:4px;">Replacement units from the brand: receive them in Stock &amp; Receiving and pick this shipment.</div>` : ''}
      </div>`;
    }).join('') : '<div class="empty-row">No shipments yet.</div>';
    listBody.querySelectorAll('.cn-add').forEach((btn) => btn.addEventListener('click', async () => {
      const b = list[Number(btn.dataset.i)];
      const row = btn.parentElement;
      const number = row.querySelector('.cn-no').value.trim();
      const amount = Math.round(Number(row.querySelector('.cn-amt').value) * 100) / 100;
      if (!number || !(amount > 0)) { alert('Enter the credit note number and amount.'); return; }
      try {
        await updateDoc(doc(db, 'brandReturns', b.id), { creditNotes: [...(b.creditNotes || []), { number: number.slice(0, 40), amount, date: row.querySelector('.cn-date').value, byUid: user.uid }], updatedAt: serverTimestamp() });
        renderBrandReturns(el, opts);
      } catch (e) { console.error(e); alert('Could not add the credit note.'); }
    }));
    listBody.querySelectorAll('.br-close').forEach((btn) => btn.addEventListener('click', async () => {
      const b = list[Number(btn.dataset.i)];
      const note = prompt('Closing note (optional):', '');
      if (note === null) return;
      try {
        await updateDoc(doc(db, 'brandReturns', b.id), { status: 'closed', closedNote: note.slice(0, 300), closedByUid: user.uid, updatedAt: serverTimestamp() });
        renderBrandReturns(el, opts);
      } catch (e) { console.error(e); alert('Could not close the shipment.'); }
    }));
  } catch (err) {
    console.error('Load brand returns failed:', err);
    el.innerHTML = panel('Brand returns', `<div style="color:var(--err);">Couldn't load this. Check console for details.</div>`);
  }
}
