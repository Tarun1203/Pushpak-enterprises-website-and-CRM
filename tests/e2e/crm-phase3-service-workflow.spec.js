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

test('Phase 3 service request intake exposes required customer and issue fields', async ({ page }) => {
  await loginAsQa(page);
  const form = page.locator('#req-form');
  await expect(form).toBeAttached();
  await expect(page.locator('#req-customer-name')).toHaveAttribute('required', '');
  await expect(page.locator('#req-customer-phone')).toHaveAttribute('required', '');
  await expect(page.locator('#req-issue')).toHaveAttribute('required', '');
  await expect(page.locator('#req-brand')).toBeAttached();
  await expect(page.locator('#req-model-select')).toBeAttached();
  await expect(page.locator('#req-serial')).toBeAttached();
});

test('Phase 3 appointment booking requires a complete time window', async ({ page }) => {
  await loginAsQa(page);
  await expect(page.locator('#req-schedule-form')).toBeAttached();
  await expect(page.locator('#req-schedule-date')).toHaveAttribute('required', '');
  await expect(page.locator('#req-schedule-start')).toHaveAttribute('required', '');
  await expect(page.locator('#req-schedule-end')).toHaveAttribute('required', '');

  await page.locator('#req-schedule-date').fill('2030-01-15');
  await page.locator('#req-schedule-start').fill('10:00');
  await page.locator('#req-schedule-end').fill('11:00');
  await expect(page.locator('#req-schedule-date')).toHaveJSProperty('validity.valid', true);
  await expect(page.locator('#req-schedule-start')).toHaveJSProperty('validity.valid', true);
  await expect(page.locator('#req-schedule-end')).toHaveJSProperty('validity.valid', true);
});

test('Phase 3 technician assignment controls exist and are scoped to Service Center', async ({ page }) => {
  await loginAsQa(page);
  await expect(page.locator('#req-assign-tech-form')).toBeAttached();
  await expect(page.locator('#req-assign-tech-select')).toBeAttached();
  await expect(page.locator('#tech-form')).toBeAttached();
  await expect(page.locator('#tech-name')).toHaveAttribute('required', '');
  await expect(page.locator('#tech-phone')).toHaveAttribute('required', '');
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

test('Phase 3 service center closure supports controlled spare consumption inputs', async ({ page }) => {
  await loginAsQa(page);
  await expect(page.locator('#sc-closure-part-1')).toBeAttached();
  await expect(page.locator('#sc-closure-partqty-1')).toHaveAttribute('min', '1');
  await expect(page.locator('#sc-closure-part-2')).toBeAttached();
  await expect(page.locator('#sc-closure-partqty-2')).toHaveAttribute('min', '1');
  await expect(page.locator('#sc-closure-part-3')).toBeAttached();
  await expect(page.locator('#sc-closure-partqty-3')).toHaveAttribute('min', '1');
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
