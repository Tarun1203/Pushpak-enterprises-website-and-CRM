// Pushpak Enterprises — "Find a service center or store".
// Lists the service centers and stores Head Office has published
// (Firestore: publicLocations, public business details only), nearest first,
// with Call / WhatsApp / Directions. The map is optional: OpenStreetMap tiles
// load only after the visitor taps "Show map", and the visitor's position is
// read only after they tap "Use my location" — it never leaves the browser.
import { getFirestore, collection, getDocs, query, where }
  from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

const $ = (s, r) => (r || document).querySelector(s);
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const VENDOR = new URL('./vendor/leaflet/', import.meta.url).href;
const TYPE = { servicecenter: 'Service center', store: 'Store' };
const COLOR = { servicecenter: '#1B3FD1', store: '#C2410C' };

const state = { all: null, filter: 'all', q: '', origin: null, originKind: '', map: null, layer: null, markers: new Map(), loading: null };

/* ---------- data ---------- */
function num(v) { const n = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(n) ? n : null; }
export function normalise(id, d) {
  const lat = num(d.lat != null ? d.lat : d.latitude), lng = num(d.lng != null ? d.lng : d.longitude);
  const ok = lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
  return {
    id, type: d.type === 'store' ? 'store' : 'servicecenter', name: String(d.name || '').trim(),
    phone: String(d.phone || '').replace(/[^\d+]/g, ''), whatsapp: String(d.whatsapp || '').replace(/\D/g, ''),
    address: [d.address, d.area].filter(Boolean).join(', '), city: d.city || '', district: d.district || '', state: d.state || '',
    pincode: String(d.pincode || '').trim(), hours: d.hours || '', brands: Array.isArray(d.brands) ? d.brands : [],
    lat: ok ? lat : null, lng: ok ? lng : null, mapLink: d.mapLink || ''
  };
}
async function load() {
  if (state.all) return state.all;
  if (!state.loading) {
    state.loading = (async () => {
      const db = getFirestore();
      const snap = await getDocs(query(collection(db, 'publicLocations'), where('active', '==', true)));
      state.all = snap.docs.map((d) => normalise(d.id, d.data())).filter((x) => x.name);
      return state.all;
    })().finally(() => { state.loading = null; });
  }
  return state.loading;
}

/* ---------- ranking ---------- */
export function km(a, b) {
  const R = 6371, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const prefix = (a, b) => { let i = 0; while (i < 6 && a[i] && a[i] === b[i]) i++; return i; };
// Returns the list to show, nearest first, plus a note about how it was ordered.
export function rank(all, opts) {
  const { filter = 'all', q = '', origin = null } = opts || {};
  let list = all.filter((x) => filter === 'all' || x.type === filter);
  const query = String(q).trim().toLowerCase();
  let note = '', from = origin, approx = false;
  if (query && !/^\d{3,6}$/.test(query)) {
    const hit = list.filter((x) => [x.city, x.district, x.address, x.name, x.state].join(' ').toLowerCase().includes(query));
    if (hit.length) list = hit; else note = `Nothing matches "${q}" yet, so all locations are shown.`;
  }
  let pinScore = null;
  if (/^\d{3,6}$/.test(query)) {
    pinScore = (x) => (x.pincode ? prefix(query, x.pincode) : 0);
    if (!from) {
      // No GPS: use the published locations in the same pincode area as an approximate starting point.
      let best = 0; list.forEach((x) => { if (x.lat != null) best = Math.max(best, pinScore(x)); });
      if (best >= 3) {
        const pts = list.filter((x) => x.lat != null && pinScore(x) === best);
        from = { lat: pts.reduce((s, x) => s + x.lat, 0) / pts.length, lng: pts.reduce((s, x) => s + x.lng, 0) / pts.length };
        approx = true;
      }
    }
  }
  const rows = list.map((x) => ({ ...x, distance: from && x.lat != null ? km(from, x) : null, pin: pinScore ? pinScore(x) : 0 }));
  rows.sort((a, b) => (b.pin - a.pin) || ((a.distance == null) - (b.distance == null)) || ((a.distance || 0) - (b.distance || 0)) || a.name.localeCompare(b.name));
  return { rows, note, approx };
}

/* ---------- list ---------- */
function fmtKm(d, approx) { if (d == null) return ''; const t = d < 1 ? `${Math.round(d * 1000)} m` : `${d < 10 ? d.toFixed(1) : Math.round(d)} km`; return (approx ? 'about ' : '') + t + ' away'; }
function directions(x) {
  const dest = x.lat != null ? `${x.lat},${x.lng}` : [x.name, x.address, x.city, x.pincode].filter(Boolean).join(', ');
  return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(dest);
}
function render() {
  const list = $('#loc-list'), status = $('#loc-status');
  if (!state.all) return;
  if (!state.all.length) {
    list.innerHTML = '';
    status.textContent = 'Our location list is being updated. Please send us an enquiry and we will tell you the nearest center.';
    $('#loc-map-wrap').hidden = true;
    return;
  }
  const { rows, note, approx } = rank(state.all, { filter: state.filter, q: state.q, origin: state.origin });
  const how = state.origin ? 'nearest to you first' : approx ? 'nearest to that pincode first (approximate)' : state.q ? 'best match first' : 'all locations';
  status.textContent = `${rows.length} ${rows.length === 1 ? 'location' : 'locations'} — ${how}.${note ? ' ' + note : ''}`;
  list.innerHTML = rows.map((x) => {
    const tel = x.phone ? `<a class="loc-act" href="tel:${esc(x.phone)}">Call</a>` : '';
    const wa = x.whatsapp ? `<a class="loc-act" href="https://wa.me/${esc(x.whatsapp.length === 10 ? '91' + x.whatsapp : x.whatsapp)}" target="_blank" rel="noopener">WhatsApp</a>` : '';
    const map = x.lat != null ? `<button type="button" class="loc-act" data-loc-show="${esc(x.id)}">Show on map</button>` : '';
    const where = [x.address, x.city, x.pincode].filter(Boolean).join(', ');
    return `<li class="loc-item" data-id="${esc(x.id)}">
      <div class="loc-head"><h4>${esc(x.name)}</h4><span class="loc-type loc-${x.type}">${TYPE[x.type]}</span></div>
      ${where ? `<p class="loc-addr">${esc(where)}</p>` : ''}
      ${x.hours ? `<p class="loc-meta">Open: ${esc(x.hours)}</p>` : ''}
      ${x.brands.length ? `<p class="loc-meta">Brands: ${esc(x.brands.join(', '))}</p>` : ''}
      ${x.distance != null ? `<p class="loc-dist">${esc(fmtKm(x.distance, approx && !state.origin))}</p>` : ''}
      <div class="loc-acts">${tel}${wa}<a class="loc-act" href="${esc(directions(x))}" target="_blank" rel="noopener">Directions</a>${map}</div>
    </li>`;
  }).join('');
  $('#loc-map-wrap').hidden = !state.all.some((x) => x.lat != null);
  if (state.map) drawMarkers(rows);
}

/* ---------- map (loaded on request) ---------- */
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  return new Promise((resolve, reject) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = VENDOR + 'leaflet.css'; document.head.appendChild(css);
    const s = document.createElement('script'); s.src = VENDOR + 'leaflet.js';
    s.onload = () => resolve(window.L); s.onerror = () => reject(new Error('map library failed to load'));
    document.head.appendChild(s);
  });
}
async function showMap(focusId) {
  const box = $('#loc-map'), btn = $('#loc-map-btn');
  if (!state.map) {
    btn.disabled = true; btn.textContent = 'Loading map…';
    try {
      const L = await loadLeaflet();
      box.hidden = false;
      state.map = L.map(box, { scrollWheelZoom: false, keyboard: true }).setView([15.35, 75.14], 7);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(state.map);
      state.map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
      state.layer = L.layerGroup().addTo(state.map);
      btn.hidden = true;
      $('#loc-legend').hidden = false;
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Show map';
      $('#loc-status').textContent = 'The map could not load. The list above still shows every location.';
      return;
    }
  }
  render();
  if (focusId) focus(focusId);
}
function drawMarkers(rows) {
  const L = window.L; if (!L || !state.layer) return;
  state.layer.clearLayers(); state.markers.clear();
  const pts = [];
  rows.forEach((x) => {
    if (x.lat == null) return;
    const m = L.circleMarker([x.lat, x.lng], { radius: 9, color: '#fff', weight: 2, fillColor: COLOR[x.type], fillOpacity: 1 })
      .bindPopup(`<strong>${esc(x.name)}</strong><br>${esc(TYPE[x.type])}${x.address ? '<br>' + esc(x.address) : ''}${x.phone ? `<br><a href="tel:${esc(x.phone)}">${esc(x.phone)}</a>` : ''}<br><a href="${esc(directions(x))}" target="_blank" rel="noopener">Directions</a>`);
    m.addTo(state.layer); state.markers.set(x.id, m); pts.push([x.lat, x.lng]);
  });
  if (state.origin) {
    L.circleMarker([state.origin.lat, state.origin.lng], { radius: 7, color: '#fff', weight: 2, fillColor: '#12804A', fillOpacity: 1 }).bindPopup('You are here').addTo(state.layer);
    pts.push([state.origin.lat, state.origin.lng]);
  }
  if (pts.length === 1) state.map.setView(pts[0], 13);
  else if (pts.length) state.map.fitBounds(pts, { padding: [28, 28], maxZoom: 14 });
  setTimeout(() => state.map && state.map.invalidateSize(), 60);
}
function focus(id) {
  const m = state.markers.get(id); if (!m) return;
  state.map.setView(m.getLatLng(), 15); m.openPopup();
  $('#loc-map').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/* ---------- controls ---------- */
function setFilter(f) {
  state.filter = f;
  document.querySelectorAll('[data-loc-filter]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.locFilter === f)));
  render();
}
function nearMe() {
  const btn = $('#loc-near'), status = $('#loc-status');
  if (!navigator.geolocation) { status.textContent = 'Your browser cannot share its location. Type your pincode or city instead.'; return; }
  btn.disabled = true; btn.textContent = 'Finding you…';
  navigator.geolocation.getCurrentPosition((p) => {
    state.origin = { lat: p.coords.latitude, lng: p.coords.longitude };
    btn.disabled = false; btn.textContent = 'Use my location';
    render();
    if (state.map) drawMarkers(rank(state.all, state).rows);
  }, () => {
    btn.disabled = false; btn.textContent = 'Use my location';
    status.textContent = 'We could not get your location (permission was not given). Type your pincode or city instead.';
  }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
}

export async function open() {
  const ov = $('#locator-overlay'); if (!ov) return;
  ov.classList.add('show');
  $('#loc-status').textContent = 'Loading locations…';
  try { await load(); render(); } catch (e) {
    $('#loc-status').textContent = 'We could not load the list right now. Please try again, or send us an enquiry.';
  }
}
function close() { $('#locator-overlay').classList.remove('show'); }

function wire() {
  const ov = $('#locator-overlay'); if (!ov || ov._wired) return; ov._wired = true;
  $('#locator-close').addEventListener('click', close);
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  $('#loc-form').addEventListener('submit', (e) => { e.preventDefault(); state.q = $('#loc-q').value.trim(); render(); });
  $('#loc-near').addEventListener('click', nearMe);
  $('#loc-map-btn').addEventListener('click', () => showMap());
  document.querySelectorAll('[data-loc-filter]').forEach((b) => b.addEventListener('click', () => setFilter(b.dataset.locFilter)));
  $('#loc-list').addEventListener('click', (e) => { const b = e.target.closest('[data-loc-show]'); if (b) showMap(b.dataset.locShow); });
  const enq = $('[data-loc-enquiry]');
  if (enq) enq.addEventListener('click', () => { close(); if (window.PE_openEnquiry) window.PE_openEnquiry('Service Center Enquiry', 'Find a service center'); });
  document.querySelectorAll('[data-modal="locator"]').forEach((b) => b.addEventListener('click', open));
  if (location.hash === '#find-service-center') open();
  window.addEventListener('hashchange', () => { if (location.hash === '#find-service-center') open(); });
}
wire();
window.PE_LOCATOR = { open, rank, normalise, km };
