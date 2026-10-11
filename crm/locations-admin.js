// Super Admin — "Store & Service Locations".
// Head Office keeps the list the public website's "Find a service center or
// store" map shows (Firestore: publicLocations). Only public business details
// go here — name, address, business phone, hours, map position.

// Reads a position out of whatever the admin pastes: a Google Maps link
// (…/@15.36,75.12,17z  …!3d15.36!4d75.12  …?q=15.36,75.12) or "15.36, 75.12".
export function parseLatLng(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  const pats = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query|ll|destination|center|daddr)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i,
    /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/
  ];
  for (const re of pats) {
    const m = t.match(re);
    if (m) {
      const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)) return { lat, lng };
    }
  }
  return null;
}

const FIELDS = [
  ['name', 'Name', 'text', 'e.g. Pushpak Service Center, Raichur', true],
  ['phone', 'Business phone', 'tel', '10-digit number customers can call'],
  ['whatsapp', 'WhatsApp (optional)', 'tel', ''],
  ['address', 'Address', 'text', 'Door no., street'],
  ['area', 'Area / landmark', 'text', ''],
  ['city', 'City / town', 'text', ''],
  ['district', 'District', 'text', ''],
  ['state', 'State', 'text', 'Karnataka'],
  ['pincode', 'Pincode', 'text', '6 digits'],
  ['hours', 'Opening hours', 'text', 'e.g. Mon–Sat 9:30 am – 7 pm'],
  ['brands', 'Brands (comma separated)', 'text', 'MakWell, Flyvision, Skevia']
];

export function mountLocationsAdmin(el, api) {
  const { db, fs, escapeHtml: esc } = api;
  const { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, getDoc, serverTimestamp } = fs;
  let rows = [];

  el.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <h3>Store &amp; Service Locations</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn-secondary" id="loc-import">Import service centers</button>
          <button class="btn-primary" id="loc-add">+ Add location</button>
        </div>
      </div>
      <div class="panel-body" style="padding-bottom:0;">
        <p style="margin:0 0 10px;font-size:13px;color:var(--stone);">These appear on the public website under <b>Find service center</b>, with a map. Only public business details — never personal numbers. A location needs a map position to show as a pin; without one it still appears in the list.</p>
        <div id="loc-msg" style="font-size:13px;margin-bottom:8px;" role="status" aria-live="polite"></div>
      </div>
      <div class="panel-body" style="padding:0;">
        <table>
          <thead><tr><th>Name</th><th>Type</th><th>City / Pincode</th><th>Phone</th><th>On map</th><th>Shown on website</th><th>Actions</th></tr></thead>
          <tbody id="loc-tbody"><tr><td colspan="7" class="empty-row">Loading…</td></tr></tbody>
        </table>
      </div>
    </div>`;
  const msg = (t, err) => { const m = el.querySelector('#loc-msg'); m.textContent = t; m.style.color = err ? 'var(--err)' : 'var(--ok, #12804A)'; };

  async function load() {
    const tb = el.querySelector('#loc-tbody');
    try {
      const snap = await getDocs(collection(db, 'publicLocations'));
      rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
      if (!rows.length) { tb.innerHTML = '<tr><td colspan="7" class="empty-row">No locations yet. Add your stores, or import your service centers.</td></tr>'; return; }
      tb.innerHTML = rows.map((r) => `
        <tr data-id="${esc(r.id)}">
          <td><b>${esc(r.name || '—')}</b></td>
          <td>${r.type === 'store' ? 'Store' : 'Service center'}</td>
          <td>${esc([r.city, r.pincode].filter(Boolean).join(' · ') || '—')}</td>
          <td>${esc(r.phone || '—')}</td>
          <td>${typeof r.lat === 'number' && typeof r.lng === 'number' ? 'Yes' : '<span style="color:var(--err)">No position</span>'}</td>
          <td><span class="status-pill ${r.active ? 'completed' : 'cancelled'}">${r.active ? 'Shown' : 'Hidden'}</span></td>
          <td style="white-space:nowrap;">
            <button class="btn-secondary" data-act="edit">Edit</button>
            <button class="btn-secondary" data-act="toggle">${r.active ? 'Hide' : 'Show'}</button>
            <button class="btn-secondary" data-act="delete">Delete</button>
          </td>
        </tr>`).join('');
    } catch (err) {
      console.error('Load locations failed:', err);
      tb.innerHTML = '<tr><td colspan="7" class="empty-row">Could not load locations. If this is the first time, the updated Firestore rules (publicLocations) may not be published yet.</td></tr>';
    }
  }

  function openForm(r) {
    const cur = r || { type: 'store', active: true, state: 'Karnataka' };
    const ov = document.createElement('div');
    ov.className = 'modal-overlay show';
    ov.innerHTML = `
      <div class="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="locf-h">
        <h3 id="locf-h">${r ? 'Edit location' : 'Add location'}</h3>
        <form id="locf" novalidate>
          <div class="form-row"><label for="locf-type">Type</label>
            <select id="locf-type"><option value="store"${cur.type === 'store' ? ' selected' : ''}>Store</option><option value="servicecenter"${cur.type === 'servicecenter' ? ' selected' : ''}>Service center</option></select></div>
          ${FIELDS.map(([k, label, type, ph]) => `<div class="form-row"><label for="locf-${k}">${label}</label><input type="${type}" id="locf-${k}" placeholder="${esc(ph)}" value="${esc(k === 'brands' ? (cur.brands || []).join(', ') : (cur[k] || ''))}"></div>`).join('')}
          <div class="form-row"><label for="locf-maplink">Map position — paste a Google Maps link or "latitude, longitude"</label>
            <input type="text" id="locf-maplink" placeholder="https://www.google.com/maps/place/…/@15.36,75.12,17z" value="${esc(cur.mapLink || (typeof cur.lat === 'number' ? cur.lat + ', ' + cur.lng : ''))}">
            <div id="locf-pos" style="font-size:12.5px;color:var(--stone);margin-top:4px;"></div></div>
          <div class="form-row"><label style="display:flex;gap:8px;align-items:center;"><input type="checkbox" id="locf-active"${cur.active !== false ? ' checked' : ''}> Show on the website</label></div>
          <div class="modal-error" id="locf-err" role="alert"></div>
          <div class="modal-actions"><button type="button" class="btn-secondary" id="locf-cancel">Cancel</button><button type="submit" class="btn-primary" id="locf-save">Save</button></div>
        </form>
      </div>`;
    document.body.appendChild(ov);
    const $f = (id) => ov.querySelector('#locf-' + id);
    const showPos = () => {
      const p = parseLatLng($f('maplink').value);
      $f('pos').textContent = !$f('maplink').value.trim() ? 'No position: it will be listed but not shown as a pin.'
        : p ? `Position found: ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}` : 'No position found in that text. Open the place in Google Maps on a computer and copy the full link from the address bar (short maps.app.goo.gl links do not contain the position), or right-click the spot and copy the coordinates.';
    };
    $f('maplink').addEventListener('input', showPos); showPos();
    const close = () => ov.remove();
    $f('cancel').addEventListener('click', close);
    ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    $f('name').focus();
    ov.querySelector('#locf').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $f('err'); err.classList.remove('show');
      const val = (k) => $f(k).value.trim();
      const fail = (t) => { err.textContent = t; err.classList.add('show'); };
      if (!val('name')) return fail('Please enter a name.');
      if (val('pincode') && !/^\d{6}$/.test(val('pincode'))) return fail('Pincode must be 6 digits.');
      const phone = val('phone').replace(/[^\d+]/g, '');
      if (phone && phone.replace(/\D/g, '').length < 10) return fail('Please enter a full phone number.');
      const pos = parseLatLng(val('maplink'));
      if (val('maplink') && !pos) return fail('The map position could not be read. Paste the full Google Maps link, or "latitude, longitude".');
      const data = {
        type: $f('type').value, name: val('name').slice(0, 120), phone, whatsapp: val('whatsapp').replace(/\D/g, ''),
        address: val('address'), area: val('area'), city: val('city'), district: val('district'), state: val('state'), pincode: val('pincode'),
        hours: val('hours'), brands: val('brands').split(',').map((s) => s.trim()).filter(Boolean),
        lat: pos ? pos.lat : null, lng: pos ? pos.lng : null, mapLink: /^https?:\/\//.test(val('maplink')) ? val('maplink') : '',
        active: $f('active').checked, updatedAt: serverTimestamp()
      };
      const btn = $f('save'); btn.disabled = true; btn.textContent = 'Saving…';
      try {
        const id = r ? r.id : 'loc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        if (!r) data.createdAt = serverTimestamp();
        await setDoc(doc(db, 'publicLocations', id), data, { merge: true });
        close(); msg('Saved.'); load();
      } catch (ex) {
        console.error('Save location failed:', ex);
        btn.disabled = false; btn.textContent = 'Save';
        fail('Could not save. If this is the first time, the updated Firestore rules may not be published yet.');
      }
    });
  }

  async function importCenters() {
    const btn = el.querySelector('#loc-import'); btn.disabled = true; btn.textContent = 'Importing…';
    try {
      const snap = await getDocs(collection(db, 'serviceCenterProfiles'));
      let added = 0, updated = 0, noPos = 0;
      for (const d of snap.docs) {
        const p = d.data();
        const name = p.displayName || p.tradeName || p.legalBusinessName || p.serviceCenterName || p.name;
        if (!name) continue;
        const pos = (typeof p.latitude !== 'undefined' && parseLatLng(`${p.latitude}, ${p.longitude}`)) || parseLatLng(p.mapLink);
        if (!pos) noPos++;
        const id = 'sc_' + d.id;
        const data = {
          type: 'servicecenter', name: String(name).slice(0, 120), phone: String(p.officialMobile || p.landline || '').replace(/[^\d+]/g, ''),
          whatsapp: String(p.whatsapp || '').replace(/\D/g, ''), address: p.address || '', area: p.area || p.landmark || '', city: p.city || '',
          district: p.district || '', state: p.state || '', pincode: p.pincode || '', lat: pos ? pos.lat : null, lng: pos ? pos.lng : null,
          mapLink: p.mapLink || '', sourceUid: d.id, updatedAt: serverTimestamp()
        };
        const existing = await getDoc(doc(db, 'publicLocations', id));
        if (existing.exists()) { await updateDoc(doc(db, 'publicLocations', id), data); updated++; }
        else {
          const live = !p.status || /^(active|approved|operational)$/i.test(String(p.status));
          await setDoc(doc(db, 'publicLocations', id), { ...data, active: live, createdAt: serverTimestamp() }); added++;
        }
      }
      msg(`Imported: ${added} new, ${updated} updated${noPos ? ` — ${noPos} have no map position yet (Edit to add one)` : ''}. New ones are shown only if their profile status is Active.`);
      load();
    } catch (err) {
      console.error('Import service centers failed:', err);
      msg('Could not import service centers. Check the console for details.', true);
    }
    btn.disabled = false; btn.textContent = 'Import service centers';
  }

  el.querySelector('#loc-add').addEventListener('click', () => openForm(null));
  el.querySelector('#loc-import').addEventListener('click', importCenters);
  el.querySelector('#loc-tbody').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const r = rows.find((x) => x.id === b.closest('tr').dataset.id); if (!r) return;
    if (b.dataset.act === 'edit') return openForm(r);
    try {
      if (b.dataset.act === 'toggle') { await updateDoc(doc(db, 'publicLocations', r.id), { active: !r.active, updatedAt: serverTimestamp() }); msg(r.active ? 'Hidden from the website.' : 'Shown on the website.'); }
      if (b.dataset.act === 'delete') {
        if (!window.confirm(`Delete "${r.name}" from the locator? This cannot be undone. (Hide keeps it for later.)`)) return;
        await deleteDoc(doc(db, 'publicLocations', r.id)); msg('Deleted.');
      }
      load();
    } catch (err) { console.error('Location update failed:', err); msg('Could not update. Check the console for details.', true); }
  });
  load();
}
