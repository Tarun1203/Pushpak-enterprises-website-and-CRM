// Trade finance screens: credit & accounts, invoices, payments, ledger,
// a dealer/distributor's own account page, the company GST profile and a
// printable invoice. Shared by the Super Admin, Warehouse, Dealer and
// Distributor pages. Every balance shown here is written by the Cloud
// Functions (createInvoice / cancelInvoice / applyTradePayment); these
// screens only read them, except credit terms (Super Admin), payments
// received (Warehouse / Super Admin) and the company profile (Super Admin).
//
// Needs window.TradeFinance (finance.js) and window.TradePricing.
import {
  collection, doc, getDoc, getDocs, query, where, addDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const F = () => window.TradeFinance;
const inr = (n) => window.TradePricing.formatINR(n);
function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const toDate = (ts) => (ts && ts.toDate ? ts.toDate() : null);
const day = (ts) => { const d = toDate(ts); return d ? d.toLocaleDateString('en-IN') : '—'; };
const INV_COLORS = { unpaid: '#8A6D00', partial: '#1E5FAF', paid: '#1E7B34', cancelled: '#6B6B6B' };
const pill = (s, overdue) => {
  const c = overdue ? '#B3261E' : (INV_COLORS[s] || '#6B6B6B');
  return `<span style="display:inline-block;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:600;color:${c};border:1px solid ${c}33;background:${c}12;">${esc(overdue ? 'Overdue' : s)}</span>`;
};
const isOverdue = (inv) => inv.status !== 'cancelled' && inv.balance > 0 && toDate(inv.dueDate) && toDate(inv.dueDate) < new Date();
const panel = (title, inner) => `<div class="panel" style="margin-bottom:16px;"><div class="panel-header"><h2>${title}</h2></div><div class="panel-body">${inner}</div></div>`;

// Head Office's trade accounts: Direct dealers and distributors.
async function loadCompanyAccounts(db) {
  const [dealers, dists, accts] = await Promise.all([
    getDocs(query(collection(db, 'users'), where('role', '==', 'dealer'))),
    getDocs(query(collection(db, 'users'), where('role', '==', 'distributor'))),
    getDocs(collection(db, 'tradeAccounts'))
  ]);
  const acct = {};
  accts.forEach((a) => { acct[a.id] = a.data(); });
  const list = [];
  dealers.forEach((d) => {
    const u = d.data();
    if (u.distributionType === 'underDistributor' && u.distributorUid) return;
    list.push({ uid: d.id, type: 'Dealer', name: u.name || u.email || d.id, gstin: u.gstin || '', ...acct[d.id] });
  });
  dists.forEach((d) => { const u = d.data(); list.push({ uid: d.id, type: 'Distributor', name: u.name || u.email || d.id, gstin: u.gstin || '', ...acct[d.id] }); });
  list.sort((a, b) => a.name.localeCompare(b.name));
  return list;
}

// -----------------------------------------------------------------
// Printable GST invoice (opens a new window; use the browser's Print).
// -----------------------------------------------------------------
export function printInvoice(inv) {
  const t = inv.totals || {};
  const igst = !!inv.interState;
  const rows = (inv.lines || []).map((l, i) => `<tr>
    <td>${i + 1}</td><td>${esc(l.label)}</td><td>${esc(l.hsn || '')}</td><td class="r">${esc(l.qty)}</td>
    <td class="r">${inr(l.unitPrice)}</td><td class="r">${inr(l.taxable)}</td><td class="r">${esc(l.gstRate)}%</td>
    ${igst ? `<td class="r">${inr(l.igst)}</td>` : `<td class="r">${inr(l.cgst)}</td><td class="r">${inr(l.sgst)}</td>`}
    <td class="r">${inr(l.total)}</td></tr>`).join('');
  const s = inv.seller || {}, b = inv.buyer || {};
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(inv.invoiceNo)}</title>
  <style>body{font-family:Arial,sans-serif;font-size:12px;margin:24px;color:#111}h1{font-size:18px;margin:0 0 4px}
  table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #999;padding:5px;vertical-align:top}th{background:#f2f2f2}
  .r{text-align:right}.grid{display:flex;gap:16px}.grid>div{flex:1;border:1px solid #999;padding:8px}.muted{color:#555}
  .cancel{color:#B3261E;font-size:16px;font-weight:bold;border:2px solid #B3261E;display:inline-block;padding:4px 10px;margin-bottom:8px}
  @media print{button{display:none}}</style></head><body>
  <button onclick="window.print()" style="float:right;padding:6px 14px;">Print</button>
  ${inv.status === 'cancelled' ? '<div class="cancel">CANCELLED</div>' : ''}
  <h1>TAX INVOICE</h1>
  <div class="muted">Invoice No: <b>${esc(inv.invoiceNo)}</b> &nbsp; Date: <b>${day(inv.invoiceDate)}</b> &nbsp; Due: <b>${day(inv.dueDate)}</b> &nbsp; Order: ${esc(inv.orderId)}</div>
  <div class="grid" style="margin-top:10px;">
    <div><b>Seller</b><br>${esc(s.legalName)}<br>${esc(s.address).replace(/\n/g, '<br>')}<br>GSTIN: ${esc(s.gstin) || '—'} &nbsp; State code: ${esc(s.stateCode) || '—'}${s.phone ? '<br>Ph: ' + esc(s.phone) : ''}${s.email ? '<br>' + esc(s.email) : ''}</div>
    <div><b>Buyer</b><br>${esc(b.name)}<br>${esc(b.address).replace(/\n/g, '<br>')}<br>GSTIN: ${esc(b.gstin) || 'Unregistered'} &nbsp; State code: ${esc(b.stateCode) || 'not known'}<br>Place of supply: ${esc(b.stateCode || s.stateCode || '—')}</div>
  </div>
  <table><thead><tr><th>#</th><th>Item</th><th>HSN</th><th>Qty</th><th>Rate</th><th>Taxable</th><th>GST</th>${igst ? '<th>IGST</th>' : '<th>CGST</th><th>SGST</th>'}<th>Amount</th></tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr><td colspan="5" class="r"><b>Total</b></td><td class="r">${inr(t.taxable)}</td><td></td>${igst ? `<td class="r">${inr(t.igst)}</td>` : `<td class="r">${inr(t.cgst)}</td><td class="r">${inr(t.sgst)}</td>`}<td class="r"><b>${inr(t.total)}</b></td></tr></tfoot></table>
  <p>Amount paid: ${inr(inv.paid)} &nbsp; Balance due: <b>${inr(inv.balance)}</b></p>
  ${s.bankDetails ? `<p><b>Bank details:</b><br>${esc(s.bankDetails).replace(/\n/g, '<br>')}</p>` : ''}
  ${inv.buyerStateKnown === false ? '<p class="muted">Buyer state not on file — taxed as same-state supply.</p>' : ''}
  <p class="muted">This is a computer-generated invoice.</p></body></html>`;
  const w = window.open('', '_blank');
  if (!w) { alert('Allow pop-ups for this site to view the invoice.'); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

function invoiceTable(invoices, { showBuyer }) {
  if (!invoices.length) return `<div class="empty-row">No invoices yet.</div>`;
  return `<table style="width:100%;font-size:13px;"><thead><tr><th>Invoice</th><th>Date</th>${showBuyer ? '<th>Buyer</th>' : ''}<th>Order</th><th style="text-align:right;">Total</th><th style="text-align:right;">Paid</th><th style="text-align:right;">Balance</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>
    ${invoices.map((inv, i) => `<tr><td>${esc(inv.invoiceNo)}</td><td>${day(inv.invoiceDate)}</td>${showBuyer ? `<td>${esc((inv.buyer || {}).name)}</td>` : ''}
      <td style="font-size:12px;">${esc(inv.orderId)}</td><td style="text-align:right;">${inr((inv.totals || {}).total)}</td><td style="text-align:right;">${inr(inv.paid)}</td>
      <td style="text-align:right;">${inr(inv.balance)}</td><td>${day(inv.dueDate)}</td><td>${pill(inv.status, isOverdue(inv))}</td>
      <td><button type="button" class="btn-secondary tf-print" data-i="${i}">View / print</button></td></tr>`).join('')}</tbody></table>`;
}
function wirePrint(el, invoices) {
  el.querySelectorAll('.tf-print').forEach((b) => b.addEventListener('click', () => printInvoice(invoices[Number(b.dataset.i)])));
}

// -----------------------------------------------------------------
// Credit & accounts (Super Admin edits; Warehouse views).
// -----------------------------------------------------------------
export async function renderAccounts(el, opts) {
  const { db, user, isSuperAdmin } = opts;
  el.innerHTML = panel('Dealer & distributor accounts', 'Loading…');
  try {
    const [accounts, invSnap] = await Promise.all([loadCompanyAccounts(db), getDocs(collection(db, 'invoices'))]);
    const invoices = [];
    invSnap.forEach((d) => { const x = d.data(); invoices.push({ ...x, dueDate: toDate(x.dueDate) || new Date() }); });
    const aging = F().agingBuckets(invoices, new Date());
    const now = new Date();
    const rows = accounts.map((a, i) => {
      const limit = typeof a.creditLimit === 'number' ? a.creditLimit : null;
      const out = a.outstanding || 0;
      const due = toDate(a.oldestUnpaidDue);
      const overdue = due && due <= now;
      return `<tr><td>${esc(a.name)}<div style="font-size:11.5px;color:var(--stone);">${a.type}${a.gstin ? ' · ' + esc(a.gstin) : ''}</div></td>
        <td style="text-align:right;">${limit === null ? '<span style="color:var(--err);">not set</span>' : inr(limit)}</td>
        <td>${Number.isInteger(a.paymentTermsDays) ? a.paymentTermsDays : F().DEFAULT_TERMS_DAYS} days</td>
        <td style="text-align:right;">${inr(out)}</td>
        <td style="text-align:right;">${limit === null ? '—' : inr(limit - out)}</td>
        <td>${overdue ? `<span style="color:var(--err);font-weight:600;">since ${due.toLocaleDateString('en-IN')}</span>` : '—'}</td>
        <td style="white-space:nowrap;"><button type="button" class="btn-secondary tf-ledger" data-i="${i}">Ledger</button>
          ${isSuperAdmin ? `<button type="button" class="btn-secondary tf-edit" data-i="${i}">Edit terms</button>` : ''}</td></tr>`;
    }).join('');
    el.innerHTML = panel('Outstanding by age', `<div style="display:flex;gap:18px;flex-wrap:wrap;font-size:13px;">
        <div>Not yet due<br><b>${inr(aging.notDue)}</b></div><div>1–30 days overdue<br><b>${inr(aging.d1_30)}</b></div>
        <div>31–60<br><b>${inr(aging.d31_60)}</b></div><div>61–90<br><b>${inr(aging.d61_90)}</b></div>
        <div style="color:var(--err);">90+ days<br><b>${inr(aging.d90plus)}</b></div></div>`)
      + panel('Dealer & distributor accounts', `
        <div style="font-size:12.5px;color:var(--stone);margin-bottom:8px;">An order can only be approved if it keeps the account within its credit limit and the account has no overdue invoice${isSuperAdmin ? ' — you can override with a reason when approving' : ' — Super Admin can override'}. An account with no limit set has no credit (pay in advance).</div>
        ${accounts.length ? `<table style="width:100%;font-size:13px;"><thead><tr><th>Account</th><th style="text-align:right;">Credit limit</th><th>Terms</th><th style="text-align:right;">Outstanding</th><th style="text-align:right;">Available</th><th>Overdue</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="empty-row">No Direct dealers or distributors yet.</div>'}
        <div id="tf-acct-detail" style="margin-top:14px;"></div>`);
    const detail = el.querySelector('#tf-acct-detail');
    el.querySelectorAll('.tf-ledger').forEach((b) => b.addEventListener('click', () => {
      const a = accounts[Number(b.dataset.i)];
      renderLedger(detail, { db, uid: a.uid, title: `Ledger — ${esc(a.name)}` });
      detail.scrollIntoView({ behavior: 'smooth' });
    }));
    el.querySelectorAll('.tf-edit').forEach((b) => b.addEventListener('click', () => {
      const a = accounts[Number(b.dataset.i)];
      detail.innerHTML = panel(`Credit terms — ${esc(a.name)}`, `
        <div class="form-row"><label>Credit limit (₹)</label><input type="number" id="tf-limit" min="0" step="1" value="${typeof a.creditLimit === 'number' ? a.creditLimit : ''}"></div>
        <div class="form-row"><label>Payment terms (days)</label><input type="number" id="tf-terms" min="0" max="365" step="1" value="${Number.isInteger(a.paymentTermsDays) ? a.paymentTermsDays : F().DEFAULT_TERMS_DAYS}"></div>
        <div class="form-row"><label>State code (if no GSTIN)</label><input type="text" id="tf-state" maxlength="2" placeholder="e.g. 29 for Karnataka" value="${esc(a.stateCode || '')}"></div>
        <div class="form-row"><label>Notes</label><input type="text" id="tf-notes" maxlength="300" value="${esc(a.notes || '')}"></div>
        <div class="modal-error" id="tf-err"></div>
        <button type="button" class="btn-primary" id="tf-save">Save</button>`);
      detail.scrollIntoView({ behavior: 'smooth' });
      detail.querySelector('#tf-save').addEventListener('click', async () => {
        const err = detail.querySelector('#tf-err'); err.classList.remove('show');
        const limit = Number(detail.querySelector('#tf-limit').value);
        const terms = parseInt(detail.querySelector('#tf-terms').value, 10);
        const state = detail.querySelector('#tf-state').value.trim();
        if (!(limit >= 0) || !(terms >= 0 && terms <= 365) || (state && !/^[0-9]{2}$/.test(state))) {
          err.textContent = 'Enter a limit of 0 or more, terms between 0 and 365 days, and a 2-digit state code (or leave it empty).';
          err.classList.add('show'); return;
        }
        try {
          await setDoc(doc(db, 'tradeAccounts', a.uid), {
            creditLimit: Math.round(limit * 100) / 100, paymentTermsDays: terms, stateCode: state || null,
            notes: detail.querySelector('#tf-notes').value.trim(), updatedAt: serverTimestamp(), updatedBy: user.email || user.uid
          }, { merge: true });
          renderAccounts(el, opts);
        } catch (e) {
          console.error('Save credit terms failed:', e);
          err.textContent = 'Could not save. Check console for details.'; err.classList.add('show');
        }
      });
    }));
  } catch (err) {
    console.error('Load accounts failed:', err);
    el.innerHTML = panel('Dealer & distributor accounts', `<div style="color:var(--err);">Couldn't load accounts. Check console for details.</div>`);
  }
}

// -----------------------------------------------------------------
// Ledger for one account, with a running balance.
// -----------------------------------------------------------------
export async function renderLedger(el, { db, uid, title }) {
  el.innerHTML = panel(title || 'Ledger', 'Loading…');
  try {
    const snap = await getDocs(query(collection(db, 'ledgerEntries'), where('accountUid', '==', uid)));
    const rows = [];
    snap.forEach((d) => rows.push(d.data()));
    rows.sort((a, b) => (a.at?.seconds || 0) - (b.at?.seconds || 0));
    let bal = 0;
    const LABEL = { invoice: 'Invoice', invoice_cancelled: 'Invoice cancelled', payment: 'Payment received' };
    const body = rows.map((r) => {
      bal = F().toRupees(F().toPaise(bal) + F().toPaise(r.debit) - F().toPaise(r.credit));
      return `<tr><td>${day(r.at)}</td><td>${esc(LABEL[r.type] || r.type)}</td><td>${esc(r.ref)}</td><td style="font-size:12px;color:var(--stone);">${esc(r.note)}</td>
        <td style="text-align:right;">${r.debit ? inr(r.debit) : ''}</td><td style="text-align:right;">${r.credit ? inr(r.credit) : ''}</td>
        <td style="text-align:right;"><b>${inr(bal)}</b></td></tr>`;
    }).join('');
    el.innerHTML = panel(title || 'Ledger', rows.length
      ? `<table style="width:100%;font-size:13px;"><thead><tr><th>Date</th><th>Entry</th><th>Ref</th><th>Note</th><th style="text-align:right;">Debit</th><th style="text-align:right;">Credit</th><th style="text-align:right;">Balance</th></tr></thead><tbody>${body}</tbody></table>
         <div style="font-size:12px;color:var(--stone);margin-top:6px;">A negative balance is money paid in advance.</div>`
      : '<div class="empty-row">No entries yet.</div>');
  } catch (err) {
    console.error('Load ledger failed:', err);
    el.innerHTML = panel(title || 'Ledger', `<div style="color:var(--err);">Couldn't load the ledger.</div>`);
  }
}

// -----------------------------------------------------------------
// All invoices (Super Admin / Warehouse).
// -----------------------------------------------------------------
export async function renderInvoices(el, { db }) {
  el.innerHTML = panel('Trade invoices', 'Loading…');
  try {
    const snap = await getDocs(collection(db, 'invoices'));
    const invoices = [];
    snap.forEach((d) => invoices.push({ id: d.id, ...d.data() }));
    invoices.sort((a, b) => (b.invoiceDate?.seconds || 0) - (a.invoiceDate?.seconds || 0));
    el.innerHTML = panel('Trade invoices', `<div style="font-size:12.5px;color:var(--stone);margin-bottom:8px;">Created automatically when a Head Office order is approved; cancelling the order cancels its invoice. Invoices can't be edited.</div>${invoiceTable(invoices, { showBuyer: true })}`);
    wirePrint(el, invoices);
  } catch (err) {
    console.error('Load invoices failed:', err);
    el.innerHTML = panel('Trade invoices', `<div style="color:var(--err);">Couldn't load invoices.</div>`);
  }
}

// -----------------------------------------------------------------
// Payments received (Warehouse / Super Admin record them).
// -----------------------------------------------------------------
export async function renderPayments(el, opts) {
  const { db, user } = opts;
  el.innerHTML = panel('Record a payment received', 'Loading…');
  try {
    const [accounts, paySnap] = await Promise.all([loadCompanyAccounts(db), getDocs(collection(db, 'tradePayments'))]);
    const pays = [];
    paySnap.forEach((d) => pays.push({ id: d.id, ...d.data() }));
    pays.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    const today = new Date().toISOString().slice(0, 10);
    el.innerHTML = panel('Record a payment received', `
        <div class="form-row"><label>From</label><select id="tf-pay-acct"><option value="">Select account…</option>${accounts.map((a) => `<option value="${esc(a.uid)}">${esc(a.name)} (${a.type}) — owes ${inr(a.outstanding || 0)}</option>`).join('')}</select></div>
        <div class="form-row"><label>Amount (₹)</label><input type="number" id="tf-pay-amt" min="0.01" step="0.01"></div>
        <div class="form-row"><label>Mode</label><select id="tf-pay-mode"><option>NEFT/RTGS</option><option>UPI</option><option>Cheque</option><option>Cash</option><option>Other</option></select></div>
        <div class="form-row"><label>Reference (UTR / cheque no.)</label><input type="text" id="tf-pay-ref" maxlength="80"></div>
        <div class="form-row"><label>Received on</label><input type="date" id="tf-pay-date" value="${today}" max="${today}"></div>
        <div class="form-row"><label>Notes</label><input type="text" id="tf-pay-notes" maxlength="300"></div>
        <div style="font-size:12px;color:var(--stone);margin-bottom:8px;">The payment is applied to the oldest unpaid invoices first; anything extra stays as an advance. Payments can't be edited or deleted once saved — check the amount.</div>
        <div class="modal-error" id="tf-pay-err"></div><div id="tf-pay-ok" style="color:#1E7B34;font-weight:600;margin:6px 0;"></div>
        <button type="button" class="btn-primary" id="tf-pay-save">Save payment</button>`)
      + panel('Payments received', pays.length ? `<table style="width:100%;font-size:13px;"><thead><tr><th>Received</th><th>From</th><th style="text-align:right;">Amount</th><th>Mode / ref</th><th>Applied to</th><th>Recorded by</th></tr></thead><tbody>
          ${pays.map((p) => `<tr><td>${esc(p.receivedOn || day(p.createdAt))}</td><td>${esc(p.accountName || p.accountUid)}</td><td style="text-align:right;">${inr(p.amount)}</td>
            <td>${esc(p.mode)} ${esc(p.reference)}</td>
            <td style="font-size:12px;">${p.processedAt ? ((p.allocations || []).map((a) => `${esc(a.invoiceNo || a.invoiceId)}: ${inr(a.amount)}`).join('<br>') || '—') + (p.unallocated > 0 ? `<br>Advance: ${inr(p.unallocated)}` : '') : 'Applying…'}</td>
            <td style="font-size:12px;">${esc(p.recordedByEmail)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty-row">No payments recorded yet.</div>');
    el.querySelector('#tf-pay-save').addEventListener('click', async () => {
      const err = el.querySelector('#tf-pay-err'); const ok = el.querySelector('#tf-pay-ok');
      err.classList.remove('show'); ok.textContent = '';
      const uid = el.querySelector('#tf-pay-acct').value;
      const amount = Math.round(Number(el.querySelector('#tf-pay-amt').value) * 100) / 100;
      const date = el.querySelector('#tf-pay-date').value;
      if (!uid || !(amount > 0) || !date) { err.textContent = 'Choose the account, an amount above 0 and the date received.'; err.classList.add('show'); return; }
      const acct = accounts.find((a) => a.uid === uid);
      if (!confirm(`Record ${inr(amount)} received from ${acct.name}? This can't be undone.`)) return;
      const btn = el.querySelector('#tf-pay-save'); btn.disabled = true;
      try {
        await addDoc(collection(db, 'tradePayments'), {
          accountUid: uid, accountName: acct.name, amount, mode: el.querySelector('#tf-pay-mode').value,
          reference: el.querySelector('#tf-pay-ref').value.trim(), receivedOn: date,
          notes: el.querySelector('#tf-pay-notes').value.trim(),
          recordedByUid: user.uid, recordedByEmail: user.email || '', createdAt: serverTimestamp()
        });
        ok.textContent = 'Saved — it will be applied to invoices in a few seconds.';
        setTimeout(() => renderPayments(el, opts), 2500);
      } catch (e) {
        console.error('Record payment failed:', e);
        err.textContent = 'Could not save the payment. Check console for details.'; err.classList.add('show');
        btn.disabled = false;
      }
    });
  } catch (err) {
    console.error('Load payments failed:', err);
    el.innerHTML = panel('Payments', `<div style="color:var(--err);">Couldn't load payments.</div>`);
  }
}

// -----------------------------------------------------------------
// A dealer's / distributor's own account with Head Office.
// -----------------------------------------------------------------
export async function renderMyAccount(el, { db, uid }) {
  el.innerHTML = panel('My account', 'Loading…');
  try {
    const [acctSnap, invSnap, paySnap] = await Promise.all([
      getDoc(doc(db, 'tradeAccounts', uid)).catch(() => null),
      getDocs(query(collection(db, 'invoices'), where('buyerUid', '==', uid))),
      getDocs(query(collection(db, 'tradePayments'), where('accountUid', '==', uid)))
    ]);
    const a = acctSnap && acctSnap.exists() ? acctSnap.data() : {};
    const invoices = []; invSnap.forEach((d) => invoices.push({ id: d.id, ...d.data() }));
    invoices.sort((x, y) => (y.invoiceDate?.seconds || 0) - (x.invoiceDate?.seconds || 0));
    const pays = []; paySnap.forEach((d) => pays.push(d.data()));
    pays.sort((x, y) => (y.createdAt?.seconds || 0) - (x.createdAt?.seconds || 0));
    const limit = typeof a.creditLimit === 'number' ? a.creditLimit : 0;
    const out = a.outstanding || 0;
    const due = toDate(a.oldestUnpaidDue);
    const overdue = due && due <= new Date();
    el.innerHTML = panel('My account with Pushpak Enterprises', `<div style="display:flex;gap:22px;flex-wrap:wrap;font-size:14px;">
        <div>Credit limit<br><b>${inr(limit)}</b></div><div>Outstanding<br><b>${inr(out)}</b></div>
        <div>Available<br><b>${inr(limit - out)}</b></div><div>Payment terms<br><b>${Number.isInteger(a.paymentTermsDays) ? a.paymentTermsDays : F().DEFAULT_TERMS_DAYS} days</b></div></div>
        ${overdue ? `<div style="color:var(--err);font-weight:600;margin-top:10px;">You have an overdue invoice (due ${due.toLocaleDateString('en-IN')}). New orders can't be approved until it is paid.</div>` : ''}`)
      + panel('Invoices', invoiceTable(invoices, { showBuyer: false }))
      + panel('Payments received', pays.length ? `<table style="width:100%;font-size:13px;"><thead><tr><th>Received</th><th style="text-align:right;">Amount</th><th>Mode / ref</th></tr></thead><tbody>
          ${pays.map((p) => `<tr><td>${esc(p.receivedOn)}</td><td style="text-align:right;">${inr(p.amount)}</td><td>${esc(p.mode)} ${esc(p.reference)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty-row">No payments recorded yet.</div>')
      + '<div id="tf-my-ledger"></div>';
    wirePrint(el, invoices);
    renderLedger(el.querySelector('#tf-my-ledger'), { db, uid, title: 'Statement' });
  } catch (err) {
    console.error('Load my account failed:', err);
    el.innerHTML = panel('My account', `<div style="color:var(--err);">Couldn't load your account.</div>`);
  }
}

// -----------------------------------------------------------------
// Company GST profile printed on invoices (Super Admin).
// -----------------------------------------------------------------
export async function renderCompanyProfile(el, { db }) {
  el.innerHTML = panel('Company GST profile', 'Loading…');
  let p = {};
  try { const s = await getDoc(doc(db, 'settings', 'companyProfile')); if (s.exists()) p = s.data(); } catch (e) { console.warn(e); }
  const f = (id, label, val, extra = '') => `<div class="form-row"><label>${label}</label><input type="text" id="cp-${id}" value="${esc(val || '')}" ${extra}></div>`;
  el.innerHTML = panel('Company GST profile', `
    <div style="font-size:12.5px;color:var(--stone);margin-bottom:8px;">Printed on every trade invoice. Invoices already issued keep the details they were issued with.</div>
    ${f('legalName', 'Legal name', p.legalName || 'Pushpak Enterprises')}
    ${f('gstin', 'GSTIN', p.gstin, 'maxlength="15"')}
    ${f('stateCode', 'State code', p.stateCode || '29', 'maxlength="2"')}
    <div class="form-row"><label>Address</label><textarea id="cp-address" rows="3">${esc(p.address || '')}</textarea></div>
    ${f('phone', 'Phone', p.phone)}${f('email', 'Email', p.email)}
    <div class="form-row"><label>Bank details (for payment)</label><textarea id="cp-bankDetails" rows="3">${esc(p.bankDetails || '')}</textarea></div>
    ${f('invoicePrefix', 'Invoice number prefix', p.invoicePrefix || 'PE', 'maxlength="8"')}
    <div class="modal-error" id="cp-err"></div><div id="cp-ok" style="color:#1E7B34;font-weight:600;margin:6px 0;"></div>
    <button type="button" class="btn-primary" id="cp-save">Save</button>`);
  el.querySelector('#cp-save').addEventListener('click', async () => {
    const v = (id) => el.querySelector('#cp-' + id).value.trim();
    const err = el.querySelector('#cp-err'); err.classList.remove('show');
    const gstin = v('gstin').toUpperCase();
    if (gstin && !F().stateCodeFromGstin(gstin)) { err.textContent = 'That GSTIN doesn\'t look right (15 characters, starting with the 2-digit state code).'; err.classList.add('show'); return; }
    if (!/^[0-9]{2}$/.test(v('stateCode'))) { err.textContent = 'State code must be 2 digits (29 = Karnataka).'; err.classList.add('show'); return; }
    if (!/^[A-Za-z0-9-]{1,8}$/.test(v('invoicePrefix'))) { err.textContent = 'Prefix: up to 8 letters/digits.'; err.classList.add('show'); return; }
    try {
      await setDoc(doc(db, 'settings', 'companyProfile'), {
        legalName: v('legalName'), gstin, stateCode: v('stateCode'), address: v('address'), phone: v('phone'), email: v('email'),
        bankDetails: v('bankDetails'), invoicePrefix: v('invoicePrefix').toUpperCase(), updatedAt: serverTimestamp()
      }, { merge: true });
      el.querySelector('#cp-ok').textContent = 'Saved.';
    } catch (e) {
      console.error('Save company profile failed:', e);
      err.textContent = 'Could not save. Check console for details.'; err.classList.add('show');
    }
  });
}
