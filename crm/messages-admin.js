// Super Admin > Customer Messages & Job Closing.
// 1. Whether closing a job needs the customer's confirmation (completion
//    code or signature) — settings/closeConfirmation.required.
// 2. Automatic SMS / WhatsApp to customers through MSG91 —
//    settings/messaging. Off until switched on here AND the MSG91 auth key
//    is on the server (functions/.env: MSG91_AUTHKEY=...).
// 3. The last messages the server tried to send (messageLog).

export const EVENTS = [
  ['booking', 'Request received', 'ticket, product'],
  ['assigned', 'Technician assigned', 'ticket, technician name'],
  ['appointment', 'Visit scheduled', 'ticket, date, time'],
  ['completed', 'Job completed', 'ticket'],
  ['closeCode', 'Completion code', 'code, ticket']
];

// Form values -> settings/messaging document. Pure.
export function messagingSettings(v) {
  const events = {};
  EVENTS.forEach(([k]) => { events[k] = { on: !!v[`on_${k}`], templateId: String(v[`tpl_${k}`] || '').trim() }; });
  const channel = v.channel === 'whatsapp' ? 'whatsapp' : 'sms';
  const out = { enabled: !!v.enabled, channel, events, whatsappNumber: String(v.whatsappNumber || '').replace(/\D/g, ''), whatsappNamespace: String(v.whatsappNamespace || '').trim(), whatsappLanguage: String(v.whatsappLanguage || 'en').trim() || 'en' };
  const problems = [];
  if (out.enabled) {
    EVENTS.forEach(([k, label]) => { if (events[k].on && !events[k].templateId) problems.push(`${label}: add the template ID or switch it off.`); });
    if (channel === 'whatsapp' && !/^\d{10,13}$/.test(out.whatsappNumber)) problems.push('WhatsApp: enter your WhatsApp business number with country code (e.g. 919876543210).');
  }
  return { settings: out, problems };
}

export function mountMessagesAdmin(el, api) {
  const { db, fs, escapeHtml: esc, me } = api;
  const { doc, getDoc, setDoc, getDocs, collection, query, orderBy, limit, serverTimestamp } = fs;
  el.innerHTML = '<div class="panel"><div class="panel-body empty-row">Loading…</div></div>';
  (async () => {
    let close = {}, msg = {}, log = [];
    try { const s = await getDoc(doc(db, 'settings', 'closeConfirmation')); close = s.exists() ? s.data() : {}; } catch (e) { /* first time */ }
    try { const s = await getDoc(doc(db, 'settings', 'messaging')); msg = s.exists() ? s.data() : {}; } catch (e) { /* first time */ }
    try { const s = await getDocs(query(collection(db, 'messageLog'), orderBy('createdAt', 'desc'), limit(30))); log = s.docs.map((d) => d.data()); } catch (e) { /* rules not published yet */ }
    const ev = msg.events || {};
    el.innerHTML = `
      <div class="panel" style="margin-bottom:20px;">
        <div class="panel-header"><h2>Closing a job</h2></div>
        <div class="panel-body" style="font-size:13.5px;line-height:1.6;">
          <p style="margin:0 0 10px;">When the technician (or service center) marks a job complete, the customer confirms it with a <b>4-digit completion code</b> (shown in their My Service page on the website, and sent by SMS / WhatsApp when messages below are on) or by <b>signing on the technician's phone</b>.</p>
          <label style="display:flex;gap:8px;align-items:center;font-weight:600;"><input type="checkbox" id="cc-required" ${close.required === true ? 'checked' : ''}> Require the customer's confirmation to close a job</label>
          <p style="margin:6px 0 12px;color:var(--stone);font-size:12.5px;">Off: the confirmation is recommended but a job can close without it. On: the server undoes a completion without a valid code or signature. Publish the latest functions before switching this on.</p>
          <button type="button" class="btn-primary" id="cc-save">Save</button> <span id="cc-msg" role="status" aria-live="polite" style="font-size:12.5px;margin-left:8px;"></span>
        </div>
      </div>
      <div class="panel" style="margin-bottom:20px;">
        <div class="panel-header"><h2>Automatic messages to customers (SMS / WhatsApp)</h2></div>
        <div class="panel-body" style="font-size:13.5px;line-height:1.6;">
          <p style="margin:0 0 10px;">Sent through <b>MSG91</b>. Each message uses a template you register first (SMS: DLT-approved template; WhatsApp: Meta-approved template). Put the template ID from MSG91 against each message. The values sent to each template are listed in order (var1, var2, …).</p>
          <p style="margin:0 0 12px;color:var(--stone);font-size:12.5px;">Nothing is sent until "Send messages" is on <b>and</b> the MSG91 auth key is set on the server (the file <code>functions/.env</code> with <code>MSG91_AUTHKEY=…</code>, then publish the functions).</p>
          <label style="display:flex;gap:8px;align-items:center;font-weight:600;margin-bottom:10px;"><input type="checkbox" id="m-enabled" ${msg.enabled ? 'checked' : ''}> Send messages</label>
          <div class="form-row" style="max-width:260px;"><label for="m-channel">Send by</label><select id="m-channel"><option value="sms"${msg.channel !== 'whatsapp' ? ' selected' : ''}>SMS</option><option value="whatsapp"${msg.channel === 'whatsapp' ? ' selected' : ''}>WhatsApp</option></select></div>
          <div id="m-wa" style="display:${msg.channel === 'whatsapp' ? 'grid' : 'none'};grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;">
            <div class="form-row"><label for="m-wa-number">WhatsApp business number</label><input id="m-wa-number" inputmode="numeric" placeholder="919876543210" value="${esc(msg.whatsappNumber || '')}"></div>
            <div class="form-row"><label for="m-wa-ns">Template namespace (if MSG91 shows one)</label><input id="m-wa-ns" value="${esc(msg.whatsappNamespace || '')}"></div>
            <div class="form-row"><label for="m-wa-lang">Template language code</label><input id="m-wa-lang" value="${esc(msg.whatsappLanguage || 'en')}"></div>
          </div>
          <div style="overflow-x:auto;"><table><thead><tr><th>Message</th><th>On</th><th>Template ID</th><th>Values sent</th></tr></thead><tbody>
            ${EVENTS.map(([k, label, vars]) => `<tr><td>${esc(label)}</td><td><input type="checkbox" id="m-on-${k}" aria-label="${esc(label)} on" ${ev[k] && ev[k].on ? 'checked' : ''}></td><td><input id="m-tpl-${k}" aria-label="${esc(label)} template ID" value="${esc((ev[k] && ev[k].templateId) || '')}" style="width:100%;min-width:160px;border:1px solid var(--hairline);padding:7px 9px;border-radius:2px;"></td><td style="font-size:12px;color:var(--stone);">${esc(vars)}</td></tr>`).join('')}
          </tbody></table></div>
          <div style="margin-top:12px;"><button type="button" class="btn-primary" id="m-save">Save message settings</button> <span id="m-msg" role="status" aria-live="polite" style="font-size:12.5px;margin-left:8px;"></span></div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-header"><h2>Recent messages</h2></div>
        <div class="panel-body" style="padding:0;"><div style="overflow-x:auto;"><table><thead><tr><th>When</th><th>Ticket</th><th>Message</th><th>Result</th></tr></thead><tbody>
          ${log.length ? log.map((l) => { const r = l.result || {}; const when = l.createdAt && l.createdAt.toDate ? l.createdAt.toDate().toLocaleString() : '—'; return `<tr><td style="font-size:12px;">${esc(when)}</td><td>${esc(l.ticket || l.docId || '—')}</td><td>${esc((EVENTS.find(([k]) => k === l.event) || [0, l.event])[1])}</td><td><span class="status-pill ${r.status === 'sent' ? 'completed' : r.status === 'failed' ? 'cancelled' : 'new'}">${esc(r.status || '—')}</span>${r.reason ? `<div style="font-size:11.5px;color:var(--stone);">${esc(r.reason)}</div>` : ''}</td></tr>`; }).join('') : '<tr><td colspan="4" class="empty-row">No messages yet.</td></tr>'}
        </tbody></table></div></div>
      </div>`;
    const $ = (id) => el.querySelector('#' + id);
    $('m-channel').addEventListener('change', () => { $('m-wa').style.display = $('m-channel').value === 'whatsapp' ? 'grid' : 'none'; });
    const say = (id, t, err) => { $(id).textContent = t; $(id).style.color = err ? 'var(--err)' : 'var(--ok, #12804A)'; };
    $('cc-save').addEventListener('click', async () => {
      try { await setDoc(doc(db, 'settings', 'closeConfirmation'), { required: $('cc-required').checked, updatedBy: (me && me.email) || '', updatedAt: serverTimestamp() }, { merge: true }); say('cc-msg', 'Saved.'); }
      catch (e) { console.error(e); say('cc-msg', 'Could not save.', true); }
    });
    $('m-save').addEventListener('click', async () => {
      const v = { enabled: $('m-enabled').checked, channel: $('m-channel').value, whatsappNumber: $('m-wa-number').value, whatsappNamespace: $('m-wa-ns').value, whatsappLanguage: $('m-wa-lang').value };
      EVENTS.forEach(([k]) => { v[`on_${k}`] = $(`m-on-${k}`).checked; v[`tpl_${k}`] = $(`m-tpl-${k}`).value; });
      const { settings, problems } = messagingSettings(v);
      if (problems.length) return say('m-msg', problems.join(' '), true);
      try { await setDoc(doc(db, 'settings', 'messaging'), { ...settings, updatedBy: (me && me.email) || '', updatedAt: serverTimestamp() }); say('m-msg', settings.enabled ? 'Saved. Messages go out once the MSG91 key is on the server.' : 'Saved. Messages are off.'); }
      catch (e) { console.error(e); say('m-msg', 'Could not save.', true); }
    });
  })();
}
