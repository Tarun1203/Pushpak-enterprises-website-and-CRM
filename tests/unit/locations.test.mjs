// Store & service-center locator: reading a map position out of what Head
// Office pastes into the Super Admin form.
import test from 'node:test';
import assert from 'node:assert';
import { parseLatLng } from '../../crm/locations-admin.js';

test('reads a position from the common Google Maps link shapes and plain coordinates', () => {
  const cases = [
    ['https://www.google.com/maps/place/Pushpak/@15.3647,75.1240,17z/data=!3m1', [15.3647, 75.124]],
    ['https://www.google.com/maps/place/X/data=!4m6!3m5!1s0x0:0x0!8m2!3d16.2076!4d77.3463', [16.2076, 77.3463]],
    ['https://maps.google.com/?q=16.2076,77.3463', [16.2076, 77.3463]],
    ['https://www.google.com/maps/search/?api=1&query=16.2076%2C77.3463', [16.2076, 77.3463]],
    ['16.2076, 77.3463', [16.2076, 77.3463]],
    ['  15.36 75.12 ', [15.36, 75.12]]
  ];
  for (const [text, [lat, lng]] of cases) assert.deepStrictEqual(parseLatLng(text), { lat, lng }, text);
});

test('returns nothing for links without a position, empty text, impossible or zero coordinates', () => {
  for (const t of ['', '   ', 'https://maps.app.goo.gl/AbCdEf', 'Raichur', '95, 75', '15, 190', '0, 0', 'https://www.google.com/maps/place/Raichur']) {
    assert.strictEqual(parseLatLng(t), null, JSON.stringify(t));
  }
});
