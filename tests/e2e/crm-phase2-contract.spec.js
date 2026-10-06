const { test, expect } = require('@playwright/test');

const CRM_BASE = './crm/';
const rolePages = [
  ['Super Admin', 'CRMsuperadmin.html'],
  ['Area Manager', 'CRMareamanager.html'],
  ['Warehouse', 'CRMwarehouse.html'],
  ['Service Center', 'CRMservicecenter.html'],
  ['Technician', 'CRMtechnician.html'],
  ['Dealer', 'CRMdealer.html'],
  ['Distributor', 'CRMdistributor.html'],
];

const browserErrorCapture = page => {
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => pageErrors.push(String(err)));
  return { consoleErrors, pageErrors };
};

test('all CRM role dashboards are reachable and contain the authentication shell', async ({ page }) => {
  for (const [role, file] of rolePages) {
    const { consoleErrors, pageErrors } = browserErrorCapture(page);
    const response = await page.goto(`${CRM_BASE}${file}`, { waitUntil: 'domcontentloaded' });
    expect(response && response.ok(), `${role}: HTTP ${response && response.status()}`).toBeTruthy();
    await expect(page.locator('#gate'), `${role}: missing auth gate`).toBeAttached();
    await expect(page.locator('#app'), `${role}: missing protected app shell`).toBeAttached();
    await expect(page.locator('#content'), `${role}: missing content mount`).toBeAttached();
    await expect(page.locator('#logout-btn'), `${role}: missing logout control`).toBeAttached();
    expect(pageErrors, `${role} page errors:\n${pageErrors.join('\n')}`).toEqual([]);
    expect(consoleErrors, `${role} console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
  }
});

test('CRM role pages keep the application hidden before authentication', async ({ browser }) => {
  for (const [role, file] of rolePages) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${CRM_BASE}${file}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const appVisible = await page.locator('#app').isVisible().catch(() => false);
    const gateVisible = await page.locator('#gate').isVisible().catch(() => false);
    const loginVisible = await page.locator('#login-form').isVisible().catch(() => false);
    const redirected = /login\.html/i.test(page.url());
    expect(!appVisible || gateVisible || loginVisible || redirected,
      `${role}: protected application became visible anonymously at ${page.url()}`).toBeTruthy();
    await context.close();
  }
});

test('service center dashboard exposes the Phase 2 service workflow shell', async ({ page }) => {
  await page.goto(`${CRM_BASE}CRMservicecenter.html`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#gate')).toBeAttached();
  await expect(page.locator('#nav-container')).toBeAttached();
  await expect(page.locator('#spare-req-form')).toBeAttached();
  await expect(page.locator('#spare-req-part')).toHaveAttribute('required', '');
  await expect(page.locator('#spare-req-qty')).toHaveAttribute('min', '1');
  await expect(page.locator('#sc-closure-form')).toBeAttached();
  await expect(page.locator('#sc-closure-code')).toHaveAttribute('required', '');
  await expect(page.locator('#sc-closure-notes')).toHaveAttribute('required', '');
});

test('CRM login exposes safe password and reset controls', async ({ page }) => {
  await page.goto(`${CRM_BASE}login.html`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#email')).toHaveAttribute('autocomplete', /email/i);
  await expect(page.locator('#password')).toHaveAttribute('type', 'password');
  await expect(page.locator('#password')).toHaveAttribute('autocomplete', /current-password/i);
  await expect(page.locator('#forgot-link')).toBeVisible();
});

test('CRM static pages do not contain obvious hard-coded private credentials', async ({ request }) => {
  for (const [, file] of rolePages) {
    const response = await request.get(`${CRM_BASE}${file}`);
    expect(response.ok(), `${file}: HTTP ${response.status()}`).toBeTruthy();
    const html = await response.text();
    expect(html, `${file}: possible hard-coded credential`).not.toMatch(/password\s*[:=]\s*["'][^"']{8,}["']/i);
    expect(html, `${file}: possible private token`).not.toMatch(/(?:secret|private[_-]?key|access[_-]?token)\s*[:=]\s*["'][^"']{12,}["']/i);
  }
});
