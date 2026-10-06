const { test, expect } = require('@playwright/test');

const SKIP = /\.(?:png|jpe?g|gif|svg|webp|ico|pdf|zip|mp4|webm|css|js|json|xml|txt|csv|xlsx?|docx?|woff2?|ttf)$/i;
const MAX_PAGES = Number(process.env.QA_MAX_PAGES || 150);

function canonical(raw, base) {
  try {
    const u = new URL(raw, base);
    if (!['http:', 'https:'].includes(u.protocol)) return null;
    u.hash = '';
    u.search = '';
    return u.href;
  } catch { return null; }
}

function eligible(url, origin) {
  try {
    const u = new URL(url);
    return u.origin === origin && !SKIP.test(u.pathname) && !u.pathname.includes('/api/');
  } catch { return false; }
}

test('crawl and validate the public site', async ({ browser, request }) => {
  const context = await browser.newContext();
  const queue = [new URL('./', process.env.BASE_URL || 'https://tarun1203.github.io/Pushpak-enterprises-website-and-CRM/').href];
  const seen = new Set();
  const failures = [];
  const visited = [];

  while (queue.length && visited.length < MAX_PAGES) {
    const url = canonical(queue.shift(), queue[0] || queue[0]);
    if (!url || seen.has(url)) continue;
    seen.add(url);

    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', e => pageErrors.push(String(e)));

    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25_000 });
      visited.push(url);
      if (!response || response.status() >= 400) {
        failures.push({ url, type: 'http', detail: `HTTP ${response ? response.status() : 'NO_RESPONSE'}` });
      }
      await expect(page.locator('body')).toBeVisible({ timeout: 8_000 });

      for (const e of consoleErrors) failures.push({ url, type: 'console', detail: e });
      for (const e of pageErrors) failures.push({ url, type: 'pageerror', detail: e });

      const links = await page.locator('a[href]').evaluateAll(as => as.map(a => a.href));
      for (const raw of links) {
        const next = canonical(raw, url);
        if (next && eligible(next, new URL(url).origin) && !seen.has(next)) queue.push(next);
      }
    } catch (e) {
      visited.push(url);
      failures.push({ url, type: 'navigation', detail: e.message });
    } finally {
      await page.close();
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: process.env.BASE_URL || 'https://tarun1203.github.io/Pushpak-enterprises-website-and-CRM/',
    maxPages: MAX_PAGES,
    pagesVisited: visited.length,
    pagesDiscovered: seen.size + queue.length,
    failures,
    status: failures.length ? 'FAIL' : 'PASS'
  };
  console.log(`QA_REPORT=${JSON.stringify(report)}`);
  expect(failures, JSON.stringify(report, null, 2)).toEqual([]);
});
