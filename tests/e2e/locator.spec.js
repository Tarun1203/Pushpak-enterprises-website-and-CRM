// Find a service center or store: list nearest first, map on request only,
// location only on request, Super Admin keeps the list.
const { test, expect } = require('@playwright/test');
const { startStaticServer } = require('./support/static-server');
const { installFirebaseStub } = require('./support/firebase-stub');
const { sampleFor } = require('./support/sample-data');
const { runAxe } = require('./a11y-audit');

let origin, server;
test.beforeAll(async () => { ({ server, origin } = await startStaticServer()); });
test.afterAll(async () => { if (server) server.close(); });

const LOCS = [
  { id: 'l1', type: 'servicecenter', name: 'Raichur Service Center', phone: '9845000001', whatsapp: '9845000001', address: 'Station Road', city: 'Raichur', district: 'Raichur', pincode: '584101', hours: 'Mon–Sat 9:30–7', lat: 16.2076, lng: 77.3463, active: true },
  { id: 'l2', type: 'store', name: 'Pushpak Store Hubli', phone: '9980000515', address: 'New Timber Yard, Unkal', city: 'Hubli', district: 'Dharwad', pincode: '580031', lat: 15.3647, lng: 75.124, brands: ['MakWell', 'Flyvision'], active: true },
  { id: 'l3', type: 'store', name: 'Sindhanur Electricals', phone: '9845000003', address: 'Main Road', city: 'Sindhanur', district: 'Raichur', pincode: '584128', lat: 15.7698, lng: 76.7559, active: true },
  { id: 'l4', type: 'servicecenter', name: 'Ballari Service Point', phone: '9845000004', city: 'Ballari', pincode: '583101', active: true }, // no map position
  { id: 'l5', type: 'store', name: 'Hidden Shop', city: 'Raichur', pincode: '584101', lat: 16.2, lng: 77.3, active: false }
];

async function open(page, locs, opts) {
  const seen = [];
  await installFirebaseStub(page, { role: 'none', uid: 'u1', data: { publicLocations: locs === undefined ? LOCS : locs } });
  await page.route(/^https?:\/\//, (r) => { const u = r.request().url(); seen.push(u); return u.startsWith(origin) || /gstatic\.com\/firebasejs/.test(u) ? r.fallback() : r.abort(); });
  await page.addInitScript(() => localStorage.setItem('pe.consent', JSON.stringify({ v: 1, essential: true, analytics: false, preferences: false, at: new Date().toISOString() })));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(origin + '/index.html' + ((opts && opts.hash) || ''), { waitUntil: 'load' });
  await page.waitForTimeout(400);
  if (!(opts && opts.hash)) await page.locator('.service-card', { hasText: 'Find service center' }).first().click();
  await expect(page.locator('#locator-overlay')).toBeVisible();
  await expect(page.locator('#loc-status')).not.toHaveText(/Loading/);
  return { errors, seen };
}
const names = (page) => page.locator('#loc-list .loc-item h4').allTextContents();

test('Find service center opens the finder with every published location (hidden ones left out), Call / WhatsApp / Directions', async ({ page }) => {
  const { errors } = await open(page);
  expect(await names(page)).toEqual(['Ballari Service Point', 'Pushpak Store Hubli', 'Raichur Service Center', 'Sindhanur Electricals']);
  const first = page.locator('.loc-item', { hasText: 'Raichur Service Center' });
  await expect(first.locator('a', { hasText: 'Call' })).toHaveAttribute('href', 'tel:9845000001');
  await expect(first.locator('a', { hasText: 'WhatsApp' })).toHaveAttribute('href', 'https://wa.me/919845000001');
  await expect(first.locator('a', { hasText: 'Directions' })).toHaveAttribute('href', /google\.com\/maps\/dir\/\?api=1&destination=16\.2076%2C77\.3463/);
  await expect(first.locator('a', { hasText: 'Directions' })).toHaveAttribute('rel', /noopener/);
  await expect(page.locator('.loc-item', { hasText: 'Ballari' }).locator('[data-loc-show]')).toHaveCount(0); // no position, no map button
  await expect(page.locator('.loc-item', { hasText: 'Pushpak Store Hubli' })).toContainText('MakWell, Flyvision');
  expect(errors).toEqual([]);
});

test('filter by type, search by city, and a pincode puts that area first with approximate distances', async ({ page }) => {
  await open(page);
  await page.locator('[data-loc-filter="store"]').click();
  await expect(page.locator('[data-loc-filter="store"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await names(page)).toEqual(['Pushpak Store Hubli', 'Sindhanur Electricals']);
  await page.locator('[data-loc-filter="all"]').click();
  await page.fill('#loc-q', 'hubli'); await page.click('#loc-form button[type=submit]');
  expect(await names(page)).toEqual(['Pushpak Store Hubli']);
  await page.fill('#loc-q', 'Mysuru'); await page.click('#loc-form button[type=submit]');
  await expect(page.locator('#loc-status')).toContainText('Nothing matches');
  expect((await names(page)).length).toBe(4);
  await page.fill('#loc-q', '584101'); await page.click('#loc-form button[type=submit]');
  const order = await names(page);
  expect(order[0]).toBe('Raichur Service Center');
  expect(order[1]).toBe('Sindhanur Electricals'); // 5841xx shares more of the pincode
  await expect(page.locator('#loc-status')).toContainText('approximate');
  await expect(page.locator('.loc-item', { hasText: 'Sindhanur' }).locator('.loc-dist')).toContainText(/about \d+ km away/);
});

test('Use my location: nothing is asked until the button is pressed; then the nearest is first, with real distances', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 15.36, longitude: 75.13 }); // in Hubli
  await page.addInitScript(() => { window.__geoAsked = 0; const g = navigator.geolocation; const orig = g.getCurrentPosition.bind(g); g.getCurrentPosition = (...a) => { window.__geoAsked++; return orig(...a); }; });
  await open(page);
  expect(await page.evaluate(() => window.__geoAsked)).toBe(0);
  await page.click('#loc-near');
  await expect(page.locator('#loc-status')).toContainText('nearest to you first');
  expect((await names(page))[0]).toBe('Pushpak Store Hubli');
  await expect(page.locator('.loc-item').first().locator('.loc-dist')).toContainText(/^\d+(\.\d)? ?(m|km) away$/);
  expect(await page.evaluate(() => window.__geoAsked)).toBe(1);
  expect(await page.evaluate(() => JSON.stringify(localStorage) + document.cookie)).not.toContain('15.36');
});

test('Use my location refused: a plain message, and the list still works', async ({ page, context }) => {
  await context.clearPermissions();
  await page.addInitScript(() => { navigator.geolocation.getCurrentPosition = (ok, fail) => setTimeout(() => fail({ code: 1 }), 10); });
  await open(page);
  await page.click('#loc-near');
  await expect(page.locator('#loc-status')).toContainText('could not get your location');
  expect((await names(page)).length).toBe(4);
});

test('the map loads only on request (self-hosted Leaflet, OpenStreetMap tiles), with a pin per located place', async ({ page }) => {
  const { seen, errors } = await open(page);
  await page.waitForTimeout(300);
  expect(seen.filter((u) => /openstreetmap|leaflet/i.test(u)), 'nothing map-related before the tap').toEqual([]);
  await expect(page.locator('#loc-map')).toBeHidden();
  await page.click('#loc-map-btn');
  await expect(page.locator('#loc-map .leaflet-container, #loc-map.leaflet-container')).toHaveCount(1);
  await expect(page.locator('#loc-map path.leaflet-interactive')).toHaveCount(3); // Ballari has no position
  expect(seen.some((u) => u.startsWith(origin) && /vendor\/leaflet\/leaflet\.js/.test(u))).toBe(true);
  expect(seen.some((u) => /tile\.openstreetmap\.org/.test(u))).toBe(true);
  expect(seen.filter((u) => /unpkg|jsdelivr|cdnjs|googleapis/.test(u))).toEqual([]);
  await expect(page.locator('#loc-map .leaflet-control-attribution')).toContainText('OpenStreetMap');
  await page.locator('.loc-item', { hasText: 'Sindhanur' }).locator('[data-loc-show]').click();
  await expect(page.locator('.leaflet-popup-content')).toContainText('Sindhanur Electricals');
  expect(errors).toEqual([]);
});

test('no locations yet: a clear message and the enquiry link; the enquiry opens the support form', async ({ page }) => {
  await open(page, []);
  await expect(page.locator('#loc-status')).toContainText('being updated');
  await expect(page.locator('#loc-map-wrap')).toBeHidden();
  await page.click('[data-loc-enquiry]');
  await expect(page.locator('#locator-overlay')).toBeHidden();
  await expect(page.locator('#service-modal-overlay')).toBeVisible();
});

test('deep link #find-service-center opens the finder; Esc closes and focus returns', async ({ page }) => {
  await open(page, undefined, { hash: '#find-service-center' });
  await page.keyboard.press('Escape');
  await expect(page.locator('#locator-overlay')).toBeHidden();
  const tile = page.locator('.service-card', { hasText: 'Find service center' }).first();
  await tile.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#locator-overlay')).toBeVisible();
  await expect(page.locator('#locator-overlay .modal')).toHaveAttribute('role', 'dialog');
  await page.keyboard.press('Escape');
  await expect(tile).toBeFocused();
});

test('accessible (axe, WCAG 2.2 AA) with the list and with the map, and fits a 360px phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 760 });
  await open(page);
  await page.waitForTimeout(400);
  expect(await runAxe(page)).toEqual([]);
  await page.click('#loc-map-btn');
  await expect(page.locator('#loc-map path.leaflet-interactive')).toHaveCount(3);
  expect(await runAxe(page, { exclude: [['.leaflet-tile-pane']] })).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const box = await page.locator('#locator-overlay .modal').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(361);
});

test('Super Admin: Store & Service Locations lists, adds (reading a Google Maps link), hides and imports service centers', async ({ page }) => {
  const data = sampleFor('superadmin');
  data.publicLocations = [LOCS[0], LOCS[4]];
  data.serviceCenterProfiles = [{ id: 'scA', displayName: 'Lingsugur Service Center', officialMobile: '9845011111', address: 'Bus Stand Road', city: 'Lingsugur', pincode: '584122', latitude: '16.1580', longitude: '76.5206', status: 'active' },
    { id: 'scB', displayName: 'Manvi Service Point', city: 'Manvi', pincode: '584123', status: 'active' }];
  await installFirebaseStub(page, { role: 'superadmin', uid: 'u1', data, profile: { role: 'superadmin', displayName: 'T', email: 't@pe.test' } });
  await page.route(/^https?:\/\//, (r) => (r.request().url().startsWith(origin) || /gstatic\.com\/firebasejs/.test(r.request().url()) ? r.fallback() : r.abort()));
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(origin + '/crm/CRMsuperadmin.html', { waitUntil: 'load' });
  await page.waitForFunction(() => { const a = document.getElementById('app'); return a && getComputedStyle(a).display !== 'none'; }, null, { timeout: 10000 });
  await page.locator('.sidebar .nav-item', { hasText: 'Store & Service Locations' }).click();
  await expect(page.locator('#loc-tbody tr')).toHaveCount(2);
  await expect(page.locator('#loc-tbody tr', { hasText: 'Hidden Shop' })).toContainText('Hidden');
  // add a store from a Google Maps link
  await page.click('#loc-add');
  await page.fill('#locf-name', 'Pushpak Store Hubli');
  await page.fill('#locf-phone', '9980000515');
  await page.fill('#locf-pincode', '580031');
  await page.fill('#locf-maplink', 'https://www.google.com/maps/place/Pushpak/@15.3647,75.1240,17z');
  await expect(page.locator('#locf-pos')).toContainText('15.36470, 75.12400');
  await page.click('#locf-save');
  await expect(page.locator('#locf')).toHaveCount(0);
  let w = await page.evaluate(() => window.__stubWrites);
  const add = w.find(([op, p, d]) => op === 'set' && /^publicLocations\/loc_/.test(p));
  expect(add[2]).toMatchObject({ type: 'store', name: 'Pushpak Store Hubli', phone: '9980000515', pincode: '580031', lat: 15.3647, lng: 75.124, active: true });
  // bad input is refused with a reason (wait out the CRM's double-tap guard first)
  await page.waitForTimeout(900);
  await page.click('#loc-add');
  await page.fill('#locf-name', 'X'); await page.fill('#locf-maplink', 'https://maps.app.goo.gl/abc');
  await page.click('#locf-save');
  await expect(page.locator('#locf-err')).toContainText('could not be read');
  await page.click('#locf-cancel');
  // hide
  await page.locator('#loc-tbody tr', { hasText: 'Raichur Service Center' }).locator('button', { hasText: 'Hide' }).click();
  w = await page.evaluate(() => window.__stubWrites);
  expect(w.some(([op, p, d]) => op === 'update' && p === 'publicLocations/l1' && d.active === false)).toBe(true);
  // import service centers from their profiles
  await page.click('#loc-import');
  await expect(page.locator('#loc-msg')).toContainText('2 new');
  await expect(page.locator('#loc-msg')).toContainText('1 have no map position');
  w = await page.evaluate(() => window.__stubWrites);
  const imp = w.find(([op, p]) => op === 'set' && p === 'publicLocations/sc_scA');
  expect(imp[2]).toMatchObject({ type: 'servicecenter', name: 'Lingsugur Service Center', phone: '9845011111', lat: 16.158, lng: 76.5206, active: true });
  expect(errors).toEqual([]);
});
