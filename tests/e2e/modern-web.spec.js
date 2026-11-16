// Modern browser features (from the modern-web-guidance legacy scan):
// native <dialog> pop-ups, and Enter keys that ignore the Enter used to pick
// a word on an Indian-language (IME) keyboard.
const { test, expect } = require('@playwright/test');
const { startStaticServer } = require('./support/static-server');
const { installFirebaseStub } = require('./support/firebase-stub');
const { sampleFor } = require('./support/sample-data');

let origin, server;
test.beforeAll(async () => { ({ server, origin } = await startStaticServer()); });
test.afterAll(async () => { if (server) server.close(); });

async function openCrm(page, role, file) {
  await installFirebaseStub(page, { role, uid: 'u1', data: sampleFor(role), profile: { role, displayName: 'Tarun', email: 't@pe.test' } });
  await page.route(/^https?:\/\//, (r) => (r.request().url().startsWith(origin) || /gstatic\.com\/firebasejs/.test(r.request().url()) ? r.fallback() : r.abort()));
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(origin + '/crm/' + file, { waitUntil: 'load' });
  await page.waitForFunction(() => { const a = document.getElementById('app'); return a && getComputedStyle(a).display !== 'none'; }, null, { timeout: 10000 });
  await page.waitForTimeout(400);
  return errors;
}
const enter = (page, sel, composing) => page.locator(sel).evaluate((el, c) => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, isComposing: c }));
}, composing);

test('cookie settings is a native modal dialog; a tap outside closes it without saving', async ({ page }) => {
  await page.route(/^https?:\/\//, (r) => (r.request().url().startsWith(origin) ? r.fallback() : r.abort()));
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.locator('.pe-cc [data-cc="choose"]').click();
  const d = page.locator('dialog.pe-cc-dialog');
  await expect(d).toBeVisible();
  await expect(page.locator('#pe-cc-a')).toBeFocused();
  await page.mouse.click(4, 4);
  await expect(d).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('pe.consent'))).toBeNull();
});

test('CRM Report Bug opens a native modal dialog; Esc and Cancel close it, a tap outside keeps the typed report', async ({ page }) => {
  const errors = await openCrm(page, 'superadmin', 'CRMsuperadmin.html');
  await page.click('#pe-bug-trigger');
  const d = page.locator('dialog.pe-bug-modal');
  await expect(d).toBeVisible();
  expect(await d.evaluate((x) => x.matches(':modal'))).toBe(true);
  await page.fill('#pe-bug-title-input', 'Half-written report');
  await page.mouse.click(4, 4);
  await expect(d).toBeVisible();
  await expect(page.locator('#pe-bug-title-input')).toHaveValue('Half-written report');
  await page.keyboard.press('Escape');
  await expect(d).toBeHidden();
  await page.click('#pe-bug-trigger');
  await page.click('.pe-bug-cancel');
  await expect(d).toBeHidden();
  expect(errors).toEqual([]);
});

test('Customer 360: the Enter that picks a word on a phone keyboard does not search; a normal Enter does', async ({ page }) => {
  await openCrm(page, 'superadmin', 'CRMsuperadmin.html');
  await page.locator('.sidebar .nav-item', { hasText: 'Customer 360' }).click();
  await page.fill('#c360-phone-input', '12');
  await enter(page, '#c360-phone-input', true);
  await page.waitForTimeout(300);
  await expect(page.locator('#c360-error')).not.toHaveClass(/show/);
  await enter(page, '#c360-phone-input', false);
  await expect(page.locator('#c360-error')).toContainText('10-digit');
});

test('old copies of the CRM and site pages inside the logos folder are gone', async ({ request }) => {
  for (const p of ['assets/logos/crm/CRMsuperadmin.html', 'assets/logos/index.html', 'assets/logos/firestore.rules', 'assets/logos/makwell/index.html']) {
    expect((await request.get(origin + '/' + p)).status(), p).toBe(404);
  }
  expect((await request.get(origin + '/assets/logos/makwell-logo.jpeg')).status()).toBe(200);
});
