// Customer confirmation at closing (code or signature), Super Admin's
// Customer Messages & Closing screen, and the Warehouse profile.
const { test, expect } = require('@playwright/test');
const { startStaticServer } = require('./support/static-server');
const { installFirebaseStub } = require('./support/firebase-stub');
const { sampleFor } = require('./support/sample-data');

const PAGES = { superadmin: 'crm/CRMsuperadmin.html', servicecenter: 'crm/CRMservicecenter.html', warehouse: 'crm/CRMwarehouse.html' };
let origin, server;
test.beforeAll(async () => { ({ server, origin } = await startStaticServer()); });
test.afterAll(async () => { if (server) server.close(); });

async function openAs(page, role, data) {
  await installFirebaseStub(page, { role, uid: 'u1', data, profile: { role, displayName: 'Tarun', email: 't@pe.test' } });
  await page.route(/^https?:\/\//, (r) => (r.request().url().startsWith(origin) || /gstatic\.com\/firebasejs/.test(r.request().url()) ? r.fallback() : r.abort()));
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(origin + '/' + PAGES[role], { waitUntil: 'load' });
  await page.waitForFunction(() => { const a = document.getElementById('app'); return a && getComputedStyle(a).display !== 'none'; }, null, { timeout: 10000 });
  await page.waitForTimeout(400);
  return errors;
}
const nav = (page, label) => page.locator('.sidebar .nav-item', { hasText: new RegExp('^\\s*' + label + '\\s*$') }).first().click();
const writes = (page) => page.evaluate(() => window.__stubWrites || []);
const completed = async (page) => (await writes(page)).filter(([op, p, d]) => op === 'update' && p === 'centerRequests/crR' && d.status === 'completed');

function centerData(required) {
  const data = sampleFor('servicecenter');
  data.spareRequests = [];
  data.centerRequests = [{ id: 'crR', requestId: 'PE-CR-20261012-0002-ServiceCenter', serviceCenterUid: 'u1', customerName: 'Mallik', customerPhone: '9342618555', status: 'in_progress', type: 'service', product: 'Iron Box', category: 'Iron Box', createdAt: { __ms: Date.now() - 3600000 } }];
  data.settings = [{ id: 'closeConfirmation', required }];
  return data;
}
async function openClosing(page, required) {
  const errors = await openAs(page, 'servicecenter', centerData(required));
  await nav(page, 'Center Requests');
  await page.locator('tr', { hasText: 'PE-CR-20261012-0002' }).locator('.req-complete-btn').first().click();
  await expect(page.locator('#sc-closure-overlay')).toBeVisible();
  await page.selectOption('#sc-closure-code', 'repaired');
  await page.fill('#sc-closure-notes', 'Replaced thermostat');
  await page.fill('#sc-closure-parts-notes', 'None');
  return errors;
}

test('required: closing without the customer\'s confirmation is stopped; with the code it goes through', async ({ page }) => {
  const errors = await openClosing(page, true);
  const box = page.locator('#sc-closure-form .close-confirm');
  await expect(box).toContainText('(required)');
  await box.locator('.cc-send').click();
  await expect(box.locator('.cc-status')).toContainText('My Service');
  await page.click('#sc-closure-form button[type=submit]');
  await expect(page.locator('#sc-closure-error')).toContainText('completion code');
  expect(await completed(page)).toEqual([]);
  await page.fill('#sc-cc-otp', '12a');
  await page.waitForTimeout(900);
  await page.click('#sc-closure-form button[type=submit]');
  await expect(page.locator('#sc-closure-error')).toContainText('4 digits');
  await page.fill('#sc-cc-otp', '0427');
  await page.waitForTimeout(900);
  await page.click('#sc-closure-form button[type=submit]');
  await expect.poll(async () => (await completed(page)).length, { timeout: 8000 }).toBe(1);
  expect((await completed(page))[0][2]).toMatchObject({ closeOtp: '0427', closureCode: 'repaired' });
  expect(errors).toEqual([]);
});

test('signature: the customer signs on screen; the image goes with the closing', async ({ page }) => {
  await openClosing(page, true);
  const box = page.locator('#sc-closure-form .close-confirm');
  await box.locator('input[value="signature"]').check();
  const cv = box.locator('canvas');
  await cv.scrollIntoViewIfNeeded();
  const b = await cv.boundingBox();
  await page.mouse.move(b.x + 20, b.y + 40); await page.mouse.down();
  await page.mouse.move(b.x + 120, b.y + 90, { steps: 8 }); await page.mouse.move(b.x + 220, b.y + 30, { steps: 8 }); await page.mouse.up();
  await expect(box.locator('.cc-signer')).toHaveValue('Mallik');
  await page.click('#sc-closure-form button[type=submit]');
  await expect.poll(async () => (await completed(page)).length, { timeout: 8000 }).toBe(1);
  const sig = (await completed(page))[0][2].customerSignature;
  expect(sig.name).toBe('Mallik');
  expect(sig.path).toMatch(/^closeSignatures\/centerRequests\/crR\/\d+\.png$/);
});

test('not required: a job still closes with no confirmation (marked recommended)', async ({ page }) => {
  await openClosing(page, false);
  await expect(page.locator('#sc-closure-form .close-confirm')).toContainText('(recommended)');
  await page.click('#sc-closure-form button[type=submit]');
  await expect.poll(async () => (await completed(page)).length).toBe(1);
  expect((await completed(page))[0][2].closeOtp).toBeUndefined();
});

test('Super Admin: Customer Messages & Closing saves the closing rule and message settings', async ({ page }) => {
  const errors = await openAs(page, 'superadmin', sampleFor('superadmin'));
  await nav(page, 'Customer Messages & Closing');
  await page.check('#cc-required');
  await page.click('#cc-save');
  await expect(page.locator('#cc-msg')).toHaveText('Saved.');
  await page.check('#m-enabled');
  await page.check('#m-on-completed');
  await page.click('#m-save');
  await expect(page.locator('#m-msg')).toContainText('Job completed: add the template ID');
  await page.fill('#m-tpl-completed', '6611ab');
  await page.waitForTimeout(900);
  await page.click('#m-save');
  await expect(page.locator('#m-msg')).toContainText('Saved');
  const w = await writes(page);
  expect(w.find(([op, p]) => op === 'set' && p === 'settings/closeConfirmation')[2].required).toBe(true);
  expect(w.find(([op, p]) => op === 'set' && p === 'settings/messaging')[2]).toMatchObject({ enabled: true, channel: 'sms', events: { completed: { on: true, templateId: '6611ab' } } });
  expect(errors).toEqual([]);
});

test('Warehouse: Profile is built and saves the warehouse details', async ({ page }) => {
  const errors = await openAs(page, 'warehouse', sampleFor('warehouse'));
  await nav(page, 'Profile');
  await page.fill('#whp-wname', 'Central Warehouse, Raichur');
  await page.fill('#whp-phone', '9845012345');
  await page.click('#whp-save');
  await expect(page.locator('#whp-success')).toHaveText('Saved.');
  const w = (await writes(page)).find(([op, p]) => op === 'set' && p === 'users/u1');
  expect(w[2]).toMatchObject({ warehouseName: 'Central Warehouse, Raichur', phone: '9845012345' });
  expect(errors).toEqual([]);
});
