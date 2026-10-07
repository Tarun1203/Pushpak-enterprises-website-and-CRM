// Phase 5 item 6 — responsive tests. The public pages from a small phone up
// to a large desktop, and EVERY section of every CRM dashboard at tablet,
// small-laptop and laptop widths, filled with realistic sample data: nothing
// may push the page sideways, and the right menu (sidebar or menu button)
// shows for the width. Full-page screenshots for review are saved to
// qa-results/screenshots (uploaded with the QA report).
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { startStaticServer } = require('./support/static-server');
const { openPage, layoutReport } = require('./support/device-checks');
const { sampleFor } = require('./support/sample-data');

const SHOTS = path.resolve(__dirname, '../../qa-results/screenshots');
const PUBLIC = ['index.html', 'product.html', 'makwell/index.html', 'flyvision/index.html', 'skevia/index.html', 'portal.html', 'crm/login.html'];
const PUBLIC_WIDTHS = [320, 768, 1024, 1280, 1920];
const CRM = [['technician', 'crm/CRMtechnician.html'], ['servicecenter', 'crm/CRMservicecenter.html'], ['dealer', 'crm/CRMdealer.html'],
  ['distributor', 'crm/CRMdistributor.html'], ['warehouse', 'crm/CRMwarehouse.html'], ['superadmin', 'crm/CRMsuperadmin.html'], ['areamanager', 'crm/CRMareamanager.html']];
const CRM_WIDTHS = [768, 900, 1366];
const MENU_BREAKPOINT = 820; // crm/mobile.css

let origin, server;
test.beforeAll(async () => { ({ server, origin } = await startStaticServer()); fs.mkdirSync(SHOTS, { recursive: true }); });
test.afterAll(async () => { if (server) server.close(); });
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name.replace(/[^a-z0-9.-]+/gi, '_') + '.png'), fullPage: true }).catch(() => {});

for (const w of PUBLIC_WIDTHS) {
  test.describe(`Responsive — ${w}px`, () => {
    test.use({ viewport: { width: w, height: 900 } });
    for (const p of PUBLIC) {
      test(`${p} at ${w}px`, async ({ page }) => {
        await openPage(page, origin, p);
        const r = await layoutReport(page);
        expect(r.scrollWidth, `wider than ${w}px: ${r.overflowing.join(', ')}`).toBeLessThanOrEqual(w + 1);
        expect(r.overflowing).toEqual([]);
        // Site navigation is reachable: the header menu itself, or the Menu button.
        const header = page.locator('header').first();
        if (await header.count()) {
          const navShown = await page.locator('header nav').first().isVisible().catch(() => false);
          const btnShown = await page.locator('header .mnav-btn').isVisible().catch(() => false);
          if (await page.locator('header nav').count()) expect(navShown || btnShown, 'header menu or Menu button').toBe(true);
        }
        // Images never spill out of their column.
        const wideImgs = await page.$$eval('img', (imgs, vw) => imgs.filter((i) => { const b = i.getBoundingClientRect(); return b.width > 0 && b.right > vw + 1; }).map((i) => i.getAttribute('src')), w);
        expect(wideImgs, 'images wider than the screen').toEqual([]);
        await shot(page, `public-${p}-${w}`);
      });
    }
  });
}

for (const w of CRM_WIDTHS) {
  test.describe(`Responsive CRM — ${w}px`, () => {
    test.use({ viewport: { width: w, height: 900 } });
    for (const [role, p] of CRM) {
      test(`${role}: every section at ${w}px`, async ({ page }) => {
        test.setTimeout(120000);
        const errors = await openPage(page, origin, p, role, sampleFor(role));
        const narrow = w <= MENU_BREAKPOINT;
        await expect(page.locator('.crm-menu-btn'))[narrow ? 'toBeVisible' : 'toBeHidden']();
        if (!narrow) await expect(page.locator('.sidebar')).toBeInViewport();
        await shot(page, `crm-${role}-dashboard-${w}`);
        const items = page.locator('.sidebar .nav-item');
        const n = await items.count();
        expect(n, 'menu items').toBeGreaterThan(3);
        const problems = [];
        for (let i = 0; i < n; i++) {
          const item = items.nth(i);
          const label = ((await item.textContent()) || '').trim().replace(/\s+/g, ' ');
          if (narrow) await page.locator('.crm-menu-btn').click();
          await item.click({ timeout: 5000 });
          await page.waitForTimeout(200);
          const r = await layoutReport(page);
          if (r.scrollWidth > w + 1 || r.overflowing.length) problems.push(`${label}: page ${r.scrollWidth}px wide — ${r.overflowing.slice(0, 3).join(', ')}`);
        }
        expect(problems, `sections that break the ${w}px layout`).toEqual([]);
        expect(errors, 'page errors').toEqual([]);
      });
    }
  });
}
