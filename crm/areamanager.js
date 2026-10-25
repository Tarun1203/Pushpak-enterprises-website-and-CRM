// Area Service Manager portal. Super Admin powers inside the manager's own
// districts (users/{uid}.districtsCovered): centers, technicians, coverage,
// every ticket (route, assign, reassign), SLA, stock, spare requests,
// center and technician approvals, reports and performance.
// Tickets are matched by their `district` (stamped server-side from the
// pincode master); centers by the district on their profile.

/* ------------------------------------------------------------------ */
/* Pure helpers (unit-tested in tests/unit/areamanager.test.mjs)        */
/* ------------------------------------------------------------------ */
export const OPEN = ['new', 'assigned', 'assigned_to_center', 'accepted', 'on_the_way', 'at_customer', 'in_progress', 'waiting_spare', 'reassignment_required', 'reopened'];
export const DONE = ['completed', 'verification', 'closed'];
export const SLA_DEFAULT = { dueSoonHours: 24, breachedHours: 48 };
const lc = (v) => String(v == null ? '' : v).trim().toLowerCase();
export const ms = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : t && typeof t.seconds === 'number' ? t.seconds * 1000 : typeof t === 'number' ? t : t ? Date.parse(t) || 0 : 0);

export function sameDistricts(list, districts) {
  const mine = new Set((districts || []).map(lc));
  return (list || []).some((d) => mine.has(lc(d)));
}

// Most specific SLA rule wins: district, then service type, then the default.
export function slaRuleFor(rules, district, type) {
  const r = (rules || []).find((x) => x.matchType === 'district' && lc(x.matchValue) === lc(district))
    || (rules || []).find((x) => x.matchType === 'servicetype' && lc(x.matchValue) === lc(type));
  return { dueSoonHours: Number(r && r.dueSoonHours) || SLA_DEFAULT.dueSoonHours, breachedHours: Number(r && r.breachedHours) || SLA_DEFAULT.breachedHours, name: r ? r.name || r.matchValue : 'Default' };
}
// 'ok' | 'due_soon' | 'breached' | null (closed)
export function slaState(ticket, rules, now = Date.now()) {
  if (!OPEN.includes(ticket.status)) return null;
  const since = ms(ticket.createdAt);
  if (!since) return 'ok';
  const h = (now - since) / 3600000;
  const r = slaRuleFor(rules, ticket.district, ticket.type);
  return h >= r.breachedHours ? 'breached' : h >= r.dueSoonHours ? 'due_soon' : 'ok';
}

// Per pincode of the manager's districts: who covers it.
export function coverage(pincodes, centers, directTechs) {
  return (pincodes || []).map((p) => {
    const pin = p.id || p.pincode;
    const byPin = (list) => list.filter((c) => (c.pincodesCovered || []).includes(pin));
    const byDist = (list) => list.filter((c) => (c.districtsCovered || []).map(lc).includes(lc(p.district)));
    const cs = byPin(centers).length ? byPin(centers) : byDist(centers);
    const ts = byPin(directTechs).length ? byPin(directTechs) : byDist(directTechs);
    return { pincode: pin, area: p.area || p.city || '', district: p.district || '', centers: cs.map((c) => c.name || c.email || c.uid), technicians: ts.map((t) => t.name || t.email || t.uid), covered: cs.length + ts.length > 0 };
  });
}

// Counts per handler (center or technician): assigned, open, done, average hours to close.
export function performance(tickets, keyOf) {
  const rows = new Map();
  (tickets || []).forEach((t) => {
    const k = keyOf(t); if (!k) return;
    const r = rows.get(k) || { key: k, total: 0, open: 0, done: 0, hours: 0, timed: 0 };
    r.total++;
    if (OPEN.includes(t.status)) r.open++;
    if (DONE.includes(t.status)) {
      r.done++;
      const a = ms(t.createdAt), b = ms(t.closedAt) || ms(t.updatedAt);
      if (a && b && b > a) { r.hours += (b - a) / 3600000; r.timed++; }
    }
    rows.set(k, r);
  });
  return Array.from(rows.values()).map((r) => ({ ...r, avgHours: r.timed ? Math.round(r.hours / r.timed) : null, completion: r.total ? Math.round((r.done / r.total) * 100) : 0 }))
    .sort((a, b) => b.total - a.total || String(a.key).localeCompare(String(b.key)));
}

export function csv(rows) {
  const q = (v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return rows.map((r) => r.map(q).join(',')).join('\n');
}

/* ------------------------------------------------------------------ */
/* The portal                                                          */
/* ------------------------------------------------------------------ */
const NICE = { new: 'New', assigned: 'Assigned', assigned_to_center: 'Sent to center', accepted: 'Accepted', on_the_way: 'On the way', at_customer: 'At customer', in_progress: 'In progress', waiting_spare: 'Waiting for spare', reassignment_required: 'Needs reassignment', reopened: 'Re-opened', completed: 'Completed', verification: 'Verification', closed: 'Closed', cancelled: 'Cancelled' };
const nice = (s) => NICE[s] || String(s || '—').replace(/_/g, ' ');
const PILL = (s) => (DONE.includes(s) ? 'completed' : s === 'cancelled' ? 'cancelled' : s === 'new' || s === 'reassignment_required' ? 'new' : 'assigned');

export function mountAreaManager(api) {
  const { db, fs, user, profile, contentEl, pageSub, escapeHtml: esc, notify } = api;
  const { collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, query, where, serverTimestamp } = fs;
  const districts = (profile.districtsCovered || []).filter(Boolean);
  const me = { uid: user.uid, email: user.email || '', name: profile.displayName || profile.name || user.email || 'Area Manager' };
  let cache = null;

  const chunk = (arr, n = 30) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
  async function inDistricts(coll) {
    if (!districts.length) return [];
    const out = [];
    for (const part of chunk(districts)) {
      const snap = await getDocs(query(collection(db, coll), where('district', 'in', part)));
      snap.forEach((d) => out.push({ id: d.id, coll, ...d.data() }));
    }
    return out;
  }
  const safe = (p, fallback) => p.catch((e) => { console.warn('Area data not loaded:', e && e.message); return fallback; });

  async function load(force) {
    if (cache && !force) return cache;
    const [profiles, centerUsers, techUsers, centerReqs, jobs, pubs, slaSnap] = await Promise.all([
      safe(inDistricts('serviceCenterProfiles'), []),
      safe(getDocs(query(collection(db, 'users'), where('role', '==', 'servicecenter'))).then((s) => s.docs.map((d) => ({ uid: d.id, ...d.data() }))), []),
      safe(getDocs(query(collection(db, 'users'), where('role', '==', 'technician'))).then((s) => s.docs.map((d) => ({ uid: d.id, ...d.data() }))), []),
      safe(inDistricts('centerRequests'), []),
      safe(inDistricts('serviceJobs'), []),
      safe(inDistricts('publicServiceRequests'), []),
      safe(getDocs(collection(db, 'slaRules')).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))), [])
    ]);
    const profById = new Map(profiles.map((p) => [p.id, p]));
    const centers = centerUsers.filter((c) => profById.has(c.uid) || sameDistricts(c.districtsCovered, districts))
      .map((c) => ({ ...c, profile: profById.get(c.uid) || null, name: (profById.get(c.uid) || {}).displayName || c.name || c.email, district: (profById.get(c.uid) || {}).district || (c.districtsCovered || [])[0] || '' }));
    const roster = [];
    await Promise.all(centers.filter((c) => c.profile).map(async (c) => {
      const s = await safe(getDocs(query(collection(db, 'centerTechnicians'), where('serviceCenterUid', '==', c.uid))), { docs: [] });
      s.docs.forEach((d) => roster.push({ id: d.id, ...d.data(), centerName: c.name }));
    }));
    const techById = new Map(techUsers.map((t) => [t.uid, t]));
    const directTechs = techUsers.filter((t) => sameDistricts(t.districtsCovered, districts));
    const tickets = [...centerReqs, ...jobs].sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
    cache = { profiles, centers, roster, techById, directTechs, techUsers, tickets, pubs: pubs.sort((a, b) => ms(b.createdAt) - ms(a.createdAt)), sla: slaSnap };
    return cache;
  }

  /* ---------- small UI helpers ---------- */
  const panel = (title, body, actions) => `<div class="panel" style="margin-bottom:20px;"><div class="panel-header" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;"><h2>${title}</h2>${actions || ''}</div><div class="panel-body" style="padding:0;">${body}</div></div>`;
  const table = (heads, rows, empty) => `<div class="table-wrap" style="overflow-x:auto;"><table><thead><tr>${heads.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.join('') : `<tr><td colspan="${heads.length}" class="empty-row">${esc(empty || 'Nothing here.')}</td></tr>`}</tbody></table></div>`;
  const pill = (s) => `<span class="status-pill ${PILL(s)}">${esc(nice(s))}</span>`;
  const when = (t) => { const m = ms(t); return m ? new Date(m).toLocaleDateString() : '—'; };
  const loading = () => { contentEl.innerHTML = '<div class="panel"><div class="panel-body empty-row">Loading your area…</div></div>'; };
  const noArea = () => { contentEl.innerHTML = panel('No districts assigned', `<p style="padding:16px;">Super Admin has not given you any districts yet. Ask them to edit your account under Users &amp; Access and add the districts you manage.</p>`); };
  const fail = (e) => { console.error(e); contentEl.innerHTML = panel('Could not load', `<p style="padding:16px;color:var(--err);">Could not load your area. Check your connection, then try again. If this keeps happening, ask Super Admin to publish the latest Firestore rules.</p>`); };
  const open = (t) => OPEN.includes(t.status);
  const ticketId = (t) => t.requestId || t.jobId || t.id;
  async function logStatus(coll, id, status, note) {
    try { await addDoc(collection(db, coll, id, 'statusLog'), { status, note: note || '', changedByEmail: me.email, createdAt: serverTimestamp() }); } catch (e) { console.warn('Status log write failed (non-blocking):', e.message); }
  }
  async function tell(uid, title, message) {
    if (!uid) return;
    try { await addDoc(collection(db, 'notifications'), { recipientType: 'uid', recipientValue: uid, title, message, read: false, createdAt: serverTimestamp() }); } catch (e) { /* optional */ }
  }
  function modal(title, bodyHtml, onReady) {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay show am-modal';
    ov.innerHTML = `<div class="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="am-mh"><button type="button" class="modal-close" aria-label="Close">&times;</button><h3 id="am-mh">${esc(title)}</h3>${bodyHtml}<div class="am-msg" role="status" aria-live="polite" style="font-size:13px;margin-top:10px;"></div></div>`;
    const close = () => ov.remove();
    ov.querySelector('.modal-close').addEventListener('click', close);
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
    ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    document.body.appendChild(ov);
    const msg = (t, err) => { const m = ov.querySelector('.am-msg'); m.textContent = t; m.style.color = err ? 'var(--err)' : 'var(--ok, #12804A)'; };
    if (onReady) onReady(ov, close, msg);
    return ov;
  }

  /* ---------- screens ---------- */
  async function dashboard() {
    if (!districts.length) return noArea();
    loading();
    try {
      const a = await load(true);
      const openT = a.tickets.filter(open);
      const unrouted = a.pubs.filter((p) => p.status === 'new');
      const breached = openT.filter((t) => slaState(t, a.sla) === 'breached').length;
      const pendingCenters = a.centers.filter((c) => c.profile && /PENDING/.test(String(c.profile.status || ''))).length;
      const pendingTechs = a.roster.filter((t) => !t.employmentStatus || t.employmentStatus === 'ON_PROBATION').length;
      const card = (n, l, nav) => `<button type="button" class="stat-card am-jump" data-nav="${nav}" style="text-align:left;cursor:pointer;border:1px solid var(--hairline);"><div class="label">${esc(l)}</div><div class="value">${n}</div></button>`;
      contentEl.innerHTML = `<div class="stats" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-bottom:20px;">
        ${card(a.centers.length, 'Service centers', 'servicecenters')}${card(a.roster.length + a.directTechs.length, 'Technicians', 'technicians')}
        ${card(openT.length, 'Open tickets', 'servicerequests')}${card(unrouted.length, 'Website requests to route', 'routing')}
        ${card(breached, 'SLA breached', 'sla')}${card(pendingCenters + pendingTechs, 'Waiting for your approval', pendingCenters ? 'approvals-sc' : 'approvals-onboarding')}</div>
        ${panel('Your districts', `<p style="padding:14px 16px;">${districts.map((d) => `<span class="status-pill assigned" style="margin:2px;">${esc(d)}</span>`).join(' ')}</p>`)}
        ${panel('Latest tickets', table(['Ticket', 'Customer', 'District', 'Status', 'Raised'], a.tickets.slice(0, 8).map((t) => `<tr><td>${esc(ticketId(t))}</td><td>${esc(t.customerName || '—')}</td><td>${esc(t.district || '—')}</td><td>${pill(t.status)}</td><td>${when(t.createdAt)}</td></tr>`), 'No tickets in your districts yet.'))}`;
      contentEl.querySelectorAll('.am-jump').forEach((b) => b.addEventListener('click', () => api.go(b.dataset.nav)));
    } catch (e) { fail(e); }
  }

  async function centersScreen() {
    if (!districts.length) return noArea();
    loading();
    try {
      const a = await load(true);
      contentEl.innerHTML = panel('Service centers in your districts', table(['Center', 'District', 'Status', 'Phone', 'Technicians', 'Open tickets', 'Code'],
        a.centers.map((c) => `<tr><td><b>${esc(c.name)}</b><div style="font-size:12px;color:var(--stone);">${esc(c.email || '')}</div></td><td>${esc(c.district || '—')}</td><td>${esc((c.profile && c.profile.status) || '—')}</td><td>${esc((c.profile && c.profile.officialMobile) || c.phone || '—')}</td><td>${a.roster.filter((t) => t.serviceCenterUid === c.uid).length}</td><td>${a.tickets.filter((t) => t.serviceCenterUid === c.uid && open(t)).length}</td><td>${esc((c.profile && c.profile.serviceCenterCode) || '—')}</td></tr>`), 'No service centers in your districts yet.'));
    } catch (e) { fail(e); }
  }

  async function techniciansScreen() {
    if (!districts.length) return noArea();
    loading();
    try {
      const a = await load(true);
      const openFor = (uid) => a.tickets.filter((t) => t.technicianUid === uid && open(t)).length;
      contentEl.innerHTML = panel('Technicians at your service centers', table(['Technician', 'Center', 'Status', 'Phone', 'Open jobs'],
        a.roster.map((t) => `<tr><td><b>${esc(t.name || t.technicianName || '—')}</b><div style="font-size:12px;color:var(--stone);">${esc(t.technicianCode || '')}</div></td><td>${esc(t.centerName || '—')}</td><td>${esc(t.employmentStatus || 'Not approved yet')}</td><td>${esc(t.phone || '—')}</td><td>${t.technicianUid ? openFor(t.technicianUid) : '—'}</td></tr>`), 'No technicians on the rosters of your centers.'))
        + panel('Technicians working directly (no service center)', table(['Technician', 'Areas', 'Open jobs'],
          a.directTechs.map((t) => `<tr><td><b>${esc(t.name || t.email)}</b></td><td>${esc([...(t.districtsCovered || []), ...(t.pincodesCovered || [])].join(', ') || '—')}</td><td>${openFor(t.uid)}</td></tr>`), 'None — give a technician districts or pincodes under Users & Access (Super Admin) to make them a direct technician.'));
    } catch (e) { fail(e); }
  }

  async function coverageScreen() {
    if (!districts.length) return noArea();
    loading();
    try {
      const a = await load(true);
      const pins = [];
      for (const part of chunk(districts)) {
        const s = await getDocs(query(collection(db, 'pincodes'), where('district', 'in', part)));
        s.forEach((d) => pins.push({ id: d.id, ...d.data() }));
      }
      const rows = coverage(pins.sort((x, y) => x.id.localeCompare(y.id)), a.centers, a.directTechs);
      const gaps = rows.filter((r) => !r.covered).length;
      contentEl.innerHTML = panel(`Coverage — ${rows.length} pincodes, ${gaps} with nobody`, table(['Pincode', 'Area', 'District', 'Service centers', 'Direct technicians'],
        rows.map((r) => `<tr${r.covered ? '' : ' style="background:#FFF4F2;"'}><td><b>${esc(r.pincode)}</b></td><td>${esc(r.area || '—')}</td><td>${esc(r.district)}</td><td>${esc(r.centers.join(', ') || '—')}</td><td>${r.technicians.length ? esc(r.technicians.join(', ')) : r.covered ? '—' : '<span style="color:var(--err);font-weight:600;">Nobody covers this pincode</span>'}</td></tr>`),
        'No pincodes for your districts in the Pincode Master yet.'));
    } catch (e) { fail(e); }
  }

  /* --- tickets: list + actions (assign / reassign) --- */
  let filter = 'open';
  async function requestsScreen() {
    if (!districts.length) return noArea();
    loading();
    try {
      const a = await load(true);
      const list = a.tickets.filter((t) => filter === 'all' || (filter === 'open' ? open(t) : DONE.includes(t.status)));
      contentEl.innerHTML = panel('Service requests in your districts', table(['Ticket', 'Customer', 'Product', 'District', 'Center', 'Technician', 'Status', 'SLA', ''],
        list.map((t, i) => { const st = slaState(t, a.sla); return `<tr><td><b>${esc(ticketId(t))}</b><div style="font-size:12px;color:var(--stone);">${t.coll === 'serviceJobs' ? 'Direct technician job' : 'Center ticket'} · ${when(t.createdAt)}</div></td><td>${esc(t.customerName || '—')}<div style="font-size:12px;color:var(--stone);">${esc(t.customerPhone || '')}</div></td><td>${esc(t.product || t.category || '—')}</td><td>${esc(t.district || '—')}</td><td>${esc(t.serviceCenterName || '—')}</td><td>${esc(t.technicianName || '—')}</td><td>${pill(t.status)}</td><td>${st === 'breached' ? '<span class="status-pill cancelled">Breached</span>' : st === 'due_soon' ? '<span class="status-pill new">Due soon</span>' : st ? 'On time' : '—'}</td><td>${open(t) ? `<button type="button" class="btn-secondary am-act" data-i="${i}">Assign / reassign</button>` : ''}</td></tr>`; }),
        filter === 'open' ? 'No open tickets in your districts.' : 'No tickets.'),
      `<div role="group" aria-label="Show" style="display:flex;gap:6px;">${[['open', 'Open'], ['done', 'Done'], ['all', 'All']].map(([v, l]) => `<button type="button" class="${filter === v ? 'btn-primary' : 'btn-secondary'} am-filter" data-f="${v}" aria-pressed="${filter === v}">${l}</button>`).join('')}</div>`);
      contentEl.querySelectorAll('.am-filter').forEach((b) => b.addEventListener('click', () => { filter = b.dataset.f; requestsScreen(); }));
      contentEl.querySelectorAll('.am-act').forEach((b) => b.addEventListener('click', () => ticketActions(list[Number(b.dataset.i)])));
    } catch (e) { fail(e); }
  }

  function techOptions(a, t) {
    const roster = a.roster.filter((r) => r.technicianUid && (!t.serviceCenterUid || r.serviceCenterUid === t.serviceCenterUid) && (!r.employmentStatus || ['ACTIVE', 'ON_PROBATION'].includes(r.employmentStatus)));
    const opts = roster.map((r) => [r.technicianUid, `${r.name || r.technicianName || 'Technician'} — ${r.centerName}`]);
    a.directTechs.forEach((d) => { if (!opts.some(([u]) => u === d.uid)) opts.push([d.uid, `${d.name || d.email} — direct technician`]); });
    return opts;
  }
  function ticketActions(t) {
    const a = cache;
    const opts = techOptions(a, t);
    const centers = a.centers.filter((c) => c.profile && !/SUSPENDED|INACTIVE|TERMINATED/.test(String(c.profile.status || '')));
    modal(`${ticketId(t)} — ${t.customerName || 'customer'}`, `
      <p style="font-size:13px;color:var(--stone);margin:0 0 12px;">${esc(t.product || '')}${t.issue ? ' · ' + esc(t.issue) : ''} · ${esc(t.district || '')} · now ${esc(nice(t.status))}${t.technicianName ? ' with ' + esc(t.technicianName) : ''}</p>
      <div class="form-row"><label for="am-tech">Assign technician</label><select id="am-tech"><option value="">Select…</option>${opts.map(([u, l]) => `<option value="${esc(u)}"${u === t.technicianUid ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
      <button type="button" class="btn-primary" id="am-tech-save">Assign technician</button>
      ${t.coll === 'centerRequests' ? `<div class="form-row" style="margin-top:16px;"><label for="am-center">Or move to another service center</label><select id="am-center"><option value="">Select…</option>${centers.filter((c) => c.uid !== t.serviceCenterUid).map((c) => `<option value="${esc(c.uid)}">${esc(c.name)} — ${esc(c.district)}</option>`).join('')}</select></div>
      <button type="button" class="btn-secondary" id="am-center-save">Move to this center</button>` : ''}`, (ov, close, msg) => {
      ov.querySelector('#am-tech-save').addEventListener('click', async () => {
        const uid = ov.querySelector('#am-tech').value;
        if (!uid) return msg('Choose a technician.', true);
        const name = (opts.find(([u]) => u === uid) || [])[1].split(' — ')[0];
        try {
          const upd = { technicianUid: uid, technicianName: name, updatedAt: serverTimestamp() };
          if (['new', 'assigned_to_center', 'reassignment_required'].includes(t.status)) upd.status = 'assigned';
          await updateDoc(doc(db, t.coll, t.id), upd);
          await logStatus(t.coll, t.id, upd.status || t.status, `Technician ${name} assigned by Area Manager ${me.name}`);
          await tell(uid, 'New job assigned', `${ticketId(t)} for ${t.customerName || 'a customer'}${t.product ? ' - ' + t.product : ''}`);
          msg('Assigned.'); cache = null; setTimeout(() => { close(); requestsScreen(); }, 600);
        } catch (e) { console.error(e); msg('Could not assign. The ticket may have changed — refresh and try again.', true); }
      });
      const cb = ov.querySelector('#am-center-save');
      if (cb) cb.addEventListener('click', async () => {
        const uid = ov.querySelector('#am-center').value;
        if (!uid) return msg('Choose a service center.', true);
        const c = centers.find((x) => x.uid === uid);
        try {
          const { id, coll, ...data } = t;
          const fresh = { ...data, serviceCenterUid: c.uid, serviceCenterName: c.name, technicianUid: null, technicianName: null, status: 'new', reassignedFrom: t.serviceCenterUid || null, movedFromDocId: t.id, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
          ['billingRequest', 'billingStatus', 'billingTotal', 'billingType', 'warrantyStatus', 'serviceCharge', 'billedAt', 'billingComputedAt', 'billingPayer', 'customerFeedback', 'claimId', 'claimDocId', 'billingRejected', 'billingDecidedAt', 'sparePartsCost', 'otherCharges', 'customerPaymentMethod', 'customerPaymentRef', 'intakeWarranty', 'possibleDuplicateOf', 'assignmentRejected', 'scheduleRejected', 'lifecycleRejected', 'appointmentMissed', 'escalation', 'idCheck'].forEach((k) => delete fresh[k]);
          const ref = await addDoc(collection(db, 'centerRequests'), fresh);
          await logStatus('centerRequests', ref.id, 'new', `Moved here from ${t.serviceCenterName || 'another center'} by Area Manager ${me.name}`);
          await updateDoc(doc(db, 'centerRequests', t.id), { status: 'cancelled', updatedAt: serverTimestamp() });
          await logStatus('centerRequests', t.id, 'cancelled', `Moved to ${c.name} by Area Manager ${me.name}`);
          await tell(c.uid, 'Service request moved to you', `${ticketId(t)} for ${t.customerName || 'a customer'}`);
          msg('Moved.'); cache = null; setTimeout(() => { close(); requestsScreen(); }, 600);
        } catch (e) { console.error(e); msg('Could not move this ticket. It may already be in progress at the other center.', true); }
      });
    });
  }

  /* --- routing website requests --- */
  async function routingScreen() {
    if (!districts.length) return noArea();
    loading();
    try {
      const a = await load(true);
      const pending = a.pubs.filter((p) => p.status === 'new');
      const stuck = a.tickets.filter((t) => t.status === 'reassignment_required');
      contentEl.innerHTML = panel('Website requests waiting to be routed', table(['Request', 'Customer', 'Pincode', 'Product', 'Type', 'Waiting since', ''],
        pending.map((p, i) => `<tr><td><b>${esc(p.requestId || p.id)}</b>${p.routing && p.routing.reason ? `<div style="font-size:12px;color:var(--stone);">Auto-routing: ${esc(String(p.routing.reason).replace(/_/g, ' '))}</div>` : ''}</td><td>${esc(p.customerName || '—')}<div style="font-size:12px;color:var(--stone);">${esc(p.customerPhone || '')}</div></td><td>${esc(p.pincode || '—')}</td><td>${esc(p.product || [p.brand, p.category].filter(Boolean).join(' ') || '—')}</td><td>${p.requestType === 'installation' ? 'Installation / demo' : 'Service'}</td><td>${when(p.createdAt)}</td><td><button type="button" class="btn-primary am-route" data-i="${i}">Route</button></td></tr>`),
        'Nothing waiting — every website request in your districts has been routed.'))
        + panel('Tickets that need a new technician or center', table(['Ticket', 'Customer', 'Center', 'Reason', ''],
          stuck.map((t, i) => `<tr><td><b>${esc(ticketId(t))}</b></td><td>${esc(t.customerName || '—')}</td><td>${esc(t.serviceCenterName || '—')}</td><td>${esc((t.assignmentRejected && t.assignmentRejected.reason) || 'Technician released the job')}</td><td><button type="button" class="btn-secondary am-fix" data-i="${i}">Assign / reassign</button></td></tr>`), 'None.'));
      contentEl.querySelectorAll('.am-route').forEach((b) => b.addEventListener('click', () => routeRequest(pending[Number(b.dataset.i)])));
      contentEl.querySelectorAll('.am-fix').forEach((b) => b.addEventListener('click', () => ticketActions(stuck[Number(b.dataset.i)])));
    } catch (e) { fail(e); }
  }
  function routeRequest(p) {
    const a = cache;
    const pin = String(p.pincode || '').trim();
    const score = (c) => (pin && (c.pincodesCovered || []).includes(pin) ? 2 : (c.districtsCovered || []).map(lc).includes(lc(p.district)) || lc(c.district) === lc(p.district) ? 1 : 0);
    const centers = a.centers.filter((c) => c.profile && !/SUSPENDED|INACTIVE|TERMINATED|PENDING/.test(String(c.profile.status || ''))).sort((x, y) => score(y) - score(x));
    const techs = [...a.directTechs].sort((x, y) => score(y) - score(x));
    const flag = (n) => (n === 2 ? ' — ✓ covers this pincode' : n === 1 ? ' — ✓ covers this district' : '');
    modal(`Route ${p.requestId || p.id}`, `
      <p style="font-size:13px;color:var(--stone);margin:0 0 12px;">${esc(p.customerName || '')} · ${esc(p.pincode || 'no pincode')} · ${esc(p.district || '')} · ${p.requestType === 'installation' ? 'Installation / demo' : 'Service'}</p>
      <div class="form-row"><label for="am-r-center">Send to service center</label><select id="am-r-center"><option value="">Select…</option>${centers.map((c) => `<option value="${esc(c.uid)}">${esc(c.name)}${flag(score(c))}</option>`).join('')}</select></div>
      <button type="button" class="btn-primary" id="am-r-center-go">Send to center</button>
      <div class="form-row" style="margin-top:16px;"><label for="am-r-tech">Or give it straight to a technician (areas with no center)</label><select id="am-r-tech"><option value="">Select…</option>${techs.map((t) => `<option value="${esc(t.uid)}">${esc(t.name || t.email)}${flag(score(t))}</option>`).join('')}</select></div>
      <button type="button" class="btn-secondary" id="am-r-tech-go">Give to technician</button>`, (ov, close, msg) => {
      const base = () => ({
        requestId: p.requestId || p.id, customerName: p.customerName || '', customerPhone: p.customerPhone || '', address: p.address || '', city: p.city || '', pincode: p.pincode || '', district: p.district,
        product: p.product || `${p.brand || ''} ${p.category || ''}`.trim() || '—', brand: p.brand || '', category: p.category || '', modelNo: p.modelNo || '', serialNumber: p.serialNumber || p.serialNo || '',
        purchaseDate: p.purchaseDate || null, linkedRegistrationId: p.linkedRegistrationId || null, type: p.requestType === 'installation' ? 'installation' : 'service', issue: p.issueDescription || '',
        sourceRequestId: p.id, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      });
      ov.querySelector('#am-r-center-go').addEventListener('click', async () => {
        const c = centers.find((x) => x.uid === ov.querySelector('#am-r-center').value);
        if (!c) return msg('Choose a service center.', true);
        try {
          const ref = await addDoc(collection(db, 'centerRequests'), { ...base(), serviceCenterUid: c.uid, serviceCenterName: c.name, status: 'new' });
          await logStatus('centerRequests', ref.id, 'new', `Routed to ${c.name} by Area Manager ${me.name}`);
          await updateDoc(doc(db, 'publicServiceRequests', p.id), { serviceCenterUid: c.uid, serviceCenterName: c.name, status: 'assigned_to_center', updatedAt: serverTimestamp() });
          await logStatus('publicServiceRequests', p.id, 'assigned_to_center', `Routed to ${c.name} by Area Manager ${me.name}`);
          await tell(c.uid, 'New service request routed to you', `${p.customerName || 'A customer'} — ${base().product}`);
          msg('Sent to the center.'); cache = null; setTimeout(() => { close(); routingScreen(); }, 600);
        } catch (e) { console.error(e); msg('Could not route this request. Refresh and try again.', true); }
      });
      ov.querySelector('#am-r-tech-go').addEventListener('click', async () => {
        const t = techs.find((x) => x.uid === ov.querySelector('#am-r-tech').value);
        if (!t) return msg('Choose a technician.', true);
        try {
          const id = `route_${p.id}`;
          await setDoc(doc(db, 'serviceJobs', id), { ...base(), jobId: p.requestId || p.id, technicianUid: t.uid, technicianEmail: t.email || '', technicianName: t.name || t.email || '', status: 'assigned', directTechnician: true });
          await logStatus('serviceJobs', id, 'assigned', `Assigned directly to ${t.name || t.email} by Area Manager ${me.name}`);
          await updateDoc(doc(db, 'publicServiceRequests', p.id), { technicianUid: t.uid, technicianName: t.name || t.email || '', status: 'assigned', updatedAt: serverTimestamp() });
          await logStatus('publicServiceRequests', p.id, 'assigned', `Assigned directly to technician ${t.name || t.email} by Area Manager ${me.name}`);
          await tell(t.uid, 'New job assigned to you', `${p.customerName || 'A customer'} — ${base().product}`);
          msg('Given to the technician.'); cache = null; setTimeout(() => { close(); routingScreen(); }, 600);
        } catch (e) { console.error(e); msg('Could not assign this request. Refresh and try again.', true); }
      });
    });
  }

  async function slaScreen() {
    if (!districts.length) return noArea();
    loading();
    try {
      const a = await load(true);
      const rows = a.tickets.filter(open).map((t) => ({ t, s: slaState(t, a.sla), r: slaRuleFor(a.sla, t.district, t.type) })).filter((x) => x.s !== 'ok')
        .sort((x, y) => (x.s === 'breached' ? 0 : 1) - (y.s === 'breached' ? 0 : 1) || ms(x.t.createdAt) - ms(y.t.createdAt));
      const unrouted = a.pubs.filter((p) => p.status === 'new' && Date.now() - ms(p.createdAt) > 4 * 3600000);
      contentEl.innerHTML = panel(`SLA — ${rows.filter((x) => x.s === 'breached').length} breached, ${rows.filter((x) => x.s === 'due_soon').length} due soon`, table(['Ticket', 'Customer', 'Center', 'Technician', 'Status', 'Open for', 'Rule', ''],
        rows.map((x, i) => `<tr><td><b>${esc(ticketId(x.t))}</b></td><td>${esc(x.t.customerName || '—')}</td><td>${esc(x.t.serviceCenterName || '—')}</td><td>${esc(x.t.technicianName || '—')}</td><td>${pill(x.t.status)}</td><td>${Math.round((Date.now() - ms(x.t.createdAt)) / 3600000)} h ${x.s === 'breached' ? '<span class="status-pill cancelled">Breached</span>' : '<span class="status-pill new">Due soon</span>'}</td><td style="font-size:12px;">${esc(x.r.name)} (${x.r.dueSoonHours}h / ${x.r.breachedHours}h)</td><td><button type="button" class="btn-secondary am-sla" data-i="${i}">Assign / reassign</button></td></tr>`),
        'Every open ticket in your districts is within its SLA.'))
        + panel('Website requests unrouted for 4+ hours', table(['Request', 'Customer', 'Pincode', 'Waiting'], unrouted.map((p) => `<tr><td>${esc(p.requestId || p.id)}</td><td>${esc(p.customerName || '—')}</td><td>${esc(p.pincode || '—')}</td><td>${Math.round((Date.now() - ms(p.createdAt)) / 3600000)} h</td></tr>`), 'None.'));
      contentEl.querySelectorAll('.am-sla').forEach((b) => b.addEventListener('click', () => ticketActions(rows[Number(b.dataset.i)].t)));
    } catch (e) { fail(e); }
  }

  async function inventoryScreen() {
    if (!districts.length) return noArea();
    loading();
    try {
      const a = await load(true);
      const parts = new Map();
      try { (await getDocs(collection(db, 'spareParts'))).forEach((d) => parts.set(d.id, d.data())); } catch (e) { /* names optional */ }
      const lines = [];
      await Promise.all(a.centers.filter((c) => c.profile).map(async (c) => {
        const s = await safe(getDocs(query(collection(db, 'inventory'), where('location', '==', 'servicecenter'), where('serviceCenterUid', '==', c.uid))), { docs: [] });
        s.docs.forEach((d) => { const x = d.data(); const p = parts.get(x.partId) || {}; lines.push({ center: c.name, part: p.name || x.partName || x.partId, code: p.partCode || '', qty: Number(x.quantity) || 0, min: Number(p.reorderLevel || p.minStock) || 0 }); });
      }));
      lines.sort((x, y) => x.center.localeCompare(y.center) || x.part.localeCompare(y.part));
      contentEl.innerHTML = panel('Spare stock at your service centers (read-only)', table(['Center', 'Part', 'Code', 'In stock', ''],
        lines.map((l) => `<tr><td>${esc(l.center)}</td><td>${esc(l.part)}</td><td>${esc(l.code || '—')}</td><td>${l.qty}</td><td>${l.qty <= 0 ? '<span class="status-pill cancelled">Out</span>' : l.min && l.qty <= l.min ? '<span class="status-pill new">Low</span>' : ''}</td></tr>`), 'No stock recorded at your centers yet.'));
    } catch (e) { fail(e); }
  }

  async function sparesScreen() {
    if (!districts.length) return noArea();
    loading();
    try {
      const a = await load(true);
      const reqs = [];
      await Promise.all(a.centers.filter((c) => c.profile).map(async (c) => {
        const s = await safe(getDocs(query(collection(db, 'spareRequests'), where('requestedByUid', '==', c.uid))), { docs: [] });
        s.docs.forEach((d) => reqs.push({ id: d.id, center: c.name, ...d.data() }));
      }));
      reqs.sort((x, y) => ms(y.createdAt) - ms(x.createdAt));
      contentEl.innerHTML = panel('Spare requests from your service centers (read-only)', table(['Request', 'Center', 'Part', 'Qty', 'For job', 'Status', 'Raised'],
        reqs.map((r) => `<tr><td>${esc(r.requestId || r.id)}</td><td>${esc(r.center)}</td><td>${esc(r.item || r.partName || '—')}</td><td>${esc(r.quantity || r.qty || '—')}</td><td>${esc(r.sourceJobLabel || r.sourceJobId || '—')}</td><td>${pill(r.status)}</td><td>${when(r.createdAt)}</td></tr>`), 'No spare requests from your centers.'));
    } catch (e) { fail(e); }
  }

  async function centerApprovals() {
    if (!districts.length) return noArea();
    loading();
    try {
      const a = await load(true);
      const list = a.centers.filter((c) => c.profile).sort((x, y) => (/PENDING/.test(String(y.profile.status)) ? 1 : 0) - (/PENDING/.test(String(x.profile.status)) ? 1 : 0));
      contentEl.innerHTML = panel('Service center approvals', table(['Center', 'District', 'Status', 'Submitted', ''],
        list.map((c, i) => `<tr><td><b>${esc(c.name)}</b><div style="font-size:12px;color:var(--stone);">${esc(c.email || '')}</div></td><td>${esc(c.district)}</td><td>${esc(c.profile.status || '—')}</td><td>${esc((c.profile.approval && c.profile.approval.submittedDate) || '—')}</td><td style="white-space:nowrap;">${c.profile.status === 'ACTIVE' ? `<button type="button" class="btn-secondary am-sc" data-i="${i}" data-s="SUSPENDED">Suspend</button>` : `<button type="button" class="btn-primary am-sc" data-i="${i}" data-s="ACTIVE">Approve</button> <button type="button" class="btn-secondary am-sc" data-i="${i}" data-s="INACTIVE">Reject</button>`}</td></tr>`),
        'No service centers in your districts.'));
      contentEl.querySelectorAll('.am-sc').forEach((b) => b.addEventListener('click', async () => {
        const c = list[Number(b.dataset.i)], s = b.dataset.s;
        let reason = '';
        if (s !== 'ACTIVE') { reason = window.prompt(`Reason (shown to ${c.name}):`, ''); if (reason === null) return; }
        else if (!window.confirm(`Approve ${c.name}? It starts receiving service requests.`)) return;
        b.disabled = true;
        try {
          const approval = Object.assign({}, c.profile.approval || {}, s === 'ACTIVE' ? { approvedBy: me.email, approvedDate: new Date().toISOString().slice(0, 10) } : s === 'SUSPENDED' ? { suspensionReason: reason } : { rejectionReason: reason }, { decidedByRole: 'areamanager' });
          await updateDoc(doc(db, 'serviceCenterProfiles', c.uid), { status: s, approval, updatedAt: serverTimestamp() });
          await tell(c.uid, s === 'ACTIVE' ? 'Your service center is approved' : s === 'SUSPENDED' ? 'Your service center is suspended' : 'Your service center was not approved', reason || 'Approved by your Area Manager.');
          cache = null; centerApprovals();
        } catch (e) { console.error(e); b.disabled = false; window.alert('Could not change this center. Refresh and try again.'); }
      }));
    } catch (e) { fail(e); }
  }

  async function onboardingApprovals() {
    if (!districts.length) return noArea();
    loading();
    try {
      const a = await load(true);
      const list = a.roster.filter((t) => !t.employmentStatus || t.employmentStatus === 'ON_PROBATION');
      contentEl.innerHTML = panel('Technician onboarding approvals', table(['Technician', 'Center', 'Phone', 'Status', ''],
        list.map((t, i) => `<tr><td><b>${esc(t.name || t.technicianName || '—')}</b></td><td>${esc(t.centerName)}</td><td>${esc(t.phone || '—')}</td><td>${esc(t.employmentStatus || 'New — not approved')}</td><td style="white-space:nowrap;"><button type="button" class="btn-primary am-tc" data-i="${i}" data-s="ACTIVE">Approve</button> <button type="button" class="btn-secondary am-tc" data-i="${i}" data-s="TERMINATED">Reject</button></td></tr>`),
        'No technicians waiting for approval in your districts.'));
      contentEl.querySelectorAll('.am-tc').forEach((b) => b.addEventListener('click', async () => {
        const t = list[Number(b.dataset.i)], s = b.dataset.s;
        let reason = '';
        if (s !== 'ACTIVE') { reason = window.prompt('Reason for not approving:', ''); if (reason === null) return; }
        b.disabled = true;
        try {
          await updateDoc(doc(db, 'centerTechnicians', t.id), { employmentStatus: s, onboardingApproval: { decision: s === 'ACTIVE' ? 'approved' : 'rejected', reason, by: me.email, byRole: 'areamanager', at: new Date().toISOString() }, updatedAt: serverTimestamp() });
          await tell(t.serviceCenterUid, s === 'ACTIVE' ? 'Technician approved' : 'Technician not approved', `${t.name || 'A technician'}${reason ? ' — ' + reason : ''}`);
          cache = null; onboardingApprovals();
        } catch (e) { console.error(e); b.disabled = false; window.alert('Could not change this technician. Refresh and try again.'); }
      }));
    } catch (e) { fail(e); }
  }

  async function reportsScreen() {
    if (!districts.length) return noArea();
    loading();
    try {
      const a = await load(true);
      const all = [...a.tickets, ...a.pubs.filter((p) => p.status === 'new').map((p) => ({ ...p, type: p.requestType === 'installation' ? 'installation' : 'service' }))];
      const byDistrict = districts.map((d) => {
        const ts = all.filter((t) => lc(t.district) === lc(d));
        return [d, ts.length, ts.filter(open).length, ts.filter((t) => DONE.includes(t.status)).length, ts.filter((t) => t.type === 'installation').length, ts.filter((t) => t.type !== 'installation').length];
      });
      const months = new Map();
      all.forEach((t) => { const m = ms(t.createdAt); if (!m) return; const k = new Date(m).toISOString().slice(0, 7); const r = months.get(k) || [k, 0, 0]; r[1]++; if (DONE.includes(t.status)) r[2]++; months.set(k, r); });
      const monthRows = Array.from(months.values()).sort((x, y) => y[0].localeCompare(x[0])).slice(0, 12);
      contentEl.innerHTML = panel('By district', table(['District', 'Tickets', 'Open', 'Done', 'Installation / demo', 'Service'], byDistrict.map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`)),
        `<button type="button" class="btn-secondary" id="am-csv">Download tickets (CSV)</button>`)
        + panel('By month', table(['Month', 'Tickets', 'Done'], monthRows.map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`), 'No tickets yet.'));
      contentEl.querySelector('#am-csv').addEventListener('click', () => {
        const rows = [['Ticket', 'Raised', 'District', 'Customer', 'Phone', 'Product', 'Type', 'Center', 'Technician', 'Status']].concat(all.map((t) => [ticketId(t), when(t.createdAt), t.district || '', t.customerName || '', t.customerPhone || '', t.product || '', t.type || '', t.serviceCenterName || '', t.technicianName || '', nice(t.status)]));
        const blob = new Blob([csv(rows)], { type: 'text/csv' });
        const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `area-tickets-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 2000);
      });
    } catch (e) { fail(e); }
  }

  async function performanceScreen() {
    if (!districts.length) return noArea();
    loading();
    try {
      const a = await load(true);
      const centerName = new Map(a.centers.map((c) => [c.uid, c.name]));
      const byCenter = performance(a.tickets.filter((t) => t.coll === 'centerRequests'), (t) => t.serviceCenterUid);
      const byTech = performance(a.tickets, (t) => t.technicianUid);
      const techName = (uid) => { const r = a.roster.find((x) => x.technicianUid === uid); const u = a.techById.get(uid); return (r && (r.name || r.technicianName)) || (u && (u.name || u.email)) || uid; };
      const row = (name, r) => `<tr><td><b>${esc(name)}</b></td><td>${r.total}</td><td>${r.open}</td><td>${r.done}</td><td>${r.completion}%</td><td>${r.avgHours == null ? '—' : r.avgHours + ' h'}</td></tr>`;
      const heads = ['Name', 'Tickets', 'Open', 'Done', 'Completed', 'Avg. time to close'];
      contentEl.innerHTML = panel('Service centers', table(heads, byCenter.map((r) => row(centerName.get(r.key) || r.key, r)), 'No tickets yet.'))
        + panel('Technicians', table(heads, byTech.map((r) => row(techName(r.key), r)), 'No tickets yet.'));
    } catch (e) { fail(e); }
  }

  function profileScreen() {
    contentEl.innerHTML = panel('My profile', `<div style="padding:16px;display:grid;gap:10px;font-size:14px;">
      <div><b>Name:</b> ${esc(me.name)}</div><div><b>Email:</b> ${esc(me.email)}</div><div><b>Role:</b> Area Service Manager</div>
      <div><b>Districts:</b> ${districts.length ? districts.map(esc).join(', ') : 'None assigned yet'}</div>
      <p style="color:var(--stone);margin:6px 0 0;">Your districts are set by Super Admin under Users &amp; Access. To change your password, use "Forgot password?" on the sign-in page.</p></div>`);
  }

  const SCREENS = {
    dashboard: ['Your districts at a glance', dashboard], servicecenters: ['Service centers in your districts', centersScreen], technicians: ['Roster and direct technicians', techniciansScreen],
    coverage: ['Who covers each pincode', coverageScreen], servicerequests: ['Every ticket in your districts', requestsScreen], routing: ['Route website requests and fix stuck tickets', routingScreen],
    sla: ['Late and nearly late tickets', slaScreen], inventory: ['Stock at your centers', inventoryScreen], spareparts: ['Spare requests from your centers', sparesScreen],
    'approvals-sc': ['Approve, reject or suspend centers', centerApprovals], 'approvals-onboarding': ['Approve new technicians', onboardingApprovals],
    reports: ['Tickets by district and month', reportsScreen], performance: ['Centers and technicians', performanceScreen], profile: ['Your account', profileScreen]
  };
  return {
    show(id) { const s = SCREENS[id] || SCREENS.dashboard; if (pageSub) pageSub.textContent = s[0]; return s[1](); },
    districts
  };
}
