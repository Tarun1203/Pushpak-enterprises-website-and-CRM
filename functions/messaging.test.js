// Customer messages: which events fire, switched-off behaviour, and the MSG91 request.
const test = require('node:test');
const assert = require('node:assert');
const M = require('./messaging');

test('phone numbers normalise to 91XXXXXXXXXX or nothing', () => {
  assert.strictEqual(M.phone91('98450 12345'), '919845012345');
  assert.strictEqual(M.phone91('+91 9845012345'), '919845012345');
  assert.strictEqual(M.phone91('09845012345'), '919845012345');
  assert.strictEqual(M.phone91('12345'), null);
});
test('events: booking on website request; assigned, appointment, completed on tickets', () => {
  assert.deepStrictEqual(M.eventsFor('publicServiceRequests', 'PE-SVC-1', null, { customerPhone: '9845012345', requestId: 'PE-SVC-1', brand: 'MakWell', category: 'Geyser' }).map((e) => e.event), ['booking']);
  assert.deepStrictEqual(M.eventsFor('publicServiceRequests', 'x', { status: 'new' }, { customerPhone: '9845012345', status: 'assigned' }), []);
  const ev = M.eventsFor('centerRequests', 'c1', { status: 'in_progress' }, { customerPhone: '9845012345', requestId: 'PE-CR-1', technicianUid: 't1', technicianName: 'Ramesh', scheduledDate: '2026-11-02', scheduledStartTime: '10:00', status: 'completed' });
  assert.deepStrictEqual(ev.map((e) => e.event), ['assigned', 'appointment', 'completed']);
  assert.strictEqual(ev[1].values.time, '10:00');
  assert.deepStrictEqual(M.eventsFor('centerRequests', 'c1', {}, { status: 'completed' }), [], 'no phone, no message');
});
test('nothing is sent while switched off, without a key, or without a template', async () => {
  let calls = 0; const fetchFn = async () => { calls++; return { ok: true, status: 200, text: async () => '{}' }; };
  const on = { enabled: true, channel: 'sms', events: { completed: { on: true, templateId: 'T1' } } };
  assert.strictEqual((await M.send({ settings: { ...on, enabled: false }, authKey: 'k', phone: '9845012345', event: 'completed', values: { ticket: 'X' }, fetchFn })).status, 'skipped');
  assert.strictEqual((await M.send({ settings: on, authKey: '', phone: '9845012345', event: 'completed', values: { ticket: 'X' }, fetchFn })).status, 'skipped');
  assert.strictEqual((await M.send({ settings: on, authKey: 'k', phone: '9845012345', event: 'assigned', values: {}, fetchFn })).status, 'skipped');
  assert.strictEqual(calls, 0);
  assert.strictEqual((await M.send({ settings: on, authKey: 'k', phone: '9845012345', event: 'completed', values: { ticket: 'X' }, fetchFn })).status, 'sent');
  assert.strictEqual(calls, 1);
});
test('MSG91 requests: SMS flow vars and WhatsApp body components; errors reported, never thrown', async () => {
  const sms = M.request({ channel: 'sms', templateId: 'T1' }, {}, '919845012345', 'appointment', { ticket: 'PE-1', date: '2026-11-02', time: '10:00' });
  assert.deepStrictEqual(sms.body.recipients[0], { mobiles: '919845012345', var1: 'PE-1', var2: '2026-11-02', var3: '10:00' });
  const wa = M.request({ channel: 'whatsapp', templateId: 'job_done' }, { whatsappNumber: '918000000000' }, '919845012345', 'completed', { ticket: 'PE-1' });
  assert.strictEqual(wa.body.payload.template.name, 'job_done');
  assert.deepStrictEqual(wa.body.payload.template.to_and_components[0], { to: ['919845012345'], components: { body_1: { type: 'text', value: 'PE-1' } } });
  const on = { enabled: true, channel: 'sms', events: { completed: { on: true, templateId: 'T1' } } };
  const bad = await M.send({ settings: on, authKey: 'k', phone: '9845012345', event: 'completed', values: { ticket: 'X' }, fetchFn: async () => ({ ok: false, status: 401, text: async () => 'bad key' }) });
  assert.strictEqual(bad.status, 'failed');
  const thrown = await M.send({ settings: on, authKey: 'k', phone: '9845012345', event: 'completed', values: { ticket: 'X' }, fetchFn: async () => { throw new Error('offline'); } });
  assert.strictEqual(thrown.status, 'failed');
});
