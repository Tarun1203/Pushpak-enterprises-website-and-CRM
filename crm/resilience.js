/* Keeps the CRM usable when things go wrong (UMD: browser global PEResilience).
 *  - any uncaught error or failed promise shows a plain message instead of a
 *    silent failure, and is logged once with the tag [PE-ERR]
 *  - an offline / back-online banner
 *  - a double-tap guard so a slow connection cannot submit a form twice
 *  - retry(fn) with back-off for temporary network trouble
 *  - shows the release in the sidebar so support can tell which build is live */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(null);
  else root.PEResilience = factory(root);
})(typeof self !== 'undefined' ? self : this, function (win) {
  'use strict';

  var TRANSIENT = /unavailable|deadline|network|timeout|timed out|failed to fetch|offline|resource-exhausted|aborted|internal/i;
  function isTransient(err) {
    var s = (err && (err.code || '')) + ' ' + (err && err.message || err || '');
    return TRANSIENT.test(s);
  }
  function friendly(err, offline) {
    if (offline) return "You're offline. Check your internet connection. Nothing is saved until it is back.";
    var s = (err && (err.code || '')) + ' ' + (err && err.message || err || '');
    if (/permission-denied|insufficient permissions/i.test(s)) return "You don't have permission to do that. If this looks wrong, sign out, sign in again and contact Head Office.";
    if (/unauthenticated|auth\/|expired/i.test(s)) return 'Your session has ended. Please sign in again.';
    if (isTransient(err)) return 'The connection is slow or interrupted. Wait a moment and try again. Check the list before repeating, in case it did save.';
    return 'Something went wrong. Your last action may not have saved. Refresh the page and check before trying again.';
  }
  // Runs fn(); on a temporary failure waits and tries again (default 3 tries).
  function retry(fn, opts) {
    opts = opts || {};
    var tries = opts.tries || 3, base = opts.baseMs === undefined ? 400 : opts.baseMs, n = 0;
    function go() {
      n++;
      return Promise.resolve().then(fn).catch(function (e) {
        if (n >= tries || !isTransient(e)) throw e;
        return new Promise(function (r) { setTimeout(r, base * Math.pow(2, n - 1)); }).then(go);
      });
    }
    return go();
  }
  // Pure: should this click be swallowed as a double tap?
  function isDoubleTap(lastMs, nowMs, windowMs) { return typeof lastMs === 'number' && nowMs - lastMs < (windowMs || 800); }

  if (!win || !win.document) return { isTransient: isTransient, friendly: friendly, retry: retry, isDoubleTap: isDoubleTap };

  var doc = win.document, bar = null, hideT = null, lastShown = 0, shown = {};
  function ensureBar() {
    if (bar && bar.isConnected) return bar;
    bar = doc.createElement('div');
    bar.id = 'pe-notice'; bar.setAttribute('role', 'alert'); bar.setAttribute('aria-live', 'assertive');
    bar.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:2147483000;padding:10px 40px 10px 14px;font:14px/1.4 Arial,sans-serif;color:#fff;background:#b3261e;box-shadow:0 2px 8px rgba(0,0,0,.3);display:none;max-width:100%;box-sizing:border-box;';
    var x = doc.createElement('button');
    x.type = 'button'; x.setAttribute('aria-label', 'Dismiss'); x.textContent = '×';
    x.style.cssText = 'position:absolute;right:6px;top:4px;background:none;border:0;color:#fff;font-size:22px;line-height:1;cursor:pointer;min-width:32px;min-height:32px;';
    x.addEventListener('click', function () { bar.style.display = 'none'; });
    var t = doc.createElement('span'); t.id = 'pe-notice-text';
    bar.appendChild(t); bar.appendChild(x);
    (doc.body || doc.documentElement).appendChild(bar);
    return bar;
  }
  function notice(msg, kind, autoHideMs) {
    var b = ensureBar();
    b.style.background = kind === 'ok' ? '#1b6e3a' : kind === 'warn' ? '#8a5a00' : '#b3261e';
    b.firstChild.textContent = msg; b.style.display = 'block';
    clearTimeout(hideT);
    if (autoHideMs) hideT = setTimeout(function () { b.style.display = 'none'; }, autoHideMs);
  }
  function report(err, where) {
    var key = String((err && (err.code || err.message)) || err).slice(0, 80);
    var now = Date.now();
    try { console.warn('[PE-ERR]', where, err); } catch (e) { /* ignore */ }
    if (shown[key] && now - shown[key] < 10000) return; // same problem: say it once
    shown[key] = now; lastShown = now;
    notice(friendly(err, win.navigator && win.navigator.onLine === false), 'err', 15000);
  }
  var IGNORE = /ResizeObserver loop|Script error\.?$|Non-Error promise rejection/i;
  win.addEventListener('error', function (e) {
    if (!e || IGNORE.test(e.message || '')) return;
    if (e.target && e.target !== win && e.target.tagName) return; // a missing image or stylesheet is not an app error
    report(e.error || e.message, 'error');
  });
  win.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    if (r && IGNORE.test(r.message || String(r))) return;
    report(r, 'promise');
  });
  win.addEventListener('offline', function () { notice(friendly(null, true), 'warn'); });
  win.addEventListener('online', function () { notice('Back online. You can continue.', 'ok', 3000); });
  doc.addEventListener('DOMContentLoaded', function () {
    if (win.navigator && win.navigator.onLine === false) notice(friendly(null, true), 'warn');
    var r = win.PE_RELEASE;
    var side = doc.querySelector('.sidebar');
    if (r && side && !doc.getElementById('pe-release')) {
      var d = doc.createElement('div');
      d.id = 'pe-release'; d.textContent = 'v' + r.version + (r.build && r.build !== 'dev' ? ' (' + r.build + ')' : '');
      d.style.cssText = 'padding:8px 14px;font-size:11px;opacity:.6;';
      side.appendChild(d);
    }
  });
  // Double-tap guard: the second tap on a primary action within 0.8 s is ignored.
  doc.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('button.btn-primary, button.btn-danger, button[type="submit"]');
    if (!b) return;
    var now = Date.now();
    if (isDoubleTap(b.__peLast, now)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    b.__peLast = now;
  }, true);

  return { isTransient: isTransient, friendly: friendly, retry: retry, isDoubleTap: isDoubleTap, notice: notice, report: report };
});
