// Phase 5 item 7 — broken-link tests (files in this commit). Every link,
// image, script, stylesheet, background image and page reference on every
// page must point at a file that exists — with the exact same upper/lower
// case, because GitHub Pages is case-sensitive even though Windows is not —
// and every #anchor must exist on the page it points to.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'qa-results', 'test-results', 'functions', 'tests', '.github']);
// Old copies kept inside assets/ are not linked from the site.
const SKIP_PAGES = [/^assets\/logos\//];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const FILES = walk(ROOT);
const EXACT = new Set(FILES.map(rel));
const LOWER = new Map(FILES.map((f) => [rel(f).toLowerCase(), rel(f)]));
const PAGES = FILES.filter((f) => f.endsWith('.html') && !SKIP_PAGES.some((re) => re.test(rel(f))));
const CSS = FILES.filter((f) => f.endsWith('.css') && !SKIP_PAGES.some((re) => re.test(rel(f))));

// Hash routes handled by page scripts rather than by an element id.
const SCRIPT_HASHES = {
  'index.html': ['register-product', 'book-service', 'track-service', 'warranty-check', 'manuals', 'brochures', 'support', 'faq']
};

const decodeEnt = (s) => s.replace(/&amp;/g, '&').replace(/&#39;|&#039;/g, "'").replace(/&quot;/g, '"');
function refsInHtml(html) {
  const out = [];
  const noScripts = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (m) => (/\bsrc\s*=/.test(m.slice(0, m.indexOf('>'))) ? m.slice(0, m.indexOf('>') + 1) : ''));
  for (const m of noScripts.matchAll(/<(a|link|img|script|source|iframe|video|audio|use|area|form|object|embed)\b([^>]*)>/gi)) {
    for (const a of m[2].matchAll(/\b(href|src|srcset|data-src|poster|action|data|xlink:href)\s*=\s*("([^"]*)"|'([^']*)')/gi)) {
      const v = decodeEnt(a[3] !== undefined ? a[3] : a[4]);
      if (a[1].toLowerCase() === 'srcset') v.split(',').forEach((s) => out.push({ attr: 'srcset', url: s.trim().split(/\s+/)[0] }));
      else out.push({ attr: `${m[1].toLowerCase()} ${a[1]}`, url: v });
    }
  }
  for (const m of noScripts.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) out.push({ attr: 'css url()', url: decodeEnt(m[1]) });
  // Page files named in scripts (redirects, links built in code).
  for (const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    for (const s of m[1].matchAll(/["'`]((?:\.\.?\/)?[\w\-./]+\.(?:html|png|jpe?g|webp|svg|pdf|css|js))(?:[?#][^"'`]*)?["'`]/g)) {
      if (/^(?:https?:)?\/\//.test(s[1]) || s[1].includes('${')) continue;
      // A bare file name in code is usually joined to a folder elsewhere; only
      // pages and full relative paths can be checked on their own.
      if (!s[1].includes('/') && !s[1].endsWith('.html')) continue;
      out.push({ attr: 'script', url: s[1] });
    }
  }
  return out;
}

function resolveLocal(fromFile, url) {
  if (!url || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url) || url.startsWith('{') || url.includes('${')) return null; // external, mailto:, tel:, data:, javascript:
  const [pathPart, hash = ''] = url.split('#');
  const clean = pathPart.split('?')[0];
  let target;
  if (!clean) target = rel(fromFile);
  else {
    const abs = clean.startsWith('/') ? path.join(ROOT, clean.replace(/^\/Pushpak-enterprises-website-and-CRM/i, '')) : path.resolve(path.dirname(fromFile), decodeURIComponent(clean));
    target = rel(abs);
    if (!path.extname(target) || clean.endsWith('/')) target = (target ? target.replace(/\/$/, '') + '/' : '') + 'index.html';
  }
  return { target, hash: decodeURIComponent(hash) };
}

const ids = new Map();
function idsOf(file) {
  if (!ids.has(file)) {
    const html = fs.existsSync(path.join(ROOT, file)) ? fs.readFileSync(path.join(ROOT, file), 'utf8') : '';
    ids.set(file, new Set([...html.matchAll(/\b(?:id|name)\s*=\s*["']([^"']+)["']/g)].map((m) => m[1])));
  }
  return ids.get(file);
}

test('every local link, image, script and stylesheet exists with the exact file-name case', () => {
  const problems = [];
  let checked = 0;
  for (const page of PAGES) {
    const html = fs.readFileSync(page, 'utf8');
    for (const { attr, url } of refsInHtml(html)) {
      const r = resolveLocal(page, url);
      if (!r) continue;
      checked++;
      if (EXACT.has(r.target)) continue;
      const near = LOWER.get(r.target.toLowerCase());
      problems.push(near
        ? `${rel(page)}: ${attr} "${url}" — the file is "${near}" (upper/lower case differs; breaks on GitHub Pages)`
        : `${rel(page)}: ${attr} "${url}" — no such file (${r.target})`);
    }
  }
  for (const css of CSS) {
    for (const m of fs.readFileSync(css, 'utf8').matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
      const r = resolveLocal(css, m[1]);
      if (!r) continue;
      checked++;
      if (!EXACT.has(r.target)) problems.push(`${rel(css)}: url("${m[1]}") — no such file`);
    }
  }
  assert.ok(checked > 50, `found the references (${checked})`);
  assert.deepStrictEqual([...new Set(problems)], []);
});

test('every #anchor link lands on something that exists', () => {
  const problems = [];
  for (const page of PAGES) {
    const html = fs.readFileSync(page, 'utf8');
    for (const { attr, url } of refsInHtml(html)) {
      if (!attr.startsWith('a ') || !url.includes('#')) continue;
      const r = resolveLocal(page, url);
      if (!r || !r.hash || !r.target.endsWith('.html') || !EXACT.has(r.target)) continue;
      if (idsOf(r.target).has(r.hash) || (SCRIPT_HASHES[r.target] || []).includes(r.hash)) continue;
      problems.push(`${rel(page)}: "${url}" — no element with id "${r.hash}" on ${r.target}`);
    }
  }
  assert.deepStrictEqual([...new Set(problems)], []);
});

test('no page links to a local file over plain http or to localhost', () => {
  const problems = [];
  for (const page of PAGES) {
    for (const { attr, url } of refsInHtml(fs.readFileSync(page, 'utf8'))) {
      if (/^http:\/\//i.test(url) && !/^http:\/\/(www\.)?w3\.org/i.test(url)) problems.push(`${rel(page)}: ${attr} uses insecure http: ${url}`);
      if (/\/\/(localhost|127\.0\.0\.1)/i.test(url)) problems.push(`${rel(page)}: ${attr} points at localhost: ${url}`);
    }
  }
  assert.deepStrictEqual(problems, []);
});
