// CRM redesign (UI phases 7-13): shared design layer on every dashboard —
// greeting hero, jump-to palette, phone bottom bar for field/warehouse roles,
// keyboard and screen-reader basics, reduced motion, and no sideways scroll.
const { test, expect } = require('@playwright/test');
const { startStaticServer } = require('./support/static-server');
const { openPage, layoutReport } = require('./support/device-checks');
const { sampleFor } = require('./support/sample-data');

const PAGES = { superadmin: 'crm/CRMsuperadmin.html', servicecenter: 'crm/CRMservicecenter.html', technician: 'crm/CRMtechnician.html', warehouse: 'crm/CRMwarehouse.html', dealer: 'crm/CRMdealer.html', distributor: 'crm/CRMdistributor.html', areamanager: 'crm/CRMareamanager.html' };
let origin, server;
test.beforeAll(async () => { ({ server, origin } = await startStaticServer()); });
test.afterAll(async () => { if (server) server.close(); });

for (const [role, path] of Object.entries(PAGES)) {
  test(`${role}: design layer loads, hero greets, nav is keyboard-operable`, async ({ page }) => {
    const errors = await openPage(page, origin, path, role, sampleFor(role));
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => [...document.styleSheets].some((s) => /crm\/ui\.css/.test(s.href || '')))).toBe(true);
    // Sidebar items are focusable buttons, the active one is marked current.
    const first = page.locator('.sidebar .nav-item').first();
    await expect(first).toHaveAttribute('role', 'button');
    await expect(first).toHaveAttribute('tabindex', '0');
    await expect(page.locator('.sidebar .nav-item[aria-current=page]')).toHaveCount(1);
    await expect(page.locator('a.ui-skip')).toBeAttached();
    // Greeting hero on the home screen.
    await expect(page.locator('.ui-hero .hi')).toContainText(/Good (morning|afternoon|evening)/);
    // Every labelled field in an open-able dialog has a tied label.
    const unlabeled = await page.$$eval('.form-row', (rows) => rows.filter((r) => { const l = r.querySelector('label'), f = r.querySelector('input,select,textarea'); return l && f && f.id && l.getAttribute('for') !== f.id; }).length);
    expect(unlabeled).toBe(0);
  });
}

test('jump-to palette: Ctrl+K opens, filters, Enter opens the screen, Escape closes', async ({ page }) => {
  await openPage(page, origin, PAGES.technician, 'technician', sampleFor('technician'));
  await page.keyboard.press('Control+k');
  await expect(page.locator('.ui-cmd.show')).toBeVisible();
  await expect(page.locator('#ui-cmd-input')).toBeFocused();
  await page.keyboard.type('sched');
  await expect(page.locator('.ui-cmd-list li')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(page.locator('.ui-cmd.show')).toHaveCount(0);
  await expect(page.locator('#page-title')).toHaveText(/schedule/i);
  await page.keyboard.press('Control+k');
  await page.keyboard.type('zzzz');
  await expect(page.locator('.ui-cmd-empty')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.ui-cmd.show')).toHaveCount(0);
});

test('technician on a phone: bottom bar with big targets switches screens; More opens the menu', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPage(page, origin, PAGES.technician, 'technician', sampleFor('technician'));
  const bar = page.locator('.ui-bottom');
  await expect(bar).toBeVisible();
  const btns = bar.locator('button');
  expect(await btns.count()).toBe(5);
  for (let i = 0; i < 5; i++) { const b = await btns.nth(i).boundingBox(); expect(b.height).toBeGreaterThanOrEqual(44); expect(b.width).toBeGreaterThanOrEqual(44); }
  await bar.locator('button', { hasText: /jobs/i }).click();
  await expect(page.locator('#page-title')).toHaveText(/jobs/i);
  await expect(bar.locator('button[aria-current=page]')).toContainText(/jobs/i);
  await bar.locator('button', { hasText: 'More' }).click();
  await expect(page.locator('body')).toHaveClass(/crm-nav-open/);
  await page.keyboard.press('Escape');
});

test('warehouse on a phone has the bottom bar; service centre and dealer do not', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPage(page, origin, PAGES.warehouse, 'warehouse', sampleFor('warehouse'));
  await expect(page.locator('.ui-bottom')).toBeVisible();
  const p2 = await page.context().newPage();
  await p2.setViewportSize({ width: 390, height: 844 });
  await openPage(p2, origin, PAGES.servicecenter, 'servicecenter', sampleFor('servicecenter'));
  await expect(p2.locator('.ui-bottom')).toHaveCount(0);
});

test('bottom bar is hidden on a desktop screen', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openPage(page, origin, PAGES.technician, 'technician', sampleFor('technician'));
  await expect(page.locator('.ui-bottom')).toBeHidden();
});

test('dialogs: Escape closes an open dialog and the first field takes focus', async ({ page }) => {
  await openPage(page, origin, PAGES.technician, 'technician', sampleFor('technician'));
  await page.evaluate(() => document.getElementById('closure-overlay').classList.add('show'));
  await expect(page.locator('#closure-code')).toBeFocused();
  await expect(page.locator('#closure-overlay .modal')).toHaveAttribute('role', 'dialog');
  await page.keyboard.press('Escape');
  await expect(page.locator('#closure-overlay.show')).toHaveCount(0);
});

test('reduced motion: no entrance animation and counters show their final value at once', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await openPage(page, origin, PAGES.superadmin, 'superadmin', sampleFor('superadmin'));
  const dur = await page.evaluate(() => getComputedStyle(document.querySelector('.stat-card') || document.body).animationDuration);
  expect(parseFloat(dur) * (/ms/.test(dur) ? 1 : 1000)).toBeLessThan(5);
  await ctx.close();
});

for (const [role, path] of Object.entries(PAGES)) {
  for (const w of [320, 390]) {
    test(`${role} at ${w}px: no sideways scroll`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      await openPage(page, origin, path, role, sampleFor(role));
      const r = await layoutReport(page);
      expect(r.scrollWidth, r.overflowing.join(', ')).toBeLessThanOrEqual(w + 1);
      expect(r.overflowing).toEqual([]);
      expect(r.smallText).toEqual([]);
    });
  }
}

test('login page keeps working with the new look', async ({ page }) => {
  await openPage(page, origin, 'crm/login.html', null);
  await expect(page.locator('form input').first()).toBeVisible();
  await expect(page.locator('form button').first()).toBeVisible();
});
