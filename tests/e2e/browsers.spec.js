// Phase 10 item 11 - browser and device compatibility. The same short
// journey runs on Chrome, Edge (Chromium engine), Firefox, Safari (WebKit),
// an Android phone, an iPhone and an iPad: the public site opens, the login
// page opens, a CRM dashboard opens for its role, a printable document
// renders, the error notice works. Locally only the browsers installed here
// run; CI installs Firefox and WebKit too.
const { test, expect } = require('@playwright/test');
const { startStaticServer } = require('./support/static-server');
const { installFirebaseStub } = require('./support/firebase-stub');
const { sampleFor } = require('./support/sample-data');
const Docs = require('../../crm/documents.js');

let origin, server;
test.beforeAll(async () => { ({ server, origin } = await startStaticServer()); });
test.afterAll(async () => { if (server) server.close(); });

const noOverflow = async (page, what) => {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over, `sideways scroll on ${what}`).toBeLessThanOrEqual(2);
};
const blockOutside = (page) => page.route(/^https?:\/\//, (r) => (r.request().url().startsWith(origin) || /gstatic\.com\/firebasejs/.test(r.request().url()) ? r.fallback() : r.abort()));

test('public home page opens with a title and no script errors', async ({ page }) => {
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await blockOutside(page);
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  expect((await page.title()).length).toBeGreaterThan(3);
  await expect(page.locator('body')).toBeVisible();
  await noOverflow(page, 'home');
  expect(errors).toEqual([]);
});

test('login page opens and shows the sign-in form', async ({ page }) => {
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await installFirebaseStub(page, {});
  await blockOutside(page);
  await page.goto(origin + '/crm/login.html', { waitUntil: 'load' });
  await expect(page.locator('input[type="password"]').first()).toBeVisible();
  await expect(page.locator('input[type="email"], input[name="email"], #email').first()).toBeVisible();
  await noOverflow(page, 'login');
  expect(errors).toEqual([]);
});

for (const [role, path] of [['technician', 'CRMtechnician.html'], ['servicecenter', 'CRMservicecenter.html'], ['warehouse', 'CRMwarehouse.html'], ['superadmin', 'CRMsuperadmin.html']]) {
  test(`${role} dashboard opens`, async ({ page }) => {
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await installFirebaseStub(page, { role, uid: 'u1', data: sampleFor(role) });
    await blockOutside(page);
    await page.goto(origin + '/crm/' + path, { waitUntil: 'load' });
    await page.waitForFunction(() => { const a = document.getElementById('app'); return a && getComputedStyle(a).display !== 'none'; }, null, { timeout: 15000 });
    await noOverflow(page, role);
    expect(errors).toEqual([]);
  });
}

test('a printable document renders and its print button exists', async ({ page }) => {
  await page.setContent(Docs.render('voucher', { requestId: 'PE-1', customerName: 'Ravi', status: 'closed' }, 'a5'));
  await expect(page.locator('h1')).toHaveText('Service Voucher');
  await expect(page.locator('.bar button')).toBeVisible();
  await noOverflow(page, 'document');
});

test('an unexpected error shows a plain message, and going offline shows a banner', async ({ page, context }) => {
  await installFirebaseStub(page, {});
  await blockOutside(page);
  await page.goto(origin + '/crm/login.html', { waitUntil: 'load' });
  await page.evaluate(() => setTimeout(() => { throw new Error('boom'); }, 0));
  await expect(page.locator('#pe-notice')).toBeVisible();
  await expect(page.locator('#pe-notice')).toContainText(/went wrong/i);
  await page.click('#pe-notice button');
  await expect(page.locator('#pe-notice')).toBeHidden();
  await context.setOffline(true);
  await expect(page.locator('#pe-notice')).toContainText(/offline/i);
  await context.setOffline(false);
  await expect(page.locator('#pe-notice')).toContainText(/back online/i);
});

test('a double tap on a primary button runs it once', async ({ page }) => {
  await installFirebaseStub(page, {});
  await blockOutside(page);
  await page.goto(origin + '/crm/login.html', { waitUntil: 'load' });
  const n = await page.evaluate(() => {
    const b = document.createElement('button'); b.className = 'btn-primary'; b.type = 'button'; b.textContent = 'Save';
    let c = 0; b.addEventListener('click', () => c++); document.body.appendChild(b);
    b.click(); b.click(); b.click(); return c;
  });
  expect(n).toBe(1);
});
