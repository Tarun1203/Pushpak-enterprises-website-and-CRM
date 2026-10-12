// Super Admin — a service center's service-charge rate request, decided line
// by line. Each requested rate is its own row with Approve / Reject and an
// editable amount. Approved lines take effect immediately (written to the rate
// card here, where Super Admin is allowed to write it); the request keeps only
// the approved lines and a record of every line's decision, and the server's
// applyChangeRequest function re-applies the same values and tells the center.

export function rateCardKey(scope, centerUid, category, rateType, bucket) {
  const safeCat = String(category || 'other').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const safeBucket = String(bucket || 'flat').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return scope === 'center' ? `center_${centerUid}_${safeCat}_${rateType}_${safeBucket}` : `default_${safeCat}_${rateType}_${safeBucket}`;
}

// Turns the per-line choices into what is written. Pure, so it can be tested.
// lines: [{category, rateType, bucket, amount}] as requested
// choices: [{decision:'approve'|'reject', amount: number|null|''}] same order
export function decide(lines, choices) {
  const approved = [], decisions = [];
  lines.forEach((l, i) => {
    const c = choices[i] || {};
    const raw = c.amount === '' || c.amount === undefined ? null : c.amount;
    const amount = raw === null ? null : Math.round(Number(raw) * 100) / 100;
    if (c.decision === 'approve') {
      if (amount !== null && !(amount >= 0 && amount <= 100000)) throw new Error(`Line ${i + 1}: amount must be from 0 to 1,00,000, or empty to remove the rate.`);
      approved.push({ category: l.category, rateType: l.rateType, bucket: l.bucket || null, amount });
    }
    decisions.push({ category: l.category, rateType: l.rateType, bucket: l.bucket || null, requested: l.amount === undefined ? null : l.amount,
      decision: c.decision === 'approve' ? 'approved' : 'rejected', amount: c.decision === 'approve' ? amount : null });
  });
  if (!decisions.length) throw new Error('This request has no lines.');
  if (choices.some((c) => !c || !['approve', 'reject'].includes(c.decision))) throw new Error('Choose Approve or Reject for every line.');
  return { approved, decisions, status: approved.length ? 'approved' : 'rejected' };
}

const money = (v) => (v === null || v === undefined || v === '' ? '—' : '₹' + v);

export function mountRateRequest(tbody, cr, api) {
  const { db, fs, escapeHtml: esc, me, onDone } = api;
  const { doc, getDoc, setDoc, deleteDoc, updateDoc, serverTimestamp } = fs;
  const lines = (cr.payload && Array.isArray(cr.payload.rates)) ? cr.payload.rates : [];
  const dateStr = cr.createdAt && cr.createdAt.toDate ? cr.createdAt.toDate().toLocaleString() : '—';
  const own = me && cr.requestedByUid === me.uid;
  const head = document.createElement('tr');
  head.className = 'rate-req-head';
  head.innerHTML = `
    <td style="font-size:12px;color:var(--stone);white-space:nowrap;">${esc(dateStr)}</td>
    <td style="font-size:12.5px;">Service center rates</td>
    <td style="font-size:12.5px;">${lines.length} rate line${lines.length === 1 ? '' : 's'} — decide each one below</td>
    <td style="font-size:12px;">${esc(cr.requestedByEmail || '—')}</td>
    <td>${own ? '<span style="font-size:12px;color:var(--stone);">Your own request — another Super Admin decides it</span>' : ''}</td>`;
  tbody.appendChild(head);
  const body = document.createElement('tr');
  body.className = 'rate-req-lines';
  body.innerHTML = `<td colspan="5" style="background:var(--paper,#F6F7FB);padding:12px 16px;">
    <table class="rate-req-table" style="width:100%;font-size:13px;">
      <thead><tr><th>Category</th><th>Size / model</th><th>Type</th><th>Current rate</th><th>Requested</th><th>Decision</th><th>Amount to approve (₹)</th></tr></thead>
      <tbody>${lines.map((l, i) => `
        <tr data-i="${i}">
          <td>${esc(l.category)}</td><td>${esc(l.bucket || '—')}</td><td>${l.rateType === 'installation' ? 'Installation' : 'Repair'}</td>
          <td class="rr-current" style="color:var(--stone);">…</td>
          <td>${l.amount === null ? 'Remove own rate (use HO default)' : money(l.amount)}</td>
          <td style="white-space:nowrap;">
            <label style="margin-right:10px;"><input type="radio" name="rr-${esc(cr.id)}-${i}" value="approve" ${own ? 'disabled' : ''}> Approve</label>
            <label><input type="radio" name="rr-${esc(cr.id)}-${i}" value="reject" ${own ? 'disabled' : ''}> Reject</label>
          </td>
          <td><input type="number" class="rr-amount" min="0" step="0.01" aria-label="Amount to approve for ${esc(l.category)} ${esc(l.bucket || '')} ${esc(l.rateType)}" value="${l.amount === null ? '' : esc(l.amount)}" placeholder="empty = remove" style="width:120px;" ${own ? 'disabled' : ''}></td>
        </tr>`).join('')}</tbody>
    </table>
    ${own ? '' : `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px;">
      <button type="button" class="btn-secondary rr-all-approve">Mark all approve</button>
      <button type="button" class="btn-secondary rr-all-reject">Mark all reject</button>
      <input type="text" class="rr-note" placeholder="Note to the center (optional)" aria-label="Note to the center" style="flex:1;min-width:180px;">
      <button type="button" class="btn-primary rr-save">Save decisions</button>
    </div>
    <div class="rr-msg" role="status" aria-live="polite" style="font-size:12.5px;margin-top:8px;"></div>`}
  </td>`;
  tbody.appendChild(body);

  // Current rate for each line: this center's own rate, else Head Office's default.
  lines.forEach(async (l, i) => {
    const cell = body.querySelector(`tr[data-i="${i}"] .rr-current`);
    try {
      const own = await getDoc(doc(db, 'serviceChargeRates', rateCardKey('center', cr.requestedByUid, l.category, l.rateType, l.bucket)));
      if (own.exists()) { cell.textContent = `${money(own.data().amount)} (center's own)`; return; }
      const def = await getDoc(doc(db, 'serviceChargeRates', rateCardKey('default', null, l.category, l.rateType, l.bucket)));
      cell.textContent = def.exists() ? `${money(def.data().amount)} (HO default)` : 'Not set';
    } catch (e) { cell.textContent = '—'; }
  });
  if (own) return;

  const radios = (v) => body.querySelectorAll(`input[type=radio][value="${v}"]`).forEach((r) => { r.checked = true; });
  body.querySelector('.rr-all-approve').addEventListener('click', () => radios('approve'));
  body.querySelector('.rr-all-reject').addEventListener('click', () => radios('reject'));
  body.querySelector('.rr-save').addEventListener('click', async () => {
    const msg = body.querySelector('.rr-msg'), btn = body.querySelector('.rr-save');
    msg.style.color = 'var(--err)';
    let out;
    try {
      const choices = lines.map((l, i) => {
        const row = body.querySelector(`tr[data-i="${i}"]`);
        const r = row.querySelector('input[type=radio]:checked');
        return { decision: r ? r.value : null, amount: row.querySelector('.rr-amount').value.trim() };
      });
      out = decide(lines, choices);
    } catch (e) { msg.textContent = e.message; return; }
    const nA = out.approved.length, nR = out.decisions.length - nA;
    if (!window.confirm(`Save decisions?\n\n${nA} approved, ${nR} rejected.${nA ? '\nApproved rates take effect immediately.' : ''}`)) return;
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      // 1. Apply the approved lines to the rate card now.
      for (const rt of out.approved) {
        const ref = doc(db, 'serviceChargeRates', rateCardKey('center', cr.requestedByUid, rt.category, rt.rateType, rt.bucket));
        if (rt.amount === null) await deleteDoc(ref);
        else await setDoc(ref, { scope: 'center', serviceCenterUid: cr.requestedByUid, category: rt.category, type: rt.rateType, bucket: rt.bucket || null,
          amount: rt.amount, updatedBy: cr.requestedByEmail || '', approvedByUid: me.uid, changeRequestId: cr.id, updatedAt: serverTimestamp() }, { merge: true });
      }
      // 2. Close the request with each line's decision.
      await updateDoc(doc(db, 'changeRequests', cr.id), {
        status: out.status, payload: { rates: out.approved }, decisions: out.decisions,
        reviewedBy: me.email || 'unknown', reviewedByUid: me.uid, reviewedAt: serverTimestamp(),
        reviewNote: body.querySelector('.rr-note').value.trim()
      });
      msg.style.color = 'var(--ok, #12804A)';
      msg.textContent = `Saved — ${nA} approved${nA ? ' and in effect now' : ''}, ${nR} rejected.`;
      if (onDone) setTimeout(onDone, 900);
    } catch (e) {
      console.error('Save rate decisions failed:', e);
      msg.textContent = 'Could not save. If this is the first time, the updated Firestore rules may not be published yet.';
      btn.disabled = false; btn.textContent = 'Save decisions';
    }
  });
}
