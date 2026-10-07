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
      await page.goto(new URL(path, PUBLIC_BASE).toString(), {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
      await expect(page.locator('body')).toBeVisible();
    }

    expect(consoleErrors, 'Console errors detected on critical public pages').toEqual([]);
  });

  test('critical pages do not produce same-origin failed resource requests', async ({ page }) => {
    const failures = [];
    const seen = new Set();
    const baseOrigin = new URL(PUBLIC_BASE).origin;

    page.on('response', response => {
      try {
        const url = new URL(response.url());
        if (response.status() >= 400 && url.origin === baseOrigin) {
          const failure = `${response.status()} ${response.url()}`;
          if (!seen.has(failure)) {
            seen.add(failure);
            failures.push(failure);
          }
        }
      } catch (_) {
        // Ignore malformed/non-HTTP URLs.
      }
    });

    // Do not wait for networkidle: public pages can contain long-lived or third-party
    // requests. The load event plus a short settling window is sufficient to capture
    // same-origin HTTP failures without turning a healthy page into a timeout.
    for (const path of ['', 'product.html', 'makwell/index.html', 'flyvision/index.html', 'skevia/index.html']) {
      await page.goto(new URL(path, PUBLIC_BASE).toString(), {
        waitUntil: 'load',
        timeout: 30_000,
      });
      await expect(page.locator('body')).toBeVisible();
      await page.waitForTimeout(750);
    }

    expect(failures, 'Same-origin resources returned HTTP 4xx/5xx').toEqual([]);
  });

  test('CRM authentication surface is available and protected', async ({ page }) => {
    const response = await page.goto(new URL('crm/login.html', PUBLIC_BASE).toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    expect(response.status()).toBeLessThan(400);
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('#login-btn')).toBeVisible();
  });
});
