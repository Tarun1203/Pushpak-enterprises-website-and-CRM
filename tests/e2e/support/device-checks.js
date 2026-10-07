// Layout checks shared by the mobile and responsive suites.
const { installFirebaseStub } = require('./firebase-stub');

// Page load with Firebase stubbed (signed in as `role`, or signed out) and
// every other outside request blocked, so results don't depend on the network.
async function openPage(page, origin, pathname, role) {
  await installFirebaseStub(page, role ? { role } : {});
  await page.route(/^https?:\/\//, (route) => {
    const u = route.request().url();
    if (u.startsWith(origin) || /gstatic\.com\/firebasejs/.test(u)) return route.fallback();
    return route.abort();
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(origin + '/' + pathname, { waitUntil: 'load' });
  if (role) await page.waitForFunction(() => { const a = document.getElementById('app'); return a && getComputedStyle(a).display !== 'none'; }, null, { timeout: 10000 });
  await page.waitForTimeout(400);
  return errors;
}

// Elements sticking out past the right edge (ignoring off-screen menus and
// anything inside a box that scrolls sideways on its own).
async function layoutReport(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const scrollsX = (el) => { for (let n = el.parentElement; n; n = n.parentElement) { const o = getComputedStyle(n).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') return true; } return false; };
    const offscreen = (el) => { for (let n = el; n; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.position === 'fixed' && cs.transform !== 'none') return true; if (cs.display === 'none' || cs.visibility === 'hidden') return true; } return false; };
    const overflowing = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || r.right <= vw + 1) continue;
      if (scrollsX(el) || offscreen(el)) continue;
      overflowing.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''} (right edge ${Math.round(r.right)}px)`);
      if (overflowing.length >= 5) break;
    }
    const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
    const smallText = [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]), select, textarea')]
      .filter(visible).filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
      .map((el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''} (${getComputedStyle(el).fontSize})`);
    const meta = document.querySelector('meta[name=viewport]');
    return {
      viewport: vw, scrollWidth: document.documentElement.scrollWidth, overflowing, smallText,
      viewportMeta: meta ? meta.getAttribute('content') : ''
    };
  });
}

// Visible buttons/links that are too small to tap reliably.
async function smallTapTargets(page, selector, min = 40) {
  return page.$$eval(selector, (els, m) => els.filter((el) => {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && (r.height < m || r.width < m);
  }).map((el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}" ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`), min);
}

module.exports = { openPage, layoutReport, smallTapTargets };
