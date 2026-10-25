// Browser helper for QA runners that drive Playwright from node scripts
// (used when the Playwright MCP browser is not available to the runner).
// Talks only to the safe server (QA-tests/tools/safe-server.mjs) on :8080.
//
//   import { open } from '../../tools/pw.mjs';
//   const qa = await open({ runDir, role: 'superadmin', seed: { data: {...} } });
//   await qa.goto('/crm/CRMsuperadmin.html');
//   await qa.shot('TC01-load');            // -> <runDir>/TC01-load.png
//   ... use qa.page (a normal Playwright Page) ...
//   const log = await qa.close();          // { consoleErrors, consoleWarnings, failedRequests, external, stubWrites }
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(path.resolve(import.meta.dirname, '../../node_modules/@playwright/test'));
const BASE = process.env.QA_BASE_URL || 'http://localhost:8080';
const EXE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

export async function open({ runDir, role = null, seed = null, viewport = { width: 1366, height: 900 } } = {}) {
  const browser = await chromium.launch({ executablePath: EXE });
  const context = await browser.newContext({ viewport, baseURL: BASE });
  const page = await context.newPage();
  const log = { consoleErrors: [], consoleWarnings: [], failedRequests: [], external: [] };
  const watch = (p) => {
    p.on('console', (m) => { const t = m.type(); if (t === 'error') log.consoleErrors.push(m.text().slice(0, 300)); else if (t === 'warning') log.consoleWarnings.push(m.text().slice(0, 300)); });
    p.on('pageerror', (e) => log.consoleErrors.push('pageerror: ' + e.message.slice(0, 300)));
    p.on('requestfailed', (r) => { const u = r.url(); (u.startsWith(BASE) ? log.failedRequests : log.external).push({ method: r.method(), url: u, error: r.failure()?.errorText }); });
    p.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(BASE)) log.failedRequests.push({ method: r.request().method(), url: r.url(), status: r.status() }); });
    p.on('request', (r) => { if (/firestore\.googleapis\.com|cloudfunctions\.net|identitytoolkit/.test(r.url())) throw new Error('UNSAFE: live Firebase request ' + r.url()); });
  };
  watch(page); context.on('page', watch);
  await page.goto('/__stub/session' + (role && role !== 'anonymous' ? '?role=' + encodeURIComponent(role) : ''));
  if (seed) await page.evaluate((s) => fetch('/__stub/seed', { method: 'POST', body: JSON.stringify(s) }), seed);
  if (runDir) fs.mkdirSync(runDir, { recursive: true });
  let shots = 0;
  return {
    browser, context, page, log,
    goto: (u, o) => page.goto(u, { waitUntil: 'load', ...o }).then(async (r) => { await page.waitForTimeout(1200); return r; }),
    shot: async (name, o = {}) => { shots++; const f = path.join(runDir, name.replace(/\.png$/, '') + '.png'); await page.screenshot({ path: f, fullPage: false, ...o }); return f; },
    setRole: async (r, s) => { await page.goto('/__stub/session' + (r && r !== 'anonymous' ? '?role=' + r : '')); if (s) await page.evaluate((x) => fetch('/__stub/seed', { method: 'POST', body: JSON.stringify(x) }), s); },
    writes: () => page.evaluate(() => window.__stubWrites || []),
    close: async () => { let stubWrites = []; try { stubWrites = await page.evaluate(() => window.__stubWrites || []); } catch {} await browser.close(); return { ...log, stubWrites, screenshots: shots }; },
  };
}
