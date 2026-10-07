const { test, expect } = require('@playwright/test');

const PUBLIC_BASE = process.env.BASE_URL || 'https://tarun1203.github.io/Pushpak-enterprises-website-and-CRM/';

const publicPages = [
  '',
  'product.html',
  'makwell/index.html',
  'flyvision/index.html',
  'skevia/index.html',
  '404.html',
];

test.describe('Phase 6 — production readiness', () => {
  test('public production pages are reachable over HTTPS', async ({ request }) => {
    expect(PUBLIC_BASE).toMatch(/^https:\/\//);

    for (const path of publicPages) {
      const response = await request.get(new URL(path, PUBLIC_BASE).toString(), {
        failOnStatusCode: false,
      });
      expect(response.status(), `Unexpected HTTP status for ${path || '/'}`).toBeLessThan(400);
    }
  });

  test('critical public pages render without browser console errors', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    for (const path of ['', 'makwell/index.html', 'flyvision/index.html', 'skevia/index.html']) {
      await page.goto(new URL(path, PUBLIC_BASE).toString(), { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body')).toBeVisible();
    }

    expect(consoleErrors, 'Console errors detected on critical public pages').toEqual([]);
  });

  test('critical pages do not produce same-origin failed resource requests', async ({ page }) => {
    const failures = [];
    const baseOrigin = new URL(PUBLIC_BASE).origin;

    page.on('response', response => {
      try {
        if (response.status() >= 400 && new URL(response.url()).origin === baseOrigin) {
          failures.push(`${response.status()} ${response.url()}`);
        }
      } catch (_) {
        // Ignore malformed/non-HTTP URLs.
      }
    });

    for (const path of ['', 'product.html', 'makwell/index.html', 'flyvision/index.html', 'skevia/index.html']) {
      await page.goto(new URL(path, PUBLIC_BASE).toString(), { waitUntil: 'networkidle' });
    }

    expect(failures, 'Same-origin resources returned HTTP 4xx/5xx').toEqual([]);
  });

  test('CRM authentication surface is available and protected', async ({ page }) => {
    const response = await page.goto(new URL('crm/login.html', PUBLIC_BASE).toString(), {
      waitUntil: 'domcontentloaded',
    });

    expect(response.status()).toBeLessThan(400);
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('#login-btn')).toBeVisible();
  });
});
