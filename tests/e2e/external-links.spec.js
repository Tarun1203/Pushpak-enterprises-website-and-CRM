// Phase 5 item 7 — outside links and libraries. Every external address the
// pages load or link to (Firebase SDK modules, Google Fonts, any outside
// link) must still answer. A missing Firebase module would break every CRM
// page, so this runs on each QA run. Local files are checked separately in
// tests/unit/links.test.mjs.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'qa-results', 'test-results', 'functions', 'tests', '.github']);
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!/^assets[\\/]logos$/.test(path.relative(ROOT, p))) walk(p, out); } else if (/\.(html|js|css)$/.test(e.name)) out.push(p);
  }
  return out;
}

function externalUrls() {
  const found = new Map();
  for (const f of walk(ROOT)) {
    const src = fs.readFileSync(f, 'utf8')
      .replace(/<link\b[^>]*rel=["']preconnect["'][^>]*>/gi, ''); // connection hints, not resources
    for (const m of src.matchAll(/https?:\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:\/[^\s"'`<>()\\]*)?/g)) {
      let u = m[0].replace(/&amp;/g, '&').replace(/[.,;:]+$/, '');
      if (/\$\{|\.\.\.$/.test(u) || /^https?:\/\/(www\.)?w3\.org\//.test(u)) continue; // template pieces, XML namespaces
      if (/^https:\/\/api\.github\.com\//.test(u)) continue; // built at run time by the bug tracker
      if (!found.has(u)) found.set(u, path.relative(ROOT, f));
    }
  }
  return [...found.entries()];
}

test('every outside address used by the site still answers', async ({ request }) => {
  test.setTimeout(180000);
  const urls = externalUrls();
  expect(urls.length, 'found the outside addresses').toBeGreaterThan(3);
  const broken = [];
  const unverified = [];
  for (const [url, file] of urls) {
    let status = null, error = null;
    for (let attempt = 0; attempt < 2 && status === null; attempt++) {
      try {
        const r = await request.get(url, { timeout: 20000, maxRedirects: 5, failOnStatusCode: false });
        status = r.status();
      } catch (e) { error = e.message.split('\n')[0]; }
    }
    if (status === null) broken.push(`${url} (in ${file}) — no response: ${error}`);
    else if (status === 404 || status === 410) broken.push(`${url} (in ${file}) — HTTP ${status}`);
    else if (status >= 400) unverified.push(`${url} — HTTP ${status}`);
  }
  // Sites that refuse automated checks (401/403/429/5xx) are reported, not failed.
  for (const u of unverified) test.info().annotations.push({ type: 'could not verify', description: u });
  expect(broken, 'outside addresses that are gone').toEqual([]);
});
