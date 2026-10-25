// Automatic messages to customers (SMS / WhatsApp through MSG91).
// Switched OFF until Head Office turns it on under Super Admin > Customer
// Messages AND the MSG91 auth key is in functions/.env (MSG91_AUTHKEY).
// Every message uses a template approved in advance (Indian SMS needs a
// DLT-registered template; WhatsApp needs a Meta-approved template), so the
// text itself lives at MSG91 — here we only pick the template and fill the
// values. Pure parts are unit-tested; send() does the network call.

// Events and the values each template receives, in order (var1, var2 …).
const EVENTS = {
  booking:     { label: 'Request received',        vars: ['ticket', 'product'] },
  assigned:    { label: 'Technician assigned',     vars: ['ticket', 'technician'] },
  appointment: { label: 'Visit scheduled',          vars: ['ticket', 'date', 'time'] },
  completed:   { label: 'Job completed',            vars: ['ticket'] },
  closeCode:   { label: 'Completion code',          vars: ['code', 'ticket'] }
};

const phone91 = (p) => {
  const d = String(p || '').replace(/\D/g, '');
  const ten = d.length === 12 && d.startsWith('91') ? d.slice(2) : d.length === 11 && d.startsWith('0') ? d.slice(1) : d;
  return /^[6-9]\d{9}$/.test(ten) ? '91' + ten : null;
};
const ticketNo = (t, id) => t.requestId || t.jobId || id;

// Which customer messages a ticket change calls for. coll: centerRequests |
// serviceJobs | publicServiceRequests; before null on create.
function eventsFor(coll, id, before, after) {
  const a = after || {}, b = before || {}, out = [];
  if (!a.customerPhone) return out;
  const t = ticketNo(a, id);
  if (coll === 'publicServiceRequests') {
    if (!before) out.push({ event: 'booking', key: 'booking', values: { ticket: t, product: a.product || [a.brand, a.category].filter(Boolean).join(' ') || 'your product' } });
    return out;
  }
  // A ticket routed from a website request already told the customer at booking.
  if (a.technicianUid && a.technicianUid !== b.technicianUid && a.technicianName) {
    out.push({ event: 'assigned', key: `assigned_${a.technicianUid}`, values: { ticket: t, technician: a.technicianName } });
  }
  const slot = (d) => `${d.scheduledDate || ''}|${d.scheduledStartTime || ''}`;
  if (a.scheduledDate && slot(a) !== slot(b)) {
    out.push({ event: 'appointment', key: `appt_${slot(a)}`, values: { ticket: t, date: a.scheduledDate, time: a.scheduledStartTime ? `${a.scheduledStartTime}${a.scheduledEndTime ? '-' + a.scheduledEndTime : ''}` : 'during the day' } });
  }
  if (a.status === 'completed' && b.status !== 'completed') out.push({ event: 'completed', key: 'completed', values: { ticket: t } });
  return out;
}

// settings/messaging: { enabled, channel: 'sms'|'whatsapp', events: { booking: { on, templateId }, … },
//   whatsappNumber, whatsappNamespace, whatsappLanguage }
function plan(settings, authKey, event) {
  const s = settings || {};
  if (!s.enabled) return { skip: 'messaging is switched off' };
  if (!authKey) return { skip: 'MSG91 key not set on the server' };
  const e = (s.events || {})[event] || {};
  if (!e.on) return { skip: `${event} messages are switched off` };
  if (!e.templateId) return { skip: `no template for ${event}` };
  const channel = s.channel === 'whatsapp' ? 'whatsapp' : 'sms';
  if (channel === 'whatsapp' && !s.whatsappNumber) return { skip: 'no WhatsApp number set' };
  return { channel, templateId: String(e.templateId) };
}

// The MSG91 request for one message.
function request({ channel, templateId }, settings, to, event, values) {
  const list = EVENTS[event].vars.map((k) => String(values[k] == null ? '' : values[k]).slice(0, 60));
  if (channel === 'whatsapp') {
    const components = {};
    list.forEach((v, i) => { components[`body_${i + 1}`] = { type: 'text', value: v }; });
    return {
      url: 'https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/',
      body: { integrated_number: String(settings.whatsappNumber), content_type: 'template', payload: { messaging_product: 'whatsapp', type: 'template', template: {
        name: templateId, language: { code: settings.whatsappLanguage || 'en', policy: 'deterministic' }, ...(settings.whatsappNamespace ? { namespace: settings.whatsappNamespace } : {}),
        to_and_components: [{ to: [to], components }] } } }
    };
  }
  const recipient = { mobiles: to };
  list.forEach((v, i) => { recipient[`var${i + 1}`] = v; });
  return { url: 'https://control.msg91.com/api/v5/flow', body: { template_id: templateId, short_url: '0', recipients: [recipient] } };
}

// Sends one message. Never throws: returns { status: 'sent'|'skipped'|'failed', … }.
async function send({ settings, authKey, phone, event, values, fetchFn = globalThis.fetch }) {
  const to = phone91(phone);
  if (!to) return { status: 'skipped', reason: 'no valid mobile number' };
  const p = plan(settings, authKey, event);
  if (p.skip) return { status: 'skipped', reason: p.skip };
  const r = request(p, settings, to, event, values);
  try {
    const res = await fetchFn(r.url, { method: 'POST', headers: { authkey: authKey, 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(r.body) });
    const text = await res.text();
    if (!res.ok || /"type"\s*:\s*"error"/.test(text)) return { status: 'failed', channel: p.channel, reason: `MSG91 ${res.status}: ${text.slice(0, 200)}` };
    return { status: 'sent', channel: p.channel };
  } catch (e) {
    return { status: 'failed', channel: p.channel, reason: String(e && e.message || e).slice(0, 200) };
  }
}

module.exports = { EVENTS, phone91, eventsFor, plan, request, send };
