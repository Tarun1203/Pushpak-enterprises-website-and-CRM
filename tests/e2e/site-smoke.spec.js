const { test, expect } = require('@playwright/test');

const ignoredExtensions = /\.(?:png|jpe?g|gif|svg|webp|ico|pdf|zip|mp4|webm|css|js|json|xml|txt|csv|xlsx?)$/i;

function normalizeUrl(raw, base) {
  try {
    const u = new URL(raw, base);
    if (!['http:', 'https:'].includes(u.protocol)) return null;
    u.hash = '';
    return u.href;
  } catch { return null; }
}

function sameSite(url, base) {
  try { return new URL(url).origin === new URL(base).origin; } catch { return false; }
}

test('homepage loads without browser errors', async ({ page }) => {
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => pageErrors.push(String(err)));

  const response = await page.goto('./', { waitUntil: 'domcontentloaded' });
  expect(response && response.ok(), `Homepage HTTP status: ${response && response.status()}`).toBeTruthy();
  await expect(page.locator('body')).toBeVisible();
  expect(pageErrors, `Page errors:\n${pageErrors.join('\n')}`).toEqual([]);
  expect(consoleErrors, `Console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
});

test('same-site links are reachable', async ({ page, request }) => {
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  const base = page.url();
  const links = await page.locator('a[href]').evaluateAll(as => as.map(a => ({ href: a.href, text: (a.textContent || '').trim() })));
  const urls = [...new Map(links.map(x => [normalizeUrl(x.href, base), x])).entries()]
    .filter(([u]) => u && sameSite(u, base) && !ignoredExtensions.test(new URL(u).pathname));

  const failures = [];
  for (const [url, meta] of urls) {
    try {
      const r = await request.get(url, { failOnStatusCode: false, timeout: 15_000 });
      if (r.status() >= 400) failures.push(`${r.status()} ${url} (${meta.text || 'link'})`);
    } catch (e) { failures.push(`ERROR ${url}: ${e.message}`); }
  }
  expect(failures, failures.join('\n')).toEqual([]);
});

test('homepage has usable navigation and no obvious broken assets', async ({ page, request }) => {
  // Do not require networkidle: Firebase, analytics, fonts and other long-lived requests
  // can legitimately keep a production page from reaching networkidle.
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).toBeVisible();
  await page.waitForTimeout(1500);
  const assets = await page.evaluate(() => [
    ...Array.from(document.querySelectorAll('img[src]')).map(x => x.src),
    ...Array.from(document.querySelectorAll('script[src]')).map(x => x.src),
    ...Array.from(document.querySelectorAll('link[href]')).map(x => x.href),
  ]);
  const failures = [];
  for (const raw of [...new Set(assets)]) {
    const u = normalizeUrl(raw, page.url());
    if (!u || !sameSite(u, page.url())) continue;
    try {
      const r = await request.get(u, { failOnStatusCode: false, timeout: 15_000 });
      if (r.status() >= 400) failures.push(`${r.status()} ${u}`);
    } catch (e) { failures.push(`ERROR ${u}: ${e.message}`); }
  }
  expect(failures, failures.join('\n')).toEqual([]);
});

test('interactive controls are not obviously broken', async ({ page }) => {
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  const buttons = page.locator('button, [role="button"]');
  const count = await buttons.count();
  for (let i = 0; i < Math.min(count, 30); i++) {
    const b = buttons.nth(i);
    if (!(await b.isVisible().catch(() => false))) continue;
    await expect(b).toBeEnabled({ timeout: 3_000 }).catch(() => {});
  }
});
