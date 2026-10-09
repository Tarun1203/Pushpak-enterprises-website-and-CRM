// Phase 5 item 5 — mobile tests. Every public page and every CRM dashboard
// on phone-sized screens (touch, mobile browser): no sideways scrolling,
// 16px form text (so phones don't zoom), a working menu, reachable modals.
// Pages are served from this commit; Firebase is stubbed (support/).
const { test, expect, devices } = require('@playwright/test');
const { startStaticServer } = require('./support/static-server');
const { openPage, layoutReport, smallTapTargets } = require('./support/device-checks');

const PHONES = {
  'Android (Pixel 7)': { ...devices['Pixel 7'] },
  'iPhone 13': { ...devices['iPhone 13'], defaultBrowserType: undefined },
  'Small Android (360x640)': { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: devices['Pixel 7'].userAgent }
};
const PUBLIC = ['index.html', 'product.html', 'makwell/index.html', 'flyvision/index.html', 'skevia/index.html', 'portal.html', 'crm/login.html'];
const CRM = [['technician', 'crm/CRMtechnician.html'], ['servicecenter', 'crm/CRMservicecenter.html'], ['dealer', 'crm/CRMdealer.html'],
  ['distributor', 'crm/CRMdistributor.html'], ['warehouse', 'crm/CRMwarehouse.html'], ['superadmin', 'crm/CRMsuperadmin.html'], ['areamanager', 'crm/CRMareamanager.html']];

let origin, server;
test.beforeAll(async () => { ({ server, origin } = await startStaticServer()); });
test.afterAll(async () => { if (server) server.close(); });

for (const [phone, device] of Object.entries(PHONES)) {
  const { defaultBrowserType, ...use } = device;
  test.describe(`Mobile — ${phone}`, () => {
    test.use(use);

    for (const p of PUBLIC) {
      test(`${p} fits the screen and its form fields don't zoom`, async ({ page }) => {
        await openPage(page, origin, p);
        const r = await layoutReport(page);
        expect(r.viewportMeta, 'viewport meta tag').toContain('width=device-width');
        expect(r.scrollWidth, `page is wider than the ${r.viewport}px screen: ${r.overflowing.join(', ')}`).toBeLessThanOrEqual(r.viewport + 1);
        expect(r.overflowing, 'elements past the right edge').toEqual([]);
        expect(r.smallText, 'form fields under 16px make phones zoom in').toEqual([]);
      });
    }

    test('website menu opens on a phone and every link is reachable', async ({ page }) => {
      await openPage(page, origin, 'index.html');
      const nav = page.locator('header nav');
      await expect(nav).toBeHidden();
      const btn = page.locator('.mnav-btn');
      await expect(btn).toBeVisible();
      expect(await smallTapTargets(page, '.mnav-btn')).toEqual([]);
      await btn.tap();
      await expect(nav).toBeVisible();
      for (const name of ['Products', 'Brands', 'Support', 'About', 'Contact']) await expect(nav.getByRole('link', { name })).toBeVisible();
      await nav.getByRole('link', { name: 'About' }).tap();
      await expect(nav).toBeHidden();
    });

    test('website Book a Service form fits the phone and can be submitted from the bottom', async ({ page }) => {
      await openPage(page, origin, 'index.html#book-service');
      const overlay = page.locator('#book-overlay');
      await expect(overlay).toBeVisible();
      const box = await overlay.locator('.modal, [class*="modal"]').first().boundingBox();
      const vw = page.viewportSize().width;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(vw + 1);
      const r = await layoutReport(page);
      expect(r.smallText).toEqual([]);
      await page.locator('#book-skip-search').tap();
      // The form is a step-by-step wizard: fill each page, go on, and the
      // submit button must be reachable on the last page.
      const form = overlay.locator('#book-form');
      await form.locator('#book-request-type').selectOption('installation');
      await form.locator('select[name="brand"]').selectOption('MakWell');
      await form.locator('#book-category').selectOption('Geyser');
      await form.locator('.wiz-nav .btn-primary').tap();
      await form.locator('input[name="modelNo"]').fill('M1');
      await form.locator('input[name="purchaseDate"]').fill('2026-01-01');
      await form.locator('input[name="dealerName"]').fill('Shop');
      await form.locator('.wiz-nav .btn-primary').tap();
      await form.locator('input[name="name"]').fill('Test User');
      await form.locator('#book-phone').fill('9980000515');
      await form.locator('input[name="address"]').fill('1 Road');
      await form.locator('input[name="city"]').fill('Raichur');
      await form.locator('input[name="state"]').fill('Karnataka');
      await form.locator('input[name="pincode"]').fill('584101');
      await form.locator('.wiz-nav .btn-primary').tap();
      await expect(form.locator('.wiz-summary')).toContainText('Raichur');
      const submit = overlay.locator('button[type="submit"]').first();
      await submit.scrollIntoViewIfNeeded();
      await expect(submit).toBeInViewport();
    });

    for (const [hash, overlayId] of [['register-product', 'register-overlay'], ['warranty-check', 'warranty-overlay'], ['track-service', 'track-overlay']]) {
      test(`website ${hash} pop-up fits the phone`, async ({ page }) => {
        await openPage(page, origin, 'index.html#' + hash);
        const overlay = page.locator('#' + overlayId);
        await expect(overlay).toBeVisible();
        const r = await layoutReport(page);
        expect(r.overflowing).toEqual([]);
        expect(r.smallText).toEqual([]);
        expect(await smallTapTargets(page, '#' + overlayId + ' .modal-close', 32), 'close button').toEqual([]);
      });
    }

    for (const [role, p] of CRM) {
      test(`${role} dashboard: fits the screen, menu slides in and out`, async ({ page }) => {
        const errors = await openPage(page, origin, p, role);
        let r = await layoutReport(page);
        expect(r.scrollWidth, `dashboard wider than the screen: ${r.overflowing.join(', ')}`).toBeLessThanOrEqual(r.viewport + 1);
        expect(r.overflowing).toEqual([]);
        const sidebar = page.locator('.sidebar');
        const menu = page.locator('.crm-menu-btn');
        await expect(menu).toBeVisible();
        expect(await smallTapTargets(page, '.crm-menu-btn, #notif-bell-btn'), 'top bar buttons').toEqual([]);
        await expect(sidebar).not.toBeInViewport();
        await menu.tap();
        await expect(sidebar).toBeInViewport();
        expect(await smallTapTargets(page, '.sidebar .nav-item', 40), 'menu items').toEqual([]);
        const title = await page.locator('#page-title').textContent();
        const target = page.locator('.sidebar .nav-item:not(.active)').first();
        await target.tap();
        await expect(sidebar).not.toBeInViewport();
        await expect(page.locator('#page-title')).not.toHaveText(title || '');
        r = await layoutReport(page);
        expect(r.overflowing, 'after opening a section').toEqual([]);
        expect(r.smallText, 'form fields under 16px').toEqual([]);
        expect(errors.filter((e) => !/stub|not a function|Cannot read/.test(e)), 'page errors').toEqual([]);
      });
    }
  });
}
