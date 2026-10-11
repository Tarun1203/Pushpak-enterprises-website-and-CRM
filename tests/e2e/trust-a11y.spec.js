// Privacy, consent and accessibility: legal pages, cookie banner, consent tick-boxes,
// no third-party calls, dark-pattern checks, keyboard use, dialogs, contrast (axe).
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { startStaticServer } = require('./support/static-server');
const { installFirebaseStub } = require('./support/firebase-stub');
const { sampleFor } = require('./support/sample-data');
const { runAxe } = require('./a11y-audit');

const ROOT = path.resolve(__dirname, '../..');
let origin, server;
test.beforeAll(async () => { ({ server, origin } = await startStaticServer()); });
test.afterAll(async () => { if (server) server.close(); });

async function open(page, p, role, opts) {
  await installFirebaseStub(page, role ? { role, uid: 'u1', data: sampleFor(role), profile: { role, displayName: 'T', email: 't@pe.test' } } : { role: 'none', uid: 'u1', data: {} });
  const seen = [];
  await page.route(/^https?:\/\//, (r) => { const u = r.request().url(); seen.push(u); return u.startsWith(origin) || /gstatic\.com\/firebasejs/.test(u) ? r.fallback() : r.abort(); });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  if (opts && opts.consent) await page.addInitScript((c) => { localStorage.setItem('pe.consent', JSON.stringify({ v: 1, essential: true, analytics: false, preferences: false, at: new Date().toISOString() })); }, 1);
  await page.goto(origin + '/' + p, { waitUntil: 'load' });
  if (role) await page.waitForFunction(() => { const a = document.getElementById('app'); return a && getComputedStyle(a).display !== 'none'; }, null, { timeout: 10000 });
  await page.waitForTimeout(500);
  return { errors, seen };
}
const PUBLIC = ['index.html', 'product.html', 'portal.html', '404.html', 'makwell/index.html', 'flyvision/index.html', 'skevia/index.html', 'privacy.html', 'terms.html', 'cookies.html'];

test('legal pages: privacy, terms and cookie policy exist, are linked from every public footer, and say the key things', async ({ page }) => {
  for (const p of ['privacy.html', 'terms.html', 'cookies.html']) {
    const { errors } = await open(page, p, null, { consent: true });
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('main')).toContainText('Hubli');
    expect(errors, p).toEqual([]);
  }
  await open(page, 'privacy.html', null, { consent: true });
  const text = await page.locator('main').innerText();
  for (const w of ['Digital Personal Data Protection', 'Firebase', 'reCAPTCHA', 'GitHub Pages', 'withdraw', 'How long we keep it', 'Grievance', 'do not sell']) expect(text, w).toContain(w);
  for (const p of ['index.html', 'product.html', 'makwell/index.html', 'flyvision/index.html', 'skevia/index.html', 'portal.html', '404.html']) {
    await open(page, p, null, { consent: true });
    for (const l of ['privacy.html', 'terms.html', 'cookies.html']) await expect(page.locator(`a[href$="${l}"]`).first(), p + ' ' + l).toBeAttached();
    await expect(page.locator('[data-cookie-settings]').first(), p).toBeAttached();
  }
});

test('cookie banner: shown on first visit, three equal choices, nothing stored before a choice, remembered after', async ({ page }) => {
  await open(page, 'index.html');
  const banner = page.locator('.pe-cc');
  await expect(banner).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('pe.consent'))).toBeNull();
  const btns = banner.locator('.pe-cc-btn');
  await expect(btns).toHaveText(['Reject optional', 'Choose', 'Accept all']);
  const styles = await btns.evaluateAll((els) => els.map((e) => { const c = getComputedStyle(e); const r = e.getBoundingClientRect(); return [c.backgroundColor, c.color, c.fontWeight, c.fontSize, Math.round(r.height)].join('|'); }));
  expect(new Set(styles).size, 'all choices look the same (no nudging)').toBe(1);
  await expect(banner.locator('a[href$="cookies.html"]')).toBeVisible();
  await btns.first().click();
  await expect(banner).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pe.consent')));
  expect(saved).toMatchObject({ essential: true, analytics: false, preferences: false });
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(400);
  await expect(page.locator('.pe-cc')).toHaveCount(0);
  expect(await page.evaluate(() => window.PE_CONSENT.allows('analytics'))).toBe(false);
  expect(await page.evaluate(() => window.PE_CONSENT.allows('essential'))).toBe(true);
});

test('cookie banner: accept, choose-and-save, withdraw later from the footer, and a 12-month expiry', async ({ page }) => {
  await open(page, 'index.html');
  await page.locator('.pe-cc [data-cc="accept"]').click();
  expect(await page.evaluate(() => window.PE_CONSENT.allows('analytics'))).toBe(true);
  // withdraw from the footer
  await page.locator('footer [data-cookie-settings]').first().click();
  const dlg = page.locator('.pe-cc-dialog');
  await expect(dlg).toBeVisible();
  await expect(dlg).toHaveAttribute('role', 'dialog');
  await expect(dlg.locator('#pe-cc-e')).toBeChecked(); await expect(dlg.locator('#pe-cc-e')).toBeDisabled();
  await expect(dlg.locator('#pe-cc-a')).toBeChecked();
  await dlg.locator('#pe-cc-a').uncheck();
  await dlg.locator('[data-p="save"]').click();
  await expect(dlg).toHaveCount(0);
  expect(await page.evaluate(() => window.PE_CONSENT.allows('analytics'))).toBe(false);
  // optional switches start OFF for a new visitor; Escape closes the panel and focus returns
  await page.evaluate(() => localStorage.removeItem('pe.consent'));
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(400);
  await page.locator('.pe-cc [data-cc="choose"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#pe-cc-a')).not.toBeChecked(); await expect(page.locator('#pe-cc-p')).not.toBeChecked();
  await page.keyboard.press('Escape');
  await expect(page.locator('.pe-cc-dialog')).toHaveCount(0);
  await expect(page.locator('.pe-cc [data-cc="choose"]')).toBeFocused();
  expect(await page.evaluate(() => localStorage.getItem('pe.consent'))).toBeNull(); // closing is not consent
  // expired choice is asked again
  await page.evaluate(() => localStorage.setItem('pe.consent', JSON.stringify({ v: 1, essential: true, analytics: true, preferences: true, at: new Date(Date.now() - 400 * 86400000).toISOString() })));
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(400);
  await expect(page.locator('.pe-cc')).toBeVisible();
});

test('cookie banner does not hide content: the page can scroll clear of it, and it is under pop-ups', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await open(page, 'index.html');
  const pad = await page.evaluate(() => parseInt(getComputedStyle(document.body).paddingBottom, 10));
  expect(pad).toBeGreaterThan(80);
  const z = await page.evaluate(() => [+getComputedStyle(document.querySelector('.pe-cc')).zIndex, +getComputedStyle(document.querySelector('.modal-overlay')).zIndex]);
  expect(z[0]).toBeLessThan(z[1]);
});

test('no third-party requests: fonts are our own, nothing goes to Google Fonts or any tracker', async ({ page }) => {
  for (const p of PUBLIC) {
    const { seen, errors } = await open(page, p, null, { consent: true });
    const external = seen.filter((u) => !u.startsWith(origin) && !/gstatic\.com\/firebasejs/.test(u));
    expect(external, p).toEqual([]);
    expect(errors, p).toEqual([]);
  }
  const fonts = await page.evaluate(() => Array.from(document.fonts).filter((f) => f.status === 'loaded').map((f) => f.family));
  expect(fonts.join()).toMatch(/Inter|Manrope/);
});

test('source audit: no Google Fonts, analytics or tracker scripts anywhere in the public site; only known script hosts', async () => {
  const files = [];
  (function walk(d) { for (const n of fs.readdirSync(d)) { if (['node_modules', '.git', 'tests', 'functions', 'docs', 'qa-results', 'scripts'].includes(n)) continue; const f = path.join(d, n); if (n === 'logos' && d.endsWith('assets')) continue; fs.statSync(f).isDirectory() ? walk(f) : /\.(html|js|css)$/.test(n) && files.push(f); } })(ROOT);
  const hosts = new Set();
  for (const f of files) {
    const t = fs.readFileSync(f, 'utf8');
    expect(t, f).not.toMatch(/fonts\.(googleapis|gstatic)\.com|google-analytics|googletagmanager|gtag\(|fbq\(|facebook\.net|hotjar|clarity\.ms|segment\.(com|io)|mixpanel|doubleclick\.net/i);
    for (const m of t.matchAll(/<(?:script|link)[^>]+(?:src|href)=["'](https?:\/\/[^"']+)/gi)) { const u = new URL(m[1]); if (!/\.(png|jpe?g|svg|webp|ico)$/i.test(u.pathname) && !/schema\.org|w3\.org/.test(u.host)) hosts.add(u.host); }
    for (const m of t.matchAll(/from\s+['"](https?:\/\/[^'"]+)/g)) hosts.add(new URL(m[1]).host);
  }
  const allowed = ['www.gstatic.com', 'www.google.com'];
  const extra = Array.from(hosts).filter((h) => !allowed.includes(h));
  expect(extra, 'every external script host is listed in docs/THIRD-PARTY.md').toEqual([]);
  const doc = fs.readFileSync(path.join(ROOT, 'docs/THIRD-PARTY.md'), 'utf8');
  for (const h of hosts) expect(doc, h).toContain(h);
});

test('forms: the privacy tick-box is never pre-ticked, is required, and blocks submitting until ticked', async ({ page }) => {
  await open(page, 'index.html', null, { consent: true });
  for (const [trigger, form, box] of [['Book a service', '#book-form', '#book-consent'], ['Register product', '#register-form', '#reg-consent']]) {
    await page.locator('.service-card', { hasText: trigger }).first().click();
    const b = page.locator(box);
    await expect(b).toBeAttached();
    await expect(b).not.toBeChecked();
    expect(await b.getAttribute('required')).not.toBeNull();
    await expect(page.locator(form + ' .consent a[href$="privacy.html"]')).toHaveCount(1);
    await page.evaluate((f) => { window.__wrote = []; document.querySelector(f).addEventListener('submit', () => window.__wrote.push(1)); }, form);
    await page.evaluate((f) => document.querySelector(f).dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })), form);
    expect(await page.evaluate(() => window.__wrote.length), 'handlers must not run without consent').toBe(0);
    await expect(page.locator(form + ' .consent-error')).toContainText('Privacy Policy');
    await expect(page.locator(form + ' .consent'), 'consent shows on the last step only').toBeHidden();
    await page.keyboard.press('Escape');
  }
  const writes = await page.evaluate(() => (window.__writes || []).length);
  expect(writes).toBe(0);
});

test('dark patterns: no pre-ticked boxes, no urgency or guilt wording, no forced sign-in, optional fields stay optional', async () => {
  for (const f of ['index.html', 'portal.html', 'product.html', 'makwell/index.html', 'privacy.html', 'cookies.html']) {
    const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
    expect(/<input[^>]+type=["']checkbox["'][^>]*\schecked/i.test(t), f + ' has a pre-ticked box').toBe(false);
    expect(t, f).not.toMatch(/hurry|limited time|only \d+ left|act now|last chance|don'?t miss out|no thanks, i (don'?t|hate)|countdown/i);
  }
  const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const enquiry = idx.slice(idx.indexOf('id="service-modal-form"'), idx.indexOf('id="register-overlay"'));
  for (const name of ['dealerName', 'address', 'city', 'pincode', 'modelNo', 'serialNo', 'product']) {
    const m = enquiry.match(new RegExp('<input[^>]*name="' + name + '"[^>]*>'));
    expect(m, name).toBeTruthy(); expect(m[0], name + ' must not be required').not.toMatch(/\brequired\b/);
  }
});

test('keyboard: skip link works, tab order reaches nav and tiles, focus is always visible', async ({ page }) => {
  await open(page, 'index.html', null, { consent: true });
  await page.keyboard.press('Tab');
  await expect(page.locator('a.skip')).toBeFocused();
  await page.keyboard.press('Enter');
  const inMain = await page.evaluate(() => { const a = document.activeElement; return location.hash === '#main' || !!(a && a.closest && a.closest('main')); });
  expect(inMain).toBe(true);
  const seen = new Set(); let bad = [];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(260); // some cards fade their ring in over 0.2s
    const r = await page.evaluate(() => { const a = document.activeElement; if (!a || a === document.body) return null; const cs = getComputedStyle(a); const vis = parseFloat(cs.outlineWidth) > 0 && cs.outlineStyle !== 'none' || cs.boxShadow !== 'none'; return { id: (a.tagName + '.' + (a.className || '') + ' ' + (a.textContent || '').trim().slice(0, 24)), vis }; });
    if (!r) continue; seen.add(r.id); if (!r.vis) bad.push(r.id);
  }
  expect(seen.size).toBeGreaterThan(15);
  expect(bad, 'focused items with no visible focus indicator').toEqual([]);
});

test('pop-ups: dialog role and name, focus moves in, Tab stays inside, Esc closes, focus goes back', async ({ page }) => {
  await open(page, 'index.html', null, { consent: true });
  for (const [name, sel] of [['Track service', '#track-overlay'], ['Check warranty', '#warranty-overlay'], ['Register product', '#register-overlay'], ['Book a service', '#book-overlay']]) {
    const opener = page.locator('.service-card', { hasText: name }).first();
    await opener.focus(); await page.keyboard.press('Enter');
    const modal = page.locator(sel + ' .modal');
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute('role', 'dialog');
    await expect(modal).toHaveAttribute('aria-modal', 'true');
    const labelled = await modal.getAttribute('aria-labelledby');
    expect(labelled, name).toBeTruthy();
    expect((await page.locator('#' + labelled).innerText()).trim().length).toBeGreaterThan(2);
    await expect(page.locator(sel + ' .modal-close')).toHaveAttribute('aria-label', /close/i);
    expect(await page.evaluate((s) => document.querySelector(s + ' .modal').contains(document.activeElement), sel), 'focus inside').toBe(true);
    for (let i = 0; i < 25; i++) { await page.keyboard.press('Tab'); expect(await page.evaluate((s) => document.querySelector(s + ' .modal').contains(document.activeElement), sel), 'Tab #' + i).toBe(true); }
    for (let i = 0; i < 25; i++) { await page.keyboard.press('Shift+Tab'); expect(await page.evaluate((s) => document.querySelector(s + ' .modal').contains(document.activeElement), sel), 'Shift+Tab #' + i).toBe(true); }
    await page.keyboard.press('Escape');
    await expect(page.locator(sel)).toBeHidden();
    await expect(opener, name + ' focus returns').toBeFocused();
  }
});

test('forms: every field has a real label or name, and each label points at its field', async ({ page }) => {
  await open(page, 'index.html', null, { consent: true });
  for (const name of ['Book a service', 'Register product', 'Track service', 'Check warranty', 'Find service center']) {
    await page.locator('.service-card', { hasText: name }).first().click();
    const bad = await page.evaluate(() => {
      const ov = document.querySelector('.modal-overlay.show'); const out = [];
      ov.querySelectorAll('input:not([type=hidden]),select,textarea').forEach((c) => { const nm = (c.labels && c.labels.length) || c.getAttribute('aria-label') || c.getAttribute('aria-labelledby'); if (!nm) out.push(c.name || c.id || c.type); });
      return out;
    });
    expect(bad, name).toEqual([]);
    await page.keyboard.press('Escape');
  }
});

test('images: every image has alt text (decorative ones an empty alt), and informative ones are not empty', async ({ page }) => {
  for (const p of PUBLIC) {
    await open(page, p, null, { consent: true });
    const bad = await page.evaluate(() => Array.from(document.images).filter((i) => !i.hasAttribute('alt')).map((i) => i.getAttribute('src')));
    expect(bad, p + ' images with no alt attribute').toEqual([]);
    const linked = await page.evaluate(() => Array.from(document.querySelectorAll('a img, button img')).filter((i) => { const host = i.closest('a,button'); return i.getAttribute('alt') === '' && !(host.textContent || '').trim() && !host.getAttribute('aria-label'); }).map((i) => i.getAttribute('src')));
    expect(linked, p + ' linked images with no name').toEqual([]);
  }
});

test('contrast and WCAG 2.2 AA (axe): public pages, legal pages, banner and open pop-ups have no violations', async ({ page }) => {
  for (const p of PUBLIC) {
    await open(page, p, null, { consent: true });
    expect(await runAxe(page), p).toEqual([]);
  }
});

test('contrast and WCAG 2.2 AA (axe): the consent banner, its settings and every open pop-up', async ({ page }) => {
  await open(page, 'index.html');             // with the banner showing
  expect(await runAxe(page), 'banner').toEqual([]);
  await page.locator('.pe-cc [data-cc="choose"]').click();
  expect(await runAxe(page), 'cookie settings').toEqual([]);
  await page.keyboard.press('Escape'); await page.locator('.pe-cc [data-cc="accept"]').click();
  for (const name of ['Book a service', 'Register product', 'Track service', 'Check warranty', 'Find service center']) {
    await page.locator('.service-card', { hasText: name }).first().click();
    await page.waitForTimeout(500); // let the pop-up finish fading in
    expect(await runAxe(page), name).toEqual([]);
    await page.keyboard.press('Escape');
  }
});

test('contrast and WCAG 2.2 AA (axe): every CRM dashboard and the staff sign-in', async ({ page }) => {
  for (const role of ['superadmin', 'servicecenter', 'technician', 'warehouse', 'dealer', 'distributor', 'areamanager']) {
    await open(page, 'crm/CRM' + role + '.html', role);
    expect(await runAxe(page), role).toEqual([]);
  }
  await open(page, 'crm/login.html', null, { consent: true });
  expect(await runAxe(page), 'login').toEqual([]);
});
