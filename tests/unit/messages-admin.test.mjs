// Super Admin > Customer Messages: form -> settings/messaging.
import test from 'node:test';
import assert from 'node:assert';
import { messagingSettings } from '../../crm/messages-admin.js';

test('switched on: every message that is on needs a template; WhatsApp needs the number', () => {
  const r = messagingSettings({ enabled: true, channel: 'sms', on_booking: true, tpl_booking: ' 6611ab ', on_completed: true, tpl_completed: '' });
  assert.strictEqual(r.settings.events.booking.templateId, '6611ab');
  assert.strictEqual(r.problems.length, 1);
  assert.match(r.problems[0], /Job completed/);
  const w = messagingSettings({ enabled: true, channel: 'whatsapp', whatsappNumber: '+91 98450-12345' });
  assert.strictEqual(w.settings.whatsappNumber, '919845012345');
  assert.deepStrictEqual(w.problems, []);
  assert.match(messagingSettings({ enabled: true, channel: 'whatsapp', whatsappNumber: '12' }).problems[0], /WhatsApp/);
});
test('switched off: saved as off, no checks', () => {
  const r = messagingSettings({ enabled: false, on_completed: true });
  assert.strictEqual(r.settings.enabled, false);
  assert.deepStrictEqual(r.problems, []);
});
