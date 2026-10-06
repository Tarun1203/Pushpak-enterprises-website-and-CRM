// Dealer / distributor ordering screens, shared by the Dealer, Distributor,
// Warehouse and Super Admin pages. Prices shown in the order form are only
// an estimate: the order's real prices, GST and totals are worked out by
// the priceOnCreate_* Cloud Functions from the seller's private price list
// (firestore.rules stops any browser from writing them).
//
// Needs window.TradePricing (tradePricing.js, loaded with <script src>).
import {
  collection, doc, getDocs, query, where, addDoc, setDoc, updateDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const TP = () => window.TradePricing;

function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const inr = (n) => TP().formatINR(n);
const when = (ts) => (ts && ts.toDate ? ts.toDate().toLocaleString() : '—');

const STATUS_COLORS = { placed: '#8A6D00', confirmed: '#1E5FAF', dispatched: '#5B3FA8', delivered: '#1E7B34', rejected: '#B3261E', cancelled: '#6B6B6B' };
function statusPill(status) {
  const label = TP().STATUS_LABELS[status] || status || '—';
  const c = STATUS_COLORS[status] || '#6B6B6B';
  return `<span style="display:inline-block;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:600;color:${c};border:1px solid ${c}33;background:${c}12;">${esc(label)}</span>`;
}

// -----------------------------------------------------------------
// Catalogue: every active product model, labelled "Product — Model".
// -----------------------------------------------------------------
let catalogCache = null;
export async function loadCatalog(db, { includeInactive = false, refresh = false } = {}) {
  if (!catalogCache || refresh) {
    const [prodSnap, modelSnap] = await Promise.all([getDocs(collection(db, 'products')), getDocs(collection(db, 'productModels'))]);
    const products = {};
    prodSnap.forEach((p) => { products[p.id] = p.data(); });
    const list = [];
    modelSnap.forEach((m) => {
      const d = m.data();
      const p = products[d.productId] || {};
      list.push({
        modelId: m.id,
        label: [p.name, d.modelNumber].filter(Boolean).join(' — ') || m.id,
        brand: p.brand || '', category: p.categoryName || '',
        gstRate: typeof d.gstRate === 'number' ? d.gstRate : null,
        status: d.status || 'active', productStatus: p.status || 'active'
      });
    });
    list.sort((a, b) => a.label.localeCompare(b.label));
    catalogCache = list;
  }
  return includeInactive ? catalogCache : catalogCache.filter((c) => c.status === 'active');
}

// Prices this buyer can see from this seller: its own, then the standard.
async function loadVisiblePrices(db, seller, buyer, defaultKey) {
  const prices = {};
  const take = (snap) => snap.forEach((d) => { const x = d.data(); if (typeof x.price === 'number') prices[d.id] = x.price; });
  const results = await Promise.allSettled([
    getDocs(query(collection(db, 'priceLists'), where('seller', '==', seller), where('buyer', '==', buyer))),
    getDocs(query(collection(db, 'priceLists'), where('seller', '==', seller), where('buyer', '==', defaultKey)))
  ]);
  results.forEach((r) => { if (r.status === 'fulfilled') take(r.value); else console.warn('Price list read failed:', r.reason); });
  return prices;
}

function linesTableHtml(order) {
  const lines = Array.isArray(order.pricedLines) && order.pricedLines.length ? order.pricedLines : (order.lines || []);
  if (!lines.length) {
    // An older free-text order from before priced ordering.
    return `<div style="font-size:13px;">${esc(order.product || '—')} × ${esc(order.quantity ?? '—')} <span style="color:var(--stone);">(older order — no price list)</span></div>`;
  }
  const rows = lines.map((l) => `<tr>
      <td>${esc(l.label || l.modelId)}</td><td style="text-align:right;">${esc(l.qty)}</td>
      <td style="text-align:right;">${l.unitPrice != null ? inr(l.unitPrice) : '—'}</td>
      <td style="text-align:right;">${l.gstRate != null ? esc(l.gstRate) + '%' : '—'}</td>
      <td style="text-align:right;">${l.total != null ? inr(l.total) : '—'}</td></tr>`).join('');
  const t = order.totals;
  const totals = t ? `<tr><td colspan="4" style="text-align:right;color:var(--stone);">Taxable</td><td style="text-align:right;">${inr(t.taxable)}</td></tr>
      <tr><td colspan="4" style="text-align:right;color:var(--stone);">GST</td><td style="text-align:right;">${inr(t.gst)}</td></tr>
      <tr><td colspan="4" style="text-align:right;"><b>Total</b></td><td style="text-align:right;"><b>${inr(t.total)}</b></td></tr>` : '';
  const issues = order.pricing && order.pricing.issues && order.pricing.issues.length
    ? `<div style="color:var(--err, #B3261E);font-size:12.5px;margin-top:6px;"><b>Price incomplete:</b> ${order.pricing.issues.map(esc).join('; ')}</div>` : '';
  const pending = Array.isArray(order.lines) && !order.pricing ? `<div style="color:var(--stone);font-size:12.5px;margin-top:6px;">Pricing… (refresh in a few seconds)</div>` : '';
  return `<table style="width:100%;font-size:13px;"><thead><tr><th>Product</th><th style="text-align:right;">Qty</th><th style="text-align:right;">Unit price</th><th style="text-align:right;">GST</th><th style="text-align:right;">Line total</th></tr></thead>
    <tbody>${rows}${totals}</tbody></table>${issues}${pending}`;
}

function historyHtml(order) {
  const h = Array.isArray(order.statusHistory) ? order.statusHistory.slice() : [];
  if (!h.length) return '';
  h.sort((a, b) => (a.at?.seconds || 0) - (b.at?.seconds || 0));
  return `<div style="font-size:12px;color:var(--stone);margin-top:8px;">${h.map((x) =>
    `${when(x.at)} — ${esc(TP().STATUS_LABELS[x.to] || x.to)}${x.note ? ': ' + esc(x.note) : ''}`).join('<br>')}</div>`;
}

function dispatchHtml(order) {
  const d = order.dispatch;
  if (!d) return '';
  return `<div style="font-size:12.5px;margin-top:6px;"><b>Dispatch:</b> ${esc(d.transporter || '—')}${d.docket ? ' · Docket ' + esc(d.docket) : ''}${d.vehicle ? ' · ' + esc(d.vehicle) : ''}${d.date ? ' · ' + esc(d.date) : ''}</div>`;
}

// -----------------------------------------------------------------
// Buyer: place an order (dealer or distributor).
// opts: { db, user, collectionName, buyerFields, seller, defaultKey,
//         generateOrderId, onPlaced }
// -----------------------------------------------------------------
export async function renderOrderForm(el, opts) {
  const { db, user, collectionName, seller, defaultKey } = opts;
  el.innerHTML = `<div class="panel"><div class="panel-header"><h2>New order</h2></div><div class="panel-body">Loading catalogue…</div></div>`;
  let catalog, prices;
  try {
    [catalog, prices] = await Promise.all([loadCatalog(db), loadVisiblePrices(db, seller, user.uid, defaultKey)]);
  } catch (err) {
    console.error('Load catalogue failed:', err);
    el.innerHTML = `<div class="panel"><div class="panel-body" style="color:var(--err);">Couldn't load the product catalogue.</div></div>`;
    return;
  }
  const byId = Object.fromEntries(catalog.map((c) => [c.modelId, c]));
  const options = '<option value="">Select product…</option>' + catalog.map((c) => `<option value="${esc(c.modelId)}">${esc(c.label)}</option>`).join('');
  el.innerHTML = `
    <div class="panel"><div class="panel-header"><h2>New order</h2></div><div class="panel-body">
      <table style="width:100%;font-size:13px;"><thead><tr><th>Product</th><th style="width:90px;">Qty</th><th style="text-align:right;">Est. unit price</th><th style="text-align:right;">Est. total incl. GST</th><th></th></tr></thead>
        <tbody id="to-lines"></tbody></table>
      <button type="button" class="btn-secondary" id="to-add-line" style="margin-top:8px;">+ Add product</button>
      <div style="text-align:right;margin-top:10px;font-size:14px;">Estimated total: <b id="to-est-total">—</b></div>
      <div style="font-size:12px;color:var(--stone);text-align:right;">Estimate from your price list. The final price is set when the order is placed.</div>
      <div class="form-row" style="margin-top:12px;"><label>Notes</label><textarea id="to-notes" maxlength="1000" rows="2"></textarea></div>
      <div class="modal-error" id="to-error"></div>
      <div id="to-success" style="color:#1E7B34;font-weight:600;margin:6px 0;"></div>
      <button type="button" class="btn-primary" id="to-submit">Place order</button>
    </div></div>`;
  const tbody = el.querySelector('#to-lines');
  const errEl = el.querySelector('#to-error');
  const okEl = el.querySelector('#to-success');

  function estimate() {
    let total = 0, complete = true, any = false;
    tbody.querySelectorAll('tr').forEach((tr) => {
      const id = tr.querySelector('select').value;
      const qty = parseInt(tr.querySelector('input').value, 10) || 0;
      const c = byId[id];
      const own = prices[TP().priceDocId(seller, user.uid, id)];
      const std = prices[TP().priceDocId(seller, defaultKey, id)];
      const unit = typeof own === 'number' ? own : (typeof std === 'number' ? std : null);
      const unitCell = tr.querySelector('.to-unit');
      const totCell = tr.querySelector('.to-tot');
      if (!id) { unitCell.textContent = ''; totCell.textContent = ''; return; }
      any = true;
      if (unit === null || !c || c.gstRate === null) {
        unitCell.textContent = unit === null ? 'No price yet' : inr(unit);
        totCell.textContent = c && c.gstRate === null ? 'GST rate not set' : '—';
        complete = false; return;
      }
      const line = Math.round(unit * 100) * qty;
      const withGst = line + Math.round(line * c.gstRate / 100);
      unitCell.textContent = inr(unit);
      totCell.textContent = inr(withGst / 100);
      total += withGst;
    });
    el.querySelector('#to-est-total').textContent = !any ? '—' : complete ? inr(total / 100) : 'incomplete — Head Office/your distributor will price the missing items';
  }
  function addLine() {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><select style="width:100%;">${options}</select></td>
      <td><input type="number" min="1" step="1" value="1" style="width:80px;"></td>
      <td class="to-unit" style="text-align:right;"></td><td class="to-tot" style="text-align:right;"></td>
      <td><button type="button" class="btn-secondary" title="Remove">✕</button></td>`;
    tr.querySelector('select').addEventListener('change', estimate);
    tr.querySelector('input').addEventListener('input', estimate);
    tr.querySelector('button').addEventListener('click', () => { tr.remove(); estimate(); });
    tbody.appendChild(tr);
  }
  addLine();
  el.querySelector('#to-add-line').addEventListener('click', () => {
    if (tbody.children.length >= TP().MAX_LINES) return;
    addLine();
  });

  el.querySelector('#to-submit').addEventListener('click', async () => {
    errEl.classList.remove('show'); errEl.textContent = ''; okEl.textContent = '';
    const lines = [];
    tbody.querySelectorAll('tr').forEach((tr) => {
      const modelId = tr.querySelector('select').value;
      const qty = Number(tr.querySelector('input').value);
      if (modelId) lines.push({ modelId, qty });
    });
    const problem = TP().validateLines(lines);
    if (problem) { errEl.textContent = problem; errEl.classList.add('show'); return; }
    const btn = el.querySelector('#to-submit');
    btn.disabled = true; btn.textContent = 'Placing…';
    try {
      const orderId = await opts.generateOrderId();
      await addDoc(collection(db, collectionName), {
        orderId, ...opts.buyerFields, lines,
        notes: el.querySelector('#to-notes').value.trim(),
        status: 'placed', createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      });
      okEl.textContent = `Placed — ${orderId}. It's being priced and sent for approval.`;
      tbody.innerHTML = ''; addLine(); estimate();
      el.querySelector('#to-notes').value = '';
      if (opts.onPlaced) opts.onPlaced();
    } catch (err) {
      console.error('Place order failed:', err);
      errEl.textContent = 'Could not place this order. Check console for details.';
      errEl.classList.add('show');
    }
    btn.disabled = false; btn.textContent = 'Place order';
  });
}

// -----------------------------------------------------------------
// Buyer: my orders, with a Cancel button while still awaiting approval.
// opts: { db, collectionName, ownerField, uid }
// -----------------------------------------------------------------
export async function renderMyOrders(el, opts) {
  const { db, collectionName, ownerField, uid } = opts;
  el.innerHTML = `<div class="panel"><div class="panel-header"><h2>My orders</h2></div><div class="panel-body" id="to-my-body">Loading…</div></div>`;
  const body = el.querySelector('#to-my-body');
  try {
    const snap = await getDocs(query(collection(db, collectionName), where(ownerField, '==', uid)));
    const orders = [];
    snap.forEach((d) => orders.push({ id: d.id, ...d.data() }));
    orders.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    if (!orders.length) { body.innerHTML = `<div class="empty-row">No orders yet.</div>`; return; }
    body.innerHTML = orders.map((o) => `
      <div style="border:1px solid var(--hairline, #e3e3e3);border-radius:8px;padding:12px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
          <div><b>${esc(o.orderId || o.id)}</b> · ${when(o.createdAt)}${o.distributorName ? ' · via ' + esc(o.distributorName) : ''}</div>
          <div>${statusPill(o.status)} ${o.totals ? '<b style="margin-left:8px;">' + inr(o.totals.total) + '</b>' : ''}</div>
        </div>
        <div style="margin-top:8px;">${linesTableHtml(o)}</div>
        ${o.notes ? `<div style="font-size:12.5px;color:var(--stone);margin-top:6px;">Notes: ${esc(o.notes)}</div>` : ''}
        ${o.statusNote && ['rejected', 'cancelled'].includes(o.status) ? `<div style="font-size:12.5px;margin-top:6px;">Reason: ${esc(o.statusNote)}</div>` : ''}
        ${dispatchHtml(o)}
        ${(TP().BUYER_NEXT[o.status] || []).includes('cancelled') ? `<button type="button" class="btn-secondary to-cancel" data-id="${esc(o.id)}" style="margin-top:8px;">Cancel order</button>` : ''}
      </div>`).join('');
    body.querySelectorAll('.to-cancel').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Cancel this order?')) return;
      b.disabled = true;
      try {
        await updateDoc(doc(db, collectionName, b.dataset.id), { status: 'cancelled', statusNote: 'Cancelled by buyer', updatedAt: serverTimestamp() });
      } catch (err) {
        console.error('Cancel failed:', err);
        alert('Could not cancel — it may already have been approved. Refresh and check.');
      }
      renderMyOrders(el, opts);
    }));
  } catch (err) {
    console.error('Load orders failed:', err);
    body.innerHTML = `<div style="color:var(--err);">Couldn't load your orders.</div>`;
  }
}

// -----------------------------------------------------------------
// Seller: approval & fulfilment queue.
// opts: { db, mode: 'company' | 'distributor', uid }
//   company     — Direct dealers' orders + distributors' own orders
//   distributor — orders from this distributor's dealers
// -----------------------------------------------------------------
const QUEUE_TABS = [
  { key: 'placed', label: 'Awaiting approval' }, { key: 'confirmed', label: 'Approved — to dispatch' },
  { key: 'dispatched', label: 'Dispatched' }, { key: 'closed', label: 'Closed' }
];
export async function renderOrderQueue(el, opts) {
  const { db, mode, uid } = opts;
  const tab = opts.tab || 'placed';
  el.innerHTML = `<div class="panel"><div class="panel-header"><h2>${mode === 'company' ? 'Dealer & distributor orders' : 'Orders from your dealers'}</h2></div>
    <div class="panel-body"><div id="to-tabs" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;"></div><div id="to-q-body">Loading…</div></div></div>`;
  const tabsEl = el.querySelector('#to-tabs');
  tabsEl.innerHTML = QUEUE_TABS.map((t) => `<button type="button" class="btn-secondary" data-tab="${t.key}" style="${t.key === tab ? 'background:var(--blue);color:#fff;border-color:var(--blue);' : ''}">${t.label}</button>`).join('');
  tabsEl.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => renderOrderQueue(el, { ...opts, tab: b.dataset.tab })));
  const body = el.querySelector('#to-q-body');
  try {
    const sources = mode === 'company'
      ? [['dealerOrders', query(collection(db, 'dealerOrders'), where('distributorUid', '==', ''))], ['distributorOrders', collection(db, 'distributorOrders')]]
      : [['dealerOrders', query(collection(db, 'dealerOrders'), where('distributorUid', '==', uid))]];
    const snaps = await Promise.all(sources.map(([, q]) => getDocs(q)));
    let orders = [];
    snaps.forEach((snap, i) => snap.forEach((d) => orders.push({ id: d.id, coll: sources[i][0], ...d.data() })));
    orders = orders.filter((o) => (tab === 'closed' ? ['delivered', 'rejected', 'cancelled'].includes(o.status) : o.status === tab));
    orders.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
    if (tab === 'closed') orders.reverse();
    if (!orders.length) { body.innerHTML = `<div class="empty-row">Nothing here.</div>`; return; }
    body.innerHTML = orders.map((o, i) => {
      const buyer = o.coll === 'distributorOrders' ? `Distributor: ${esc(o.distributorName || o.distributorEmail || o.distributorUid)}` : `Dealer: ${esc(o.dealerName || o.dealerEmail || o.dealerUid)}`;
      const next = TP().SELLER_NEXT[o.status] || [];
      const priced = !Array.isArray(o.lines) || (o.pricing && o.pricing.status === 'ok');
      const btn = (to, label, cls) => `<button type="button" class="${cls} to-act" data-i="${i}" data-to="${to}">${label}</button>`;
      const actions = [
        next.includes('confirmed') ? (priced ? btn('confirmed', 'Approve', 'btn-primary') : `<span style="font-size:12px;color:var(--stone);">Can't approve until every line is priced</span>`) : '',
        next.includes('dispatched') ? btn('dispatched', 'Mark dispatched', 'btn-primary') : '',
        next.includes('delivered') ? btn('delivered', 'Mark delivered', 'btn-primary') : '',
        next.includes('rejected') ? btn('rejected', 'Reject', 'btn-secondary') : '',
        next.includes('cancelled') && o.status !== 'placed' ? btn('cancelled', 'Cancel', 'btn-secondary') : '',
        o.status === 'placed' && Array.isArray(o.lines) && !priced ? `<button type="button" class="btn-secondary to-reprice" data-i="${i}">Re-price</button>` : ''
      ].filter(Boolean).join(' ');
      return `<div style="border:1px solid var(--hairline, #e3e3e3);border-radius:8px;padding:12px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
          <div><b>${esc(o.orderId || o.id)}</b> · ${buyer} · ${when(o.createdAt)}</div>
          <div>${statusPill(o.status)} ${o.totals ? '<b style="margin-left:8px;">' + inr(o.totals.total) + '</b>' : ''}</div>
        </div>
        <div style="margin-top:8px;">${linesTableHtml(o)}</div>
        ${o.notes ? `<div style="font-size:12.5px;color:var(--stone);margin-top:6px;">Notes: ${esc(o.notes)}</div>` : ''}
        ${o.statusNote ? `<div style="font-size:12.5px;margin-top:6px;">Note: ${esc(o.statusNote)}</div>` : ''}
        ${dispatchHtml(o)}${historyHtml(o)}
        ${actions ? `<div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;">${actions}</div>` : ''}
      </div>`;
    }).join('');
    body.querySelectorAll('.to-act').forEach((b) => b.addEventListener('click', async () => {
      const o = orders[Number(b.dataset.i)];
      const to = b.dataset.to;
      const update = { status: to, updatedAt: serverTimestamp() };
      if (to === 'rejected' || to === 'cancelled') {
        const reason = prompt(`Reason for ${to === 'rejected' ? 'rejecting' : 'cancelling'} ${o.orderId || ''} (shown to the buyer):`, '');
        if (reason === null) return;
        update.statusNote = reason.trim().slice(0, 300);
      } else if (to === 'dispatched') {
        const transporter = prompt('Transporter / courier name:', '');
        if (transporter === null) return;
        const docket = prompt('Docket / LR number (optional):', '') || '';
        update.dispatch = { transporter: transporter.trim().slice(0, 100), docket: docket.trim().slice(0, 60), date: new Date().toISOString().slice(0, 10) };
        update.statusNote = '';
      } else {
        if (!confirm(`${to === 'confirmed' ? 'Approve' : 'Mark as delivered'} ${o.orderId || ''}${o.totals ? ' — ' + inr(o.totals.total) : ''}?`)) return;
        update.statusNote = '';
      }
      b.disabled = true;
      try {
        await updateDoc(doc(db, o.coll, o.id), update);
      } catch (err) {
        console.error('Order update failed:', err);
        alert('Could not update this order — it may have changed. Refresh and try again.');
      }
      renderOrderQueue(el, opts);
    }));
    body.querySelectorAll('.to-reprice').forEach((b) => b.addEventListener('click', async () => {
      const o = orders[Number(b.dataset.i)];
      b.disabled = true; b.textContent = 'Re-pricing…';
      try {
        await updateDoc(doc(db, o.coll, o.id), { repriceRequestedAt: serverTimestamp(), updatedAt: serverTimestamp() });
        setTimeout(() => renderOrderQueue(el, opts), 4000);
      } catch (err) {
        console.error('Re-price failed:', err);
        alert('Could not request a re-price.');
        b.disabled = false; b.textContent = 'Re-price';
      }
    }));
  } catch (err) {
    console.error('Load order queue failed:', err);
    body.innerHTML = `<div style="color:var(--err);">Couldn't load orders. Check console for details.</div>`;
  }
}

// -----------------------------------------------------------------
// Seller: price list editor.
// opts: { db, user, seller: 'company' | <distributorUid>, buyers: [{ key, label }] }
// -----------------------------------------------------------------
export async function renderPriceEditor(el, opts) {
  const { db, user, seller, buyers } = opts;
  const buyerKey = opts.buyerKey || buyers[0].key;
  el.innerHTML = `<div class="panel"><div class="panel-header"><h2>Trade price list</h2></div><div class="panel-body">
    <div class="form-row"><label>Prices for</label><select id="to-pl-buyer">${buyers.map((b) => `<option value="${esc(b.key)}" ${b.key === buyerKey ? 'selected' : ''}>${esc(b.label)}</option>`).join('')}</select></div>
    <div style="font-size:12.5px;color:var(--stone);margin:4px 0 10px;">Prices exclude GST. A price set for one account overrides the standard price for that account; leave a box empty to use the standard price (or, on the standard list, to not sell that model).</div>
    <div id="to-pl-body">Loading…</div></div></div>`;
  el.querySelector('#to-pl-buyer').addEventListener('change', (e) => renderPriceEditor(el, { ...opts, buyerKey: e.target.value }));
  const body = el.querySelector('#to-pl-body');
  try {
    const [catalog, snap] = await Promise.all([
      loadCatalog(db, { includeInactive: true }),
      getDocs(query(collection(db, 'priceLists'), where('seller', '==', seller), where('buyer', '==', buyerKey)))
    ]);
    const current = {};
    snap.forEach((d) => { current[d.data().modelId] = d.data().price; });
    if (!catalog.length) { body.innerHTML = `<div class="empty-row">No product models in the catalogue yet.</div>`; return; }
    body.innerHTML = `<table style="width:100%;font-size:13px;"><thead><tr><th>Product — Model</th><th>GST</th><th>Status</th><th style="width:160px;">Price excl. GST (₹)</th></tr></thead><tbody>
      ${catalog.map((c) => `<tr><td>${esc(c.label)}</td><td>${c.gstRate !== null ? esc(c.gstRate) + '%' : '<span style="color:var(--err);">not set</span>'}</td><td>${esc(c.status)}</td>
        <td><input type="number" min="0" step="0.01" class="to-pl-price" data-model="${esc(c.modelId)}" value="${current[c.modelId] ?? ''}" style="width:140px;"></td></tr>`).join('')}
      </tbody></table>
      <div class="modal-error" id="to-pl-error"></div><div id="to-pl-ok" style="color:#1E7B34;font-weight:600;margin:6px 0;"></div>
      <button type="button" class="btn-primary" id="to-pl-save" style="margin-top:10px;">Save prices</button>`;
    el.querySelector('#to-pl-save').addEventListener('click', async () => {
      const btn = el.querySelector('#to-pl-save');
      const errEl = el.querySelector('#to-pl-error'); const okEl = el.querySelector('#to-pl-ok');
      errEl.classList.remove('show'); okEl.textContent = '';
      const writes = [];
      let bad = null;
      el.querySelectorAll('.to-pl-price').forEach((inp) => {
        const modelId = inp.dataset.model;
        const raw = inp.value.trim();
        const before = current[modelId];
        const ref = doc(db, 'priceLists', TP().priceDocId(seller, buyerKey, modelId));
        if (raw === '') { if (before !== undefined) writes.push(deleteDoc(ref)); return; }
        const price = Math.round(Number(raw) * 100) / 100;
        if (!(price >= 0)) { bad = 'Prices must be 0 or more.'; return; }
        if (price !== before) writes.push(setDoc(ref, { seller, buyer: buyerKey, modelId, price, updatedAt: serverTimestamp(), updatedBy: user.email || user.uid }));
      });
      if (bad) { errEl.textContent = bad; errEl.classList.add('show'); return; }
      if (!writes.length) { okEl.textContent = 'No changes.'; return; }
      btn.disabled = true; btn.textContent = 'Saving…';
      const results = await Promise.allSettled(writes);
      const failed = results.filter((r) => r.status === 'rejected');
      if (failed.length) {
        console.error('Some prices failed to save:', failed.map((f) => f.reason));
        errEl.textContent = `${failed.length} of ${writes.length} changes failed to save. Check console for details.`;
        errEl.classList.add('show');
      } else okEl.textContent = `Saved ${writes.length} change${writes.length > 1 ? 's' : ''}.`;
      btn.disabled = false; btn.textContent = 'Save prices';
      setTimeout(() => renderPriceEditor(el, { ...opts, buyerKey }), failed.length ? 3000 : 800);
    });
  } catch (err) {
    console.error('Load price list failed:', err);
    body.innerHTML = `<div style="color:var(--err);">Couldn't load the price list. Check console for details.</div>`;
  }
}

// Accounts a seller can price for.
export async function companyBuyers(db) {
  const [dealers, dists] = await Promise.all([
    getDocs(query(collection(db, 'users'), where('role', '==', 'dealer'))),
    getDocs(query(collection(db, 'users'), where('role', '==', 'distributor')))
  ]);
  const list = [{ key: 'default-dealer', label: 'Standard — all Direct dealers' }, { key: 'default-distributor', label: 'Standard — all distributors' }];
  dealers.forEach((d) => {
    const u = d.data();
    if (u.distributionType === 'underDistributor' && u.distributorUid) return; // priced by their distributor
    list.push({ key: d.id, label: `Dealer: ${u.name || u.email || d.id}` });
  });
  dists.forEach((d) => { const u = d.data(); list.push({ key: d.id, label: `Distributor: ${u.name || u.email || d.id}` }); });
  return list;
}
export async function distributorBuyers(db, uid) {
  const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'dealer'), where('distributorUid', '==', uid)));
  const list = [{ key: 'default', label: 'Standard — all my dealers' }];
  snap.forEach((d) => { const u = d.data(); list.push({ key: d.id, label: `Dealer: ${u.name || u.email || d.id}` }); });
  return list;
}
