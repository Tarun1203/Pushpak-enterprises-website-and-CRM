const { test, expect } = require('@playwright/test');

const CRM_BASE = './crm/';

function enabledQa() {
  return Boolean(process.env.QA_EMAIL && process.env.QA_PASSWORD);
}

async function loginAsQa(page) {
  const role = (process.env.QA_ROLE || '').toLowerCase();
  test.skip(!enabledQa(), 'Phase 3 requires QA_EMAIL and QA_PASSWORD GitHub Actions secrets.');
  test.skip(role !== 'servicecenter', 'Phase 3 service workflow requires QA_ROLE=servicecenter.');

  await page.goto(`${CRM_BASE}login.html`, { waitUntil: 'domcontentloaded' });
  await page.locator('#email').fill(process.env.QA_EMAIL);
  await page.locator('#password').fill(process.env.QA_PASSWORD);
  await page.locator('#login-btn').click();
  await page.waitForURL(/CRMservicecenter\.html$/, { timeout: 20_000 });
  await expect(page.locator('#app')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#gate')).toBeHidden({ timeout: 10_000 });
}

test('Phase 3 service center opens authenticated workflow shell', async ({ page }) => {
  await loginAsQa(page);
  await expect(page.locator('#nav-container')).toBeVisible();
  await expect(page.locator('#content')).toBeVisible();
  await expect(page.locator('#logout-btn')).toBeVisible();
});

test('Phase 3 service center spare request form validates quantity', async ({ page }) => {
  await loginAsQa(page);
  const form = page.locator('#spare-req-form');
  await expect(form).toBeAttached();
  await expect(page.locator('#spare-req-part')).toHaveAttribute('required', '');
  await expect(page.locator('#spare-req-qty')).toHaveAttribute('min', '1');

  await page.locator('#spare-req-qty').fill('0');
  await expect(page.locator('#spare-req-qty')).toHaveJSProperty('validity.valid', false);
});

test('Phase 3 service center closure requires code and action notes', async ({ page }) => {
  await loginAsQa(page);
  await expect(page.locator('#sc-closure-form')).toBeAttached();
  await expect(page.locator('#sc-closure-code')).toHaveAttribute('required', '');
  await expect(page.locator('#sc-closure-notes')).toHaveAttribute('required', '');

  await page.locator('#sc-closure-code').selectOption('repaired');
  await page.locator('#sc-closure-notes').fill('QA validation of closure workflow');
  await expect(page.locator('#sc-closure-code')).toHaveJSProperty('validity.valid', true);
  await expect(page.locator('#sc-closure-notes')).toHaveJSProperty('validity.valid', true);
});

test('Phase 3 service center does not expose privileged controls intended for other roles', async ({ page }) => {
  await loginAsQa(page);
  const forbidden = [
    '#create-super-admin',
    '#manage-users-admin',
    '#warehouse-adjustment-admin',
  ];
  for (const selector of forbidden) {
    await expect(page.locator(selector)).toHaveCount(0);
  }
});
