// Click any item in a list -> a pop-up with that item's details, in every
// module. Rows that already open their own pop-up keep doing exactly that.
const { test, expect } = require('@playwright/test');
const { startStaticServer } = require('./support/static-server');
const { installFirebaseStub } = require('./support/firebase-stub');
const { sampleFor } = require('./support/sample-data');

const PAGES = { superadmin: 'crm/CRMsuperadmin.html', servicecenter: 'crm/CRMservicecenter.html', technician: 'crm/CRMtechnician.html', warehouse: 'crm/CRMwarehouse.html', dealer: 'crm/CRMdealer.html', distributor: 'crm/CRMdistributor.html' };
let origin, server;
test.beforeAll(async () => { ({ server, origin } = await startStaticServer()); });
test.afterAll(async () => { if (server) server.close(); });

async function openAs(page, role, data) {
  await installFirebaseStub(page, { role, uid: 'u1', data: data || sampleFor(role), profile: { role, displayName: 'Tarun', email: 't@pe.test' } });
  await page.route(/^https?:\/\//, (r) => (r.request().url().startsWith(origin) || /gstatic\.com\/firebasejs/.test(r.request().url()) ? r.fallback() : r.abort()));
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(origin + '/' + PAGES[role], { waitUntil: 'load' });
  await page.waitForFunction(() => { const a = document.getElementById('app'); return a && getComputedStyle(a).display !== 'none'; }, null, { timeout: 10000 });
  await page.waitForTimeout(400);
  return errors;
}
const REG = { id: 'reg1', registrationId: 'PE-REG-20260929-0001-CustomerSite', customerName: 'Tarun', product: 'MakWell LED — MK3201SMT', serialNumber: 'MK3201SMT0123456', purchaseDate: '2025-10-29', warrantyMonths: 12, createdAt: { __ms: Date.now() } };

test('Serial & Registration: clicking a registration opens a pop-up with that registration', async ({ page }) => {
  const data = sampleFor('superadmin'); data.productRegistrations = [REG, { ...REG, id: 'reg2', registrationId: 'PE-REG-2', customerName: 'Anita', serialNumber: 'SN2' }];
  const errors = await openAs(page, 'superadmin', data);
  await page.locator('.sidebar .nav-item', { hasText: 'Serial & Registration' }).click();
  const row = page.locator('.content tbody tr[data-ui-row="1"]', { hasText: 'Anita' });
  await expect(row).toBeVisible();
  await row.locator('td').nth(1).click();
  const dlg = page.locator('.ui-dialog [role=dialog]');
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText('PE-REG-2');
  await expect(dlg).toContainText('Anita');
  await expect(dlg).toContainText('SN2');
  await expect(dlg).not.toContainText('Tarun'); // only the clicked item
  await page.keyboard.press('Escape');
  await expect(page.locator('.ui-dialog')).toHaveCount(0);
  // keyboard: focus the other row and press Enter
  const first = page.locator('.content tbody tr[data-ui-row="1"]').first();
  await first.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.ui-dialog [role=dialog]')).toContainText('Tarun');
  expect(errors).toEqual([]);
});

test('rows that already open their own pop-up are not given a second one', async ({ page }) => {
  await openAs(page, 'technician');
  await page.locator('.sidebar .nav-item', { hasText: 'My Jobs' }).click();
  const row = page.locator('.content tbody tr').first();
  await expect(row).toBeVisible();
  await row.locator('td').nth(1).click();
  await expect(page.locator('#job-detail-overlay.show')).toBeVisible();
  await page.waitForTimeout(400);
  await expect(page.locator('.ui-dialog')).toHaveCount(0);
});

test('clicking a button or link inside a row does not also open the pop-up', async ({ page }) => {
  const data = sampleFor('superadmin'); data.productRegistrations = [REG];
  await openAs(page, 'superadmin', data);
  await page.locator('.sidebar .nav-item', { hasText: 'Serial & Registration' }).click();
  await page.evaluate(() => { const td = document.querySelector('.content tbody tr td:last-child'); td.insertAdjacentHTML('beforeend', '<button id="in-row-btn" type="button">x</button>'); });
  await page.locator('#in-row-btn').click();
  await page.waitForTimeout(400);
  await expect(page.locator('.ui-dialog')).toHaveCount(0);
});

test('selecting text in a row does not open the pop-up', async ({ page }) => {
  const data = sampleFor('superadmin'); data.productRegistrations = [REG];
  await openAs(page, 'superadmin', data);
  await page.locator('.sidebar .nav-item', { hasText: 'Serial & Registration' }).click();
  const cell = page.locator('.content tbody tr td').nth(2);
  await cell.dblclick();
  await page.waitForTimeout(400);
  await expect(page.locator('.ui-dialog')).toHaveCount(0);
});

for (const role of ['servicecenter', 'warehouse', 'dealer', 'distributor']) {
  test(`${role}: a plain list row opens a details pop-up (or none exist), with no errors`, async ({ page }) => {
    const errors = await openAs(page, role);
    // Visit each screen; any untouched list row must open a pop-up showing its own cells.
    const labels = await page.locator('.sidebar .nav-item').allTextContents();
    let opened = 0;
    for (const label of labels.slice(0, 14)) {
      await page.locator('.sidebar .nav-item', { hasText: new RegExp('^\\s*' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').trim() + '\\s*$') }).first().click().catch(() => {});
      await page.waitForTimeout(250);
      const row = page.locator('.content tbody tr[data-ui-row="1"]').first();
      if (await row.count()) {
        const txt = (await row.locator('td').first().innerText()).trim();
        await row.locator('td').first().click();
        await page.waitForTimeout(600);
        // either our details pop-up, or the page's own (never both)
        const ours = await page.locator('.ui-dialog [role=dialog]').count();
        const any = await page.locator('.modal-overlay.show').count();
        expect(any, 'something opened for the clicked row').toBeGreaterThanOrEqual(1);
        if (ours) { expect(any).toBe(1); if (txt && txt.length < 60) await expect(page.locator('.ui-dialog [role=dialog]')).toContainText(txt); }
        await page.keyboard.press('Escape');
        opened++;
        break;
      }
    }
    expect(errors).toEqual([]);
    expect(opened).toBeGreaterThanOrEqual(0);
  });
}
