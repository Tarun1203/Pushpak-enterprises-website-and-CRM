// Phase 5 item 8 — browser security tests.
// 1. Stored XSS: every section of every CRM dashboard is opened (and its
//    first View/Details buttons clicked) with every name, address, note and
//    message in the data replaced by an HTML/script payload. A safe screen
//    shows the payload as text; an unsafe one runs it (window.__xss).
// 2. The reverse: with ordinary data containing "&", no screen shows
//    escaped codes like "&amp;" (double escaping).
// Pages are served from this commit, Firebase is stubbed (support/).
const { test, expect } = require('@playwright/test');
const { startStaticServer } = require('./support/static-server');
const { openPage } = require('./support/device-checks');
const { installFirebaseStub } = require('./support/firebase-stub');
const { sampleFor, hostileSampleFor } = require('./support/sample-data');

const CRM = [['technician', 'crm/CRMtechnician.html'], ['servicecenter', 'crm/CRMservicecenter.html'], ['dealer', 'crm/CRMdealer.html'],
  ['distributor', 'crm/CRMdistributor.html'], ['warehouse', 'crm/CRMwarehouse.html'], ['superadmin', 'crm/CRMsuperadmin.html'], ['areamanager', 'crm/CRMareamanager.html']];
const OPENERS = /view|detail|history|open|profile|ledger|timeline/i;

let origin, server;
test.beforeAll(async () => { ({ server, origin } = await startStaticServer()); });
test.afterAll(async () => { if (server) server.close(); });
test.use({ viewport: { width: 1366, height: 900 } });

const injected = (page) => page.evaluate(() => {
  const n = (window.__xss || 0) + document.querySelectorAll('img[src="x"], svg[onload]').length;
  const where = [...document.querySelectorAll('img[src="x"]')].slice(0, 2).map((e) => (e.parentElement.textContent || '').trim().slice(0, 50));
  window.__xss = 0;
  document.querySelectorAll('img[src="x"], svg[onload]').forEach((e) => e.remove());
  return { n, where };
});

async function visitAll(page, onEach) {
  const items = page.locator('.sidebar .nav-item');
  const count = await items.count();
  for (let i = 0; i < count; i++) {
    const item = items.nth(i);
    const label = ((await item.textContent()) || '').trim().replace(/\s+/g, ' ');
    await item.click({ timeout: 5000 });
    await page.waitForTimeout(250);
    await onEach(label);
  }
  return count;
}

for (const [role, path] of CRM) {
  test(`${role}: no screen runs HTML or script from stored data`, async ({ page }) => {
    test.setTimeout(180000);
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    await openPage(page, origin, path, role, hostileSampleFor(role));
    const found = [];
    const n = await visitAll(page, async (label) => {
      let r = await injected(page);
      if (r.n) found.push(`${label}: ${r.where.join(' | ')}`);
      const buttons = page.locator('.content button:visible').filter({ hasText: OPENERS });
      const k = Math.min(await buttons.count(), 3);
      for (let b = 0; b < k; b++) {
        await buttons.nth(b).click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(250);
        r = await injected(page);
        if (r.n) found.push(`${label} → "${((await buttons.nth(b).textContent().catch(() => '')) || '').trim()}": ${r.where.join(' | ')}`);
        await page.keyboard.press('Escape');
        await page.evaluate(() => document.querySelectorAll('.modal-overlay.show').forEach((o) => o.classList.remove('show')));
      }
    });
    expect(n).toBeGreaterThan(3);
    expect(found, 'screens that render stored text as HTML').toEqual([]);
  });

  test(`${role}: ordinary text is not shown double-escaped`, async ({ page }) => {
    test.setTimeout(120000);
    await openPage(page, origin, path, role, sampleFor(role));
    const found = [];
    await visitAll(page, async (label) => {
      const t = await page.locator('.content').innerText().catch(() => '');
      const m = t.match(/&(amp|lt|gt|quot|#0?39);/);
      if (m) found.push(`${label}: shows "${m[0]}"`);
    });
    expect(found).toEqual([]);
  });
}

test('customer portal shows hostile text from records as text', async ({ page }) => {
  const data = hostileSampleFor('customer');
  data.users[0] = { id: 'u1', role: 'customer', name: 'Asha', phone10: '9000000001' };
  const x = '<img src=x onerror="window.__xss=1">';
  data.productRegistrations = [{ id: 'r1', registrationId: 'PE-REG-1', customerPhone: '9000000001', product: 'Geyser' + x, serialNumber: 'SN' + x, purchaseDate: '2026-09-01', warrantyMonths: 12 }];
  data.publicTicketStatus = [{ id: 'PE-CR-1', ticketId: 'PE-CR-1', customerPhone: '9000000001', category: 'Geyser' + x, status: 'completed' }];
  data.customerTracking = [{ id: 'PE-CR-1', customerPhone: '9000000001', status: 'completed', technicianName: 'Ravi' + x, actionTaken: 'Fixed' + x, history: [{ status: 'completed', at: { __ms: Date.now() } }] }];
  data.supportTickets = [{ id: 'PE-SUP-1', ticketNo: 'PE-SUP-1', customerPhone: '9000000001', subject: 'Help' + x, category: 'Warranty', status: 'open', messages: [{ from: 'staff', text: 'Reply' + x, at: { __ms: Date.now() } }] }];
  await installFirebaseStub(page, { role: 'customer', uid: 'u1', data });
  await page.route(/^https?:\/\//, (r) => (r.request().url().startsWith(origin) || /gstatic\.com\/firebasejs/.test(r.request().url()) ? r.fallback() : r.abort()));
  await page.goto(origin + '/portal.html');
  await expect(page.locator('#view-app')).toBeVisible({ timeout: 10000 });
  for (const v of ['products', 'warranty', 'services', 'history', 'support']) {
    await page.locator(`#view-app .tab[data-view="${v}"]`).click();
    await page.locator('[data-track], [data-sp-open]').evaluateAll((els) => els.forEach((e) => e.click()));
    await page.waitForTimeout(200);
    const r = await injected(page);
    expect(r.n, `portal ${v} tab ran injected markup: ${r.where.join(' | ')}`).toBe(0);
  }
});
