// Auto-fit audit: every page on phones (portrait + landscape), tablets, short
// laptops and big monitors/TVs. Nothing may push the page sideways, the
// content must use the width it is given on big screens, and text must grow
// with the screen instead of staying tiny in the middle of a huge window.
const { test, expect } = require('@playwright/test');
const { startStaticServer } = require('./support/static-server');
const { openPage, layoutReport } = require('./support/device-checks');
const { sampleFor } = require('./support/sample-data');

const PUBLIC = ['index.html', 'product.html', 'makwell/index.html', 'flyvision/index.html', 'skevia/index.html', 'portal.html', 'crm/login.html', 'crm/bug-tracker.html', '404.html'];
const CRM = [['technician', 'crm/CRMtechnician.html'], ['servicecenter', 'crm/CRMservicecenter.html'], ['dealer', 'crm/CRMdealer.html'],
  ['distributor', 'crm/CRMdistributor.html'], ['warehouse', 'crm/CRMwarehouse.html'], ['superadmin', 'crm/CRMsuperadmin.html'], ['areamanager', 'crm/CRMareamanager.html']];
const SCREENS = {
  'small phone 320x568': [320, 568, true], 'phone landscape 667x375': [667, 375, true], 'phone landscape 844x390': [844, 390, true],
  'tablet portrait 820x1180': [820, 1180, true], 'tablet landscape 1180x820': [1180, 820, true],
  'short laptop 1366x600': [1366, 600, false], 'laptop 1536x730': [1536, 730, false],
  'full HD 1920x1080': [1920, 1080, false], 'QHD 2560x1440': [2560, 1440, false], '4K 3840x2160': [3840, 2160, false]
};
// Page scale expected per screen width (laptop = 1).
const minScale = (w) => (w >= 3800 ? 2 : w >= 2500 ? 1.5 : w >= 1900 ? 1.15 : 1);

let origin, server;
test.beforeAll(async () => { ({ server, origin } = await startStaticServer()); });
test.afterAll(async () => { if (server) server.close(); });

// How much the page scales up on this screen (assets/fit.css).
const scale = (page) => page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).zoom) || 1);

for (const [name, [w, h, touch]] of Object.entries(SCREENS)) {
  test.describe(`Fit — ${name}`, () => {
    test.use({ viewport: { width: w, height: h }, isMobile: touch && w < 900, hasTouch: touch });
    for (const p of PUBLIC) {
      test(`${p}`, async ({ page }) => {
        await openPage(page, origin, p);
        const r = await layoutReport(page);
        expect(r.scrollWidth, `sideways scroll: ${r.overflowing.join(', ')}`).toBeLessThanOrEqual(w + 1);
        expect(r.overflowing).toEqual([]);
        if (w >= 1900 && !/404|bug-tracker|login|portal/.test(p)) {
          // Big screens: the page's content column should use most of the width.
          const col = await page.evaluate(() => { const el = document.querySelector('.wrap, main, .container, header'); return el ? el.getBoundingClientRect().width : 0; });
          expect(col, 'content column width').toBeGreaterThan(w * 0.55);
          const fs = await scale(page);
          expect(fs, 'page scale on a big screen').toBeGreaterThanOrEqual(minScale(w));
        }
      });
    }
    for (const [role, p] of CRM) {
      test(`CRM ${role}`, async ({ page }) => {
        test.setTimeout(90000);
        await openPage(page, origin, p, role, sampleFor(role));
        const r0 = await layoutReport(page);
        expect(r0.scrollWidth, `sideways scroll: ${r0.overflowing.join(', ')}`).toBeLessThanOrEqual(w + 1);
        // Every section: no sideways scroll; sidebar menu items all reachable (sidebar scrolls when screen is short).
        const items = page.locator('.sidebar .nav-item');
        const n = await items.count();
        const problems = [];
        for (let i = 0; i < n; i++) {
          if (w <= 820) await page.locator('.crm-menu-btn').click();
          await items.nth(i).scrollIntoViewIfNeeded().catch(() => {});
          const box = await items.nth(i).boundingBox();
          if (!box || box.y + box.height > h + 1 || box.y < -1) { problems.push(`menu item ${i} out of reach (y=${box && Math.round(box.y)})`); continue; }
          await items.nth(i).click({ timeout: 4000 }).catch((e) => problems.push(`menu item ${i} not clickable: ${e.message.split('\n')[0]}`));
          await page.waitForTimeout(120);
          const r = await layoutReport(page);
          if (r.scrollWidth > w + 1 || r.overflowing.length) problems.push(`section ${i}: ${r.scrollWidth}px wide ${r.overflowing.slice(0, 2).join(', ')}`);
        }
        expect(problems.slice(0, 6)).toEqual([]);
        if (w >= 1900) {
          const m = await page.evaluate(() => { const c = document.querySelector('.content, .main'); const s = document.querySelector('.sidebar'); return { content: c ? c.getBoundingClientRect().width : 0, side: s ? s.getBoundingClientRect().width : 0 }; });
          expect(m.content + m.side, 'content + sidebar fill the screen').toBeGreaterThan(w * 0.9);
          expect(await scale(page), 'page scale on a big screen').toBeGreaterThanOrEqual(minScale(w));
        }
      });
    }
  });
}
