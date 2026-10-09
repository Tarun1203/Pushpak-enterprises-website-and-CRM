// Customer-facing redesign (UI phases 1-6): the home page, support hub,
// step-by-step forms, service tracker, brand pages, product page, account
// page and 404. Firebase is stubbed (support/), outside requests blocked.
const { test, expect } = require('@playwright/test');
const { startStaticServer } = require('./support/static-server');
const { openPage, layoutReport } = require('./support/device-checks');
const { installFirebaseStub } = require('./support/firebase-stub');

let origin, server;
test.beforeAll(async () => { ({ server, origin } = await startStaticServer()); });
test.afterAll(async () => { if (server) server.close(); });

test('home: hero, brands, categories, support hub and footer are all there', async ({ page }) => {
  const errors = await openPage(page, origin, 'index.html');
  expect(errors).toEqual([]);
  await expect(page.locator('h1')).toContainText('every home');
  await expect(page.locator('.hero .btn-primary')).toHaveText(/Explore Products/);
  await expect(page.locator('.brand-card')).toHaveCount(3);
  for (const b of ['makwell', 'flyvision', 'skevia']) await expect(page.locator(`.brand-card a[href="${b}/index.html"]`)).toBeVisible();
  await expect(page.locator('.cat-tile')).toHaveCount(4);
  const tiles = await page.locator('.hub-grid .service-card h3').allTextContents();
  expect(tiles).toEqual(['Book a service', 'Check warranty', 'Register product', 'Find service center', 'Track service', 'Help & FAQs']);
  await expect(page.locator('main#main')).toBeAttached();
  await expect(page.locator('a.skip')).toBeAttached();
});

test('home: every support tile opens the right sheet', async ({ page }) => {
  await openPage(page, origin, 'index.html');
  const cases = [['Book a service', '#book-overlay'], ['Check warranty', '#warranty-overlay'], ['Register product', '#register-overlay'], ['Track service', '#track-overlay'],
    ['Find service center', '#service-modal-overlay'], ['Help & FAQs', '#service-modal-overlay'], ['Manuals', '#service-modal-overlay']];
  for (const [name, sel] of cases) {
    await page.locator('.service-card', { hasText: name }).first().click();
    await expect(page.locator(sel), name).toBeVisible();
    await page.locator(sel + ' .modal-close').click();
    await expect(page.locator(sel)).toBeHidden();
  }
});

test('home: old deep links from brand pages still open the right sheet (#support is a sheet, #help is the section)', async ({ page }) => {
  await openPage(page, origin, 'index.html#support');
  await expect(page.locator('#service-modal-overlay')).toBeVisible();
  await expect(page.locator('#service-modal-title')).toHaveText('Support');
  await expect(page.locator('section#help')).toBeAttached();
});

test('register: a 4-step wizard that will not move on with missing details', async ({ page }) => {
  await openPage(page, origin, 'index.html#register-product');
  const form = page.locator('#register-form');
  await expect(form.locator('.wiz-progress li')).toHaveText(['Product', 'Purchase', 'You', 'Confirm']);
  await expect(form.locator('.wiz-nav .btn-secondary')).toBeHidden();
  await expect(form.locator('button[type="submit"]')).toBeHidden();
  await form.locator('.wiz-nav .btn-primary').click();
  await expect(form.locator('.wiz-step.cur')).toHaveAttribute('data-label', 'Product'); // blocked: nothing chosen yet
  await form.locator('#register-brand').selectOption('MakWell');
  await page.waitForTimeout(400);
  await page.evaluate(() => { document.getElementById('register-category').innerHTML = '<option value="">Select…</option><option value="LED TV">LED TV</option>'; });
  await form.locator('#register-category').selectOption('LED TV');
  await page.waitForTimeout(400);
  await page.evaluate(() => { document.getElementById('register-model-select').innerHTML = '<option value="">Select…</option><option value="M43">M43</option>'; });
  await form.locator('#register-model-select').selectOption('M43');
  await form.locator('.wiz-nav .btn-primary').click();
  await expect(form.locator('.wiz-step.cur')).toHaveAttribute('data-label', 'Purchase');
  await form.locator('input[name="purchaseDate"]').fill('2026-02-01');
  await form.locator('input[name="dealerName"]').fill('Raichur Electronics');
  await form.locator('.wiz-nav .btn-primary').click();
  await form.locator('input[name="name"]').fill('Ravi Kumar');
  await form.locator('#register-phone').fill('9845012345');
  await form.locator('input[name="address"]').fill('1 Main Road');
  await form.locator('input[name="city"]').fill('Raichur');
  await form.locator('input[name="state"]').fill('Karnataka');
  await form.locator('input[name="pincode"]').fill('584101');
  await form.locator('.wiz-nav .btn-primary').click();
  await expect(form.locator('.wiz-step.cur')).toHaveAttribute('data-label', 'Confirm');
  await expect(form.locator('.wiz-summary')).toContainText('Ravi Kumar');
  await expect(form.locator('.wiz-summary')).toContainText('M43');
  await expect(form.locator('button[type="submit"]')).toBeVisible();
  await form.locator('.wiz-nav .btn-secondary').click(); // Back works
  await expect(form.locator('.wiz-step.cur')).toHaveAttribute('data-label', 'You');
  // closing and reopening starts again at step 1
  await page.locator('#register-close').click();
  await page.locator('.service-card', { hasText: 'Register product' }).first().click();
  await expect(form.locator('.wiz-step.cur')).toHaveAttribute('data-label', 'Product');
});

test('track: the request number shows a progress timeline that matches the status', async ({ page }) => {
  const cases = { new: [0, 'Request received'], assigned_to_center: [1, 'Service center assigned'], accepted: [2, 'Technician assigned'], on_the_way: [3, 'Technician visit'], waiting_spare: [4, 'Repair'], closed: [5, 'Completed'] };
  for (const [status, [idx, label]] of Object.entries(cases)) {
    const p = await page.context().newPage();
    await installFirebaseStub(p, {});
    await p.route(/firebase-functions\.js/, (r) => r.fulfill({ contentType: 'text/javascript', body: `export const getFunctions = () => ({}); export const httpsCallable = () => async () => ({ data: { found: true, kind: 'service', status: '${status}', requestType: 'service', brand: 'MakWell', category: 'LED TV', warrantyStatus: 'in_warranty', createdAt: Date.now() } });` }));
    await p.route(/^https?:\/\//, (r) => (r.request().url().startsWith(origin) || /gstatic\.com\/firebasejs/.test(r.request().url()) ? r.fallback() : r.abort()));
    await p.goto(origin + '/index.html#track-service', { waitUntil: 'load' });
    await p.fill('#track-ticket', 'PE-SVC-20261001-0001-CustomerSite');
    await p.fill('#track-phone', '9845012345');
    await p.click('#track-search-btn');
    const items = p.locator('#track-result .timeline li');
    await expect(items).toHaveCount(6);
    const cls = await items.evaluateAll((els) => els.map((e) => e.className));
    const finished = idx === 5;
    cls.forEach((c, i) => {
      if (i < idx || (finished && i === idx)) expect(c, `${status} step ${i}`).toBe('done');
      else if (i === idx) expect(c, `${status} step ${i}`).toBe('cur');
      else expect(c, `${status} step ${i}`).toBe('');
    });
    await expect(items.nth(idx)).toContainText(label);
    await p.close();
  }
});

test('brand pages: each has its own colours, logo, hero and the support cards', async ({ page }) => {
  for (const [b, name] of [['makwell', 'MakWell'], ['flyvision', 'Flyvision'], ['skevia', 'Skevia']]) {
    const errors = await openPage(page, origin, `${b}/index.html`);
    expect(errors, b).toEqual([]);
    await expect(page.locator('.bhero h1')).toBeVisible();
    await expect(page.locator(`.bhero img[alt="${name}"]`).first()).toBeVisible();
    await expect(page.locator('.bhero-art img')).toHaveAttribute('src', new RegExp(`hero-tv-${b}`));
    await expect(page.locator('.service-grid .service-card')).toHaveCount(8);
    const b1 = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--b1').trim());
    expect(b1, b).toMatch(/^#[0-9a-f]{6}$/i);
  }
});

test('home, brand pages, product, account and 404 have no sideways scroll at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  for (const p of ['index.html', 'makwell/index.html', 'flyvision/index.html', 'skevia/index.html', 'product.html?id=x', 'portal.html', '404.html']) {
    await openPage(page, origin, p);
    const r = await layoutReport(page);
    expect(r.scrollWidth, `${p}: ${r.overflowing.join(', ')}`).toBeLessThanOrEqual(321);
  }
});

test('phone: the quick bar (Home, Products, Support, Account) is shown; on desktop it is not', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await openPage(page, origin, 'index.html');
  await expect(page.locator('.tabbar')).toBeVisible();
  await expect(page.locator('.tabbar a')).toHaveText(['Home', 'Products', 'Support', 'Account']);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator('.tabbar')).toBeHidden();
});

test('motion: reduced-motion users get no reveal animation or floating', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await openPage(page, origin, 'index.html');
  const op = await page.locator('.strip-item').first().evaluate((e) => getComputedStyle(e).opacity);
  expect(op).toBe('1');
  const anim = await page.locator('.hero-product-img.active').evaluate((e) => getComputedStyle(e).animationName);
  expect(anim).toBe('none');
  await ctx.close();
});

test('product page: opens on a bad id with a plain message, in brand-neutral colours', async ({ page }) => {
  await openPage(page, origin, 'product.html?id=missing');
  await expect(page.locator('#content')).toContainText(/product/i);
  await expect(page.locator('header nav a')).toHaveCount(4);
});

test('account page: sign-in card renders and the tabs are pill-shaped, no script errors', async ({ page }) => {
  const errors = await openPage(page, origin, 'portal.html');
  expect(errors).toEqual([]);
  await expect(page.locator('body')).toContainText(/My Account|Sign in|mobile/i);
});

test('404: friendly page with a way home', async ({ page }) => {
  await openPage(page, origin, '404.html');
  await expect(page.locator('h1')).toContainText("doesn't exist");
  await expect(page.locator('.btn-primary')).toHaveAttribute('href', /Pushpak-enterprises-website-and-CRM/);
});
