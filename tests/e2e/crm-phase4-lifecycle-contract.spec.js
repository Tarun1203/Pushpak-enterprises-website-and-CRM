const { test, expect } = require('@playwright/test');

const CRM_BASE = './crm/';

async function loginAsQa(page) {
  test.skip(!process.env.QA_EMAIL || !process.env.QA_PASSWORD,
    'Phase 4 requires QA_EMAIL and QA_PASSWORD GitHub Actions secrets.');
  test.skip((process.env.QA_ROLE || '').toLowerCase() !== 'servicecenter',
    'Phase 4 lifecycle browser checks require QA_ROLE=servicecenter.');

  await page.goto(`${CRM_BASE}login.html`, { waitUntil: 'domcontentloaded' });
  await page.locator('#email').fill(process.env.QA_EMAIL);
  await page.locator('#password').fill(process.env.QA_PASSWORD);
  await page.locator('#login-btn').click();
  await page.waitForURL(/CRMservicecenter\.html$/, { timeout: 20_000 });
  await expect(page.locator('#app')).toBeVisible({ timeout: 10_000 });
}

test('Phase 4 exposes the complete service lifecycle surface', async ({ page }) => {
  await loginAsQa(page);

  const requiredSelectors = [
    '#req-form',
    '#req-customer-name',
    '#req-customer-phone',
    '#req-brand',
    '#req-model-select',
    '#req-serial',
    '#req-issue',
    '#req-schedule-form',
    '#req-schedule-date',
    '#req-schedule-start',
    '#req-schedule-end',
    '#req-assign-tech-form',
    '#req-assign-tech-select',
    '#spare-req-form',
    '#spare-req-part',
    '#spare-req-qty',
    '#sc-closure-form',
    '#sc-closure-code',
    '#sc-closure-notes',
    '#sc-closure-part-1',
    '#sc-closure-partqty-1',
  ];

  for (const selector of requiredSelectors) {
    await expect(page.locator(selector), `Missing lifecycle control: ${selector}`).toBeAttached();
  }
});

test('Phase 4 enforces request, appointment and closure validation boundaries', async ({ page }) => {
  await loginAsQa(page);

  await expect(page.locator('#req-customer-name')).toHaveAttribute('required', '');
  await expect(page.locator('#req-customer-phone')).toHaveAttribute('required', '');
  await expect(page.locator('#req-issue')).toHaveAttribute('required', '');
  await expect(page.locator('#req-schedule-date')).toHaveAttribute('required', '');
  await expect(page.locator('#req-schedule-start')).toHaveAttribute('required', '');
  await expect(page.locator('#req-schedule-end')).toHaveAttribute('required', '');
  await expect(page.locator('#sc-closure-code')).toHaveAttribute('required', '');
  await expect(page.locator('#sc-closure-notes')).toHaveAttribute('required', '');

  await page.locator('#req-schedule-date').fill('2030-01-15');
  await page.locator('#req-schedule-start').fill('10:00');
  await page.locator('#req-schedule-end').fill('11:00');
  await expect(page.locator('#req-schedule-start')).toHaveJSProperty('validity.valid', true);
  await expect(page.locator('#req-schedule-end')).toHaveJSProperty('validity.valid', true);
});

test('Phase 4 spare consumption cannot accept zero quantity', async ({ page }) => {
  await loginAsQa(page);
  for (const selector of ['#spare-req-qty', '#sc-closure-partqty-1', '#sc-closure-partqty-2', '#sc-closure-partqty-3']) {
    const field = page.locator(selector);
    if (await field.count()) {
      await expect(field).toHaveAttribute('min', '1');
      await field.fill('0');
      await expect(field).toHaveJSProperty('validity.valid', false);
    }
  }
});

test('Phase 4 service center remains isolated from administrative controls', async ({ page }) => {
  await loginAsQa(page);
  for (const selector of ['#create-super-admin', '#manage-users-admin', '#warehouse-adjustment-admin']) {
    await expect(page.locator(selector)).toHaveCount(0);
  }
});
