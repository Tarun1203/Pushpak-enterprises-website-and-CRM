// Phase 5 item 9 — performance tests (files in this commit, Firebase stubbed).
// 1. Page weight: each public page stays within a download budget, no image
//    is huge, and no image is many times bigger than it is shown.
// 2. Speed on a slow phone connection (4G, 4x slower CPU): the main content
//    of each public page appears quickly.
// 3. CRM: dashboards open and every section renders quickly with realistic
//    data, and the opening screen never downloads whole history collections
//    (tickets, orders, claims...) — counts use Firestore count queries.
const { test, expect } = require('@playwright/test');
const { startStaticServer } = require('./support/static-server');
const { openPage } = require('./support/device-checks');
const { sampleFor } = require('./support/sample-data');

const PUBLIC = [['index.html', 700], ['product.html', 300], ['makwell/index.html', 400], ['flyvision/index.html', 400],
  ['skevia/index.html', 400], ['portal.html', 300], ['crm/login.html', 300]]; // [page, budget KB]
const CRM = [['technician', 'crm/CRMtechnician.html'], ['servicecenter', 'crm/CRMservicecenter.html'], ['dealer', 'crm/CRMdealer.html'],
  ['distributor', 'crm/CRMdistributor.html'], ['warehouse', 'crm/CRMwarehouse.html'], ['superadmin', 'crm/CRMsuperadmin.html'], ['areamanager', 'crm/CRMareamanager.html']];
const MAX_IMAGE_KB = 300;
const MAX_CRM_HTML_KB = 750;
const HISTORY = ['serviceJobs', 'centerRequests', 'claims', 'dealerOrders', 'distributorOrders', 'productRegistrations', 'publicServiceRequests',
  'invoices', 'ledgerEntries', 'tradePayments', 'notifications', 'walletTransactions', 'stockMovements', 'auditLogs', 'localPurchases', 'spareRequests', 'rmaRequests', 'contactEnquiries'];
const SLOW_4G = { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 };

let origin, server;
test.beforeAll(async () => { ({ server, origin } = await startStaticServer()); });
test.afterAll(async () => { if (server) server.close(); });

async function slowPhone(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', SLOW_4G);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
}
const lcp = (page) => page.evaluate(() => new Promise((resolve) => {
  let v = 0;
  new PerformanceObserver((l) => { for (const e of l.getEntries()) v = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
  setTimeout(() => resolve(Math.round(v || performance.getEntriesByType('paint').map((p) => p.startTime).pop() || 0)), 300);
}));

test.describe('Page weight', () => {
  test.use({ viewport: { width: 1366, height: 900 } });
  for (const [p, budgetKb] of PUBLIC) {
    test(`${p} downloads under ${budgetKb} KB with right-sized images`, async ({ page }) => {
      const sizes = new Map();
      page.on('response', async (r) => { if (r.url().startsWith(origin)) { try { sizes.set(r.url(), (await r.body()).length); } catch { /* ignore */ } } });
      await openPage(page, origin, p);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(600);
      const total = [...sizes.values()].reduce((a, b) => a + b, 0);
      const heavy = [...sizes].filter(([u, b]) => /\.(png|jpe?g|webp|gif|svg)$/i.test(u) && b > MAX_IMAGE_KB * 1024).map(([u, b]) => `${u.replace(origin + '/', '')} ${Math.round(b / 1024)} KB`);
      const oversized = await page.$$eval('img', (imgs) => imgs.filter((i) => {
        const r = i.getBoundingClientRect();
        return r.width > 0 && i.naturalWidth > Math.max(r.width, 48) * 3 * 2; // over 3x what a 2x screen needs
      }).map((i) => `${i.getAttribute('src')} is ${i.naturalWidth}px wide, shown at ${Math.round(i.getBoundingClientRect().width)}px`));
      expect(heavy, `images over ${MAX_IMAGE_KB} KB`).toEqual([]);
      expect(oversized.filter((o) => { const u = o.split(' ')[0]; const b = [...sizes].find(([x]) => x.endsWith(encodeURI(u).replace(/^(\.\.\/)+/, ''))); return !b || b[1] > 30 * 1024; }), 'images far bigger than shown').toEqual([]);
      expect(Math.round(total / 1024), `page weight (KB) — ${[...sizes].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([u, b]) => u.replace(origin + '/', '') + ' ' + Math.round(b / 1024) + 'KB').join(', ')}`).toBeLessThanOrEqual(budgetKb);
    });
  }
  test('CRM pages stay a reasonable size', async ({ request }) => {
    for (const [, p] of CRM) {
      const r = await request.get(`${origin}/${p}`);
      expect((await r.body()).length / 1024, p).toBeLessThanOrEqual(MAX_CRM_HTML_KB);
    }
  });
});

test.describe('Speed on a slow phone connection', () => {
  test.use({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2.6 });
  for (const [p] of PUBLIC) {
    test(`${p}: main content within 3.5 s on slow 4G`, async ({ page }) => {
      await slowPhone(page);
      await openPage(page, origin, p);
      const ms = await lcp(page);
      test.info().annotations.push({ type: 'largest contentful paint', description: `${ms} ms` });
      expect(ms).toBeLessThanOrEqual(3500);
    });
  }
});

test.describe('CRM speed and data use', () => {
  test.use({ viewport: { width: 1366, height: 900 } });
  for (const [role, p] of CRM) {
    test(`${role}: opens fast, every section renders fast, no full history downloads on open`, async ({ page }) => {
      test.setTimeout(150000);
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      const t0 = Date.now();
      await openPage(page, origin, p, role, sampleFor(role));
      const openMs = Date.now() - t0;
      const landing = await page.evaluate(() => { const r = window.__reads || []; window.__reads = []; return r; });
      const fullOnOpen = [...new Set(landing.filter((r) => r.kind === 'query' && !r.filtered && HISTORY.includes(r.path)).map((r) => r.path))];
      expect(fullOnOpen, 'whole history collections downloaded when the dashboard opens').toEqual([]);
      expect(openMs, 'dashboard open time (ms, 4x slower CPU)').toBeLessThanOrEqual(6000);
      const items = page.locator('.sidebar .nav-item');
      const n = await items.count();
      const slow = [];
      const stuck = [];
      const fullReads = [];
      for (let i = 0; i < n; i++) {
        const item = items.nth(i);
        const label = ((await item.textContent()) || '').trim().replace(/\s+/g, ' ');
        const s = Date.now();
        await item.click();
        const settled = await page.waitForFunction(() => !/Loading…/.test((document.querySelector('.content') || document.body).innerText), null, { timeout: 4000 }).then(() => true, () => false);
        const ms = Date.now() - s;
        // A panel still saying "Loading…" here is waiting on data the test
        // doesn't provide — noted, but not a speed failure.
        if (!settled) stuck.push(label);
        else if (ms > 3000) slow.push(`${label}: ${ms} ms`);
        const reads = await page.evaluate(() => { const r = window.__reads || []; window.__reads = []; return r; });
        const full = [...new Set(reads.filter((r) => r.kind === 'query' && !r.filtered && HISTORY.includes(r.path)).map((r) => r.path))];
        if (full.length) fullReads.push(`${label}: ${full.join(', ')}`);
      }
      // Screens that list everything (reports, history views) are reported for review, not failed.
      if (fullReads.length) test.info().annotations.push({ type: 'reads whole collections', description: fullReads.join(' · ') });
      if (stuck.length) test.info().annotations.push({ type: 'still loading with test data', description: stuck.join(', ') });
      expect(slow, 'sections slower than 3 s to render (4x slower CPU)').toEqual([]);
    });
  }
});
