const { test, expect } = require('@playwright/test');

const CRM_BASE = './crm/';
const ROLE_PAGES = {
  superadmin: 'CRMsuperadmin.html',
  warehouse: 'CRMwarehouse.html',
  servicecenter: 'CRMservicecenter.html',
  technician: 'CRMtechnician.html',
  dealer: 'CRMdealer.html',
  distributor: 'CRMdistributor.html',
};

const protectedPages = Object.values(ROLE_PAGES);

async function collectBrowserErrors(page) {
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => pageErrors.push(String(err)));
  return { consoleErrors, pageErrors };
}

test('CRM login page renders and exposes the expected authentication controls', async ({ page }) => {
  const { consoleErrors, pageErrors } = await collectBrowserErrors(page);
  const response = await page.goto(`${CRM_BASE}login.html`, { waitUntil: 'domcontentloaded' });

  expect(response && response.ok(), `CRM login HTTP status: ${response && response.status()}`).toBeTruthy();
  await expect(page).toHaveTitle(/Pushpak Enterprises CRM.*Login/i);
  await expect(page.locator('#login-form')).toBeVisible();
  await expect(page.locator('#email')).toHaveAttribute('type', 'email');
  await expect(page.locator('#password')).toHaveAttribute('type', 'password');
  await expect(page.locator('#login-btn')).toHaveText('Sign in');
  await expect(page.locator('#forgot-link')).toBeVisible();
  await expect(page.locator('a[href="../index.html"]')).toBeVisible();

  expect(pageErrors, `CRM login page errors:\n${pageErrors.join('\n')}`).toEqual([]);
  expect(consoleErrors, `CRM login console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
});

test('CRM login validates an invalid email before authentication', async ({ page }) => {
  await page.goto(`${CRM_BASE}login.html`, { waitUntil: 'domcontentloaded' });
  await page.locator('#email').fill('not-an-email');
  await page.locator('#password').fill('invalid-test-password');
  await page.locator('#login-btn').click();

  // Native HTML validation should prevent the Firebase request.
  await expect(page.locator('#email')).toBeFocused();
  await expect(page.locator('#login-btn')).toHaveText('Sign in');
});

test('CRM protected dashboards do not expose the application to anonymous users', async ({ browser }) => {
  for (const rolePage of protectedPages) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const { consoleErrors, pageErrors } = await collectBrowserErrors(page);

    await page.goto(`${CRM_BASE}${rolePage}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    const currentUrl = page.url();
    const appVisible = await page.locator('#app').isVisible().catch(() => false);
    const gateVisible = await page.locator('#gate').isVisible().catch(() => false);
    const loginFormVisible = await page.locator('#login-form').isVisible().catch(() => false);

    // A protected dashboard may either redirect to login or keep the auth gate visible.
    // It must not expose its authenticated application shell to an anonymous browser.
    expect(
      !appVisible || loginFormVisible || /login\.html/i.test(currentUrl) || gateVisible,
      `${rolePage} exposed #app to an anonymous session at ${currentUrl}`
    ).toBeTruthy();

    expect(pageErrors, `${rolePage} page errors:\n${pageErrors.join('\n')}`).toEqual([]);
    expect(consoleErrors, `${rolePage} console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
    await context.close();
  }
});

test('authenticated CRM workflow runs when a dedicated QA account is configured', async ({ page }) => {
  const email = process.env.QA_EMAIL;
  const password = process.env.QA_PASSWORD;
  const role = (process.env.QA_ROLE || '').toLowerCase();

  test.skip(!email || !password, 'Set QA_EMAIL and QA_PASSWORD GitHub Actions secrets to enable authenticated CRM testing.');
  test.skip(!ROLE_PAGES[role], `Set QA_ROLE to one of: ${Object.keys(ROLE_PAGES).join(', ')}`);

  const { consoleErrors, pageErrors } = await collectBrowserErrors(page);
  await page.goto(`${CRM_BASE}login.html`, { waitUntil: 'domcontentloaded' });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#login-btn').click();

  await page.waitForURL(new RegExp(ROLE_PAGES[role].replace('.', '\\.') + '$'), { timeout: 20_000 });
  await expect(page.locator('#app')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#gate')).toBeHidden({ timeout: 10_000 });
  await expect(page.locator('#content')).toBeVisible();

  expect(pageErrors, `Authenticated ${role} page errors:\n${pageErrors.join('\n')}`).toEqual([]);
  expect(consoleErrors, `Authenticated ${role} console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
});
