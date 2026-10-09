// Phase 10 items 1-2 — every role gets its own dashboard and nobody else's.
// A dashboard only opens for the right role; a different role, a customer, a
// switched-off account and a signed-out visitor are all sent to the login
// page; and the login page itself refuses a switched-off account with a
// reason. (The server side of "switched off" is in the rules tests.)
const { test, expect } = require('@playwright/test');
const { startStaticServer } = require('./support/static-server');
const { installFirebaseStub } = require('./support/firebase-stub');
const { sampleFor } = require('./support/sample-data');

const PAGES = { superadmin: 'crm/CRMsuperadmin.html', warehouse: 'crm/CRMwarehouse.html', servicecenter: 'crm/CRMservicecenter.html', technician: 'crm/CRMtechnician.html', dealer: 'crm/CRMdealer.html', distributor: 'crm/CRMdistributor.html' };
let origin, server;
test.beforeAll(async () => { ({ server, origin } = await startStaticServer()); });
test.afterAll(async () => { if (server) server.close(); });

async function visit(page, pathname, stub) {
  await installFirebaseStub(page, stub);
  await page.route(/^https?:\/\//, (r) => (r.request().url().startsWith(origin) || /gstatic\.com\/firebasejs/.test(r.request().url()) ? r.fallback() : r.abort()));
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(origin + '/' + pathname, { waitUntil: 'load' });
  return errors;
}
const data = (role, extra = {}) => { const d = sampleFor(role); Object.assign(d.users[0], extra); return d; };
const bounced = (page) => page.waitForURL(/login\.html/, { timeout: 10000 });
const opened = (page) => page.waitForFunction(() => { const a = document.getElementById('app'); return a && getComputedStyle(a).display !== 'none'; }, null, { timeout: 10000 });

for (const [role, path] of Object.entries(PAGES)) {
  test(`${role}: opens its own dashboard, with no script errors and a working sign-out`, async ({ page }) => {
    const errors = await visit(page, path, { role, uid: 'u1', data: sampleFor(role) });
    await opened(page);
    expect(page.url()).not.toMatch(/login\.html/);
    await expect(page.locator('.sidebar .nav-item').first()).toBeVisible();
    expect(errors, 'script errors').toEqual([]);
    const out = page.locator('button, a').filter({ hasText: /sign out|log ?out/i }).first();
    await expect(out).toBeAttached();
  });

  test(`${role}: every other role, a customer, a switched-off account and a signed-out visitor are sent to the login page`, async ({ page }) => {
    test.setTimeout(120000);
    const others = Object.keys(PAGES).filter((r) => r !== role).concat(['customer', 'dealer-unknown']);
    for (const other of others) {
      const p = await page.context().newPage();
      await visit(p, path, { role: other, uid: 'u1', data: data(other) });
      await bounced(p).catch(() => { throw new Error(`${other} was NOT sent away from ${role}'s dashboard (at ${p.url()})`); });
      await p.close();
    }
    // Right role, but switched off by Head Office / suspended / deactivated.
    const off = await page.context().newPage();
    await visit(off, path, { role, uid: 'u1', data: data(role, { accessDisabled: true }) });
    await bounced(off).catch(() => { throw new Error(`a switched-off ${role} still opened their dashboard`); });
    await off.close();
    // Signed out.
    const anon = await page.context().newPage();
    await visit(anon, path, {});
    await bounced(anon).catch(() => { throw new Error(`a signed-out visitor was not sent away from ${role}`); });
    await anon.close();
  });
}

test('login page: a switched-off account is refused with a reason; a deactivated redirect explains itself', async ({ page }) => {
  await visit(page, 'crm/login.html', { role: 'technician', uid: 'u1', data: data('technician', { accessDisabled: true }) });
  await expect(page.locator('#error-msg')).toContainText(/deactivated/i);
  expect(page.url()).toMatch(/login\.html/);
  const p2 = await page.context().newPage();
  await visit(p2, 'crm/login.html?deactivated=1', {});
  await expect(p2.locator('#error-msg')).toContainText(/deactivated/i);
  await p2.close();
  // A normal account is routed to its own dashboard.
  const p3 = await page.context().newPage();
  await visit(p3, 'crm/login.html', { role: 'warehouse', uid: 'u1', data: data('warehouse') });
  await p3.waitForURL(/CRMwarehouse\.html/, { timeout: 10000 });
  await p3.close();
});
