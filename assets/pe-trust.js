/* Pushpak Enterprises — privacy, consent and accessibility helpers.
 *  1. Cookie / storage consent banner + settings (no optional cookies are in use today;
 *     any added later must call PE_CONSENT.allows('analytics'|'preferences') first).
 *  2. Footer links to Privacy, Terms, Cookies, and "Cookie settings".
 *  3. Consent tick-box enforcement on forms (never pre-ticked).
 *  4. Pop-up behaviour: dialog role, name, focus in, Tab kept inside, Esc closes, focus returns.
 *  5. Form labels linked to their fields; error/success messages announced.
 * Data stored by this script: one localStorage item "pe.consent" (choice + date, 12 months). */
(function () {
  'use strict';
  var KEY = 'pe.consent', VERSION = 1, MONTHS = 12;
  var script = document.currentScript;
  var BANNER = !(script && script.getAttribute('data-banner') === 'off');
  var ROOT = (script && script.src ? script.src : '').replace(/assets\/pe-trust\.js.*$/, '') || '';
  var FORCE = /[?&]cookiesettings=1/.test(location.search);
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(tag, attrs, html) { var e = document.createElement(tag); Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); }); if (html != null) e.innerHTML = html; return e; }

  /* ---------- 1. consent store ---------- */
  var listeners = [];
  function read() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!v || v.v !== VERSION || !v.at) return null;
      var age = Date.now() - new Date(v.at).getTime();
      if (!(age >= 0) || age > MONTHS * 30.5 * 86400000) return null;
      return v;
    } catch (e) { return null; }
  }
  var memory = null; // used when storage is blocked
  function write(c) {
    var v = { v: VERSION, essential: true, analytics: !!c.analytics, preferences: !!c.preferences, at: new Date().toISOString() };
    memory = v;
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* choice lasts for this visit only */ }
    listeners.forEach(function (f) { try { f(v); } catch (e) { /* ignore */ } });
    return v;
  }
  function current() { return read() || memory; }
  window.PE_CONSENT = {
    get: current,
    allows: function (cat) { if (cat === 'essential') return true; var c = current(); return !!(c && c[cat]); },
    onChange: function (f) { listeners.push(f); },
    open: function () { openSettings(); }
  };

  /* ---------- banner + settings ---------- */
  var banner = null, lastFocus = null;
  function closeBanner() { if (banner) { banner.remove(); banner = null; document.body.style.paddingBottom = prevPad; } }
  var prevPad = '';
  function padFor() { if (banner) document.body.style.paddingBottom = Math.ceil(window.innerHeight - banner.getBoundingClientRect().top + 16) + 'px'; }
  function showBanner() {
    if (!BANNER || banner || current()) return;
    var base = ROOT;
    banner = el('div', { class: 'pe-cc', role: 'region', 'aria-labelledby': 'pe-cc-h' });
    banner.innerHTML = '<h2 id="pe-cc-h">Your privacy choices</h2>' +
      '<p>We use only the browser storage this site needs to work (for example to keep you signed in). We do not run advertising or tracking. Choose how to treat any optional storage we may add in future. <a href="' + base + 'cookies.html">Cookie Policy</a> &middot; <a href="' + base + 'privacy.html">Privacy Policy</a></p>' +
      '<div class="pe-cc-actions"><button type="button" class="pe-cc-btn" data-cc="reject">Reject optional</button><button type="button" class="pe-cc-btn" data-cc="choose">Choose</button><button type="button" class="pe-cc-btn" data-cc="accept">Accept all</button></div>';
    banner.addEventListener('click', function (e) {
      var b = e.target.closest('[data-cc]'); if (!b) return;
      var a = b.getAttribute('data-cc');
      if (a === 'choose') return openSettings();
      write({ analytics: a === 'accept', preferences: a === 'accept' }); closeBanner();
    });
    prevPad = document.body.style.paddingBottom;
    document.body.appendChild(banner);
    padFor(); window.addEventListener('resize', padFor);
  }
  function openSettings() {
    if ($('.pe-cc-panel')) return;
    lastFocus = document.activeElement;
    var c = current() || {};
    var panel = el('div', { class: 'pe-cc-panel' });
    var base = ROOT;
    panel.innerHTML = '<div class="pe-cc-dialog" role="dialog" aria-modal="true" aria-labelledby="pe-cc-t" aria-describedby="pe-cc-d"><h2 id="pe-cc-t">Cookie settings</h2><p id="pe-cc-d">You can change this at any time from "Cookie settings" in the footer. <a href="' + base + 'cookies.html">Read the Cookie Policy</a>.</p>' +
      '<div class="pe-cc-row"><div><label for="pe-cc-e">Essential</label><span>Needed to sign in and keep the site secure. Always on.</span></div><input type="checkbox" id="pe-cc-e" checked disabled></div>' +
      '<div class="pe-cc-row"><div><label for="pe-cc-a">Analytics</label><span>Not in use today. If we add it, it stays off unless you allow it.</span></div><input type="checkbox" id="pe-cc-a"' + (c.analytics ? ' checked' : '') + '></div>' +
      '<div class="pe-cc-row"><div><label for="pe-cc-p">Preferences</label><span>Not in use today. For remembering optional settings, if added.</span></div><input type="checkbox" id="pe-cc-p"' + (c.preferences ? ' checked' : '') + '></div>' +
      '<div class="pe-cc-actions"><button type="button" class="pe-cc-btn" data-p="reject">Reject optional</button><button type="button" class="pe-cc-btn" data-p="save">Save my choices</button><button type="button" class="pe-cc-btn" data-p="accept">Accept all</button></div></div>';
    function close() { panel.remove(); if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus(); }
    panel.addEventListener('click', function (e) {
      if (e.target === panel) return close();
      var b = e.target.closest('[data-p]'); if (!b) return;
      var a = b.getAttribute('data-p');
      write({ analytics: a === 'accept' || (a === 'save' && $('#pe-cc-a', panel).checked), preferences: a === 'accept' || (a === 'save' && $('#pe-cc-p', panel).checked) });
      closeBanner(); close();
    });
    panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } else trap(e, $('.pe-cc-dialog', panel)); });
    document.body.appendChild(panel);
    $('#pe-cc-a', panel).focus();
  }

  /* ---------- 2. footer links ---------- */
  function footerLinks() {
    $$('[data-cookie-settings]').forEach(function (b) { if (!b._pe) { b._pe = 1; b.addEventListener('click', openSettings); } });
    if ($('footer a[href$="privacy.html"], .pe-legal-bar, [data-legal-links]')) return;
    var host = $('footer .foot-links') || $('footer .footer-inner') || $('footer');
    var html = '<a href="' + ROOT + 'privacy.html">Privacy</a><a href="' + ROOT + 'terms.html">Terms</a><a href="' + ROOT + 'cookies.html">Cookies</a><button type="button" class="linklike" data-cookie-settings>Cookie settings</button>';
    if (host) {
      var wrap = host.classList && host.classList.contains('foot-links') ? host : el('span', { class: 'foot-links' });
      wrap.insertAdjacentHTML('beforeend', html); if (wrap !== host) host.appendChild(wrap);
    } else {
      var bar = el('nav', { class: 'pe-legal-bar', 'aria-label': 'Legal' }, html.replace(/class="linklike"/, ''));
      document.body.appendChild(bar);
    }
    $$('[data-cookie-settings]').forEach(function (b) { if (!b._pe) { b._pe = 1; b.addEventListener('click', openSettings); } });
  }

  /* ---------- 3. consent tick-box enforcement ---------- */
  document.addEventListener('submit', function (e) {
    var f = e.target, box = f && f.querySelector && f.querySelector('.consent input[type=checkbox]');
    if (!box || box.checked) return;
    e.preventDefault(); e.stopImmediatePropagation();
    var msg = box.closest('.consent').nextElementSibling;
    if (!msg || !msg.classList.contains('consent-error')) { msg = el('div', { class: 'consent-error', role: 'alert' }); box.closest('.consent').insertAdjacentElement('afterend', msg); }
    msg.textContent = 'Please tick the box to agree to the Privacy Policy before submitting.';
    box.setAttribute('aria-invalid', 'true'); box.focus();
  }, true);
  document.addEventListener('change', function (e) {
    var b = e.target; if (b && b.closest && b.closest('.consent') && b.checked) {
      b.removeAttribute('aria-invalid');
      var m = b.closest('.consent').nextElementSibling; if (m && m.classList.contains('consent-error')) m.remove();
    }
  });

  /* ---------- 4. pop-ups ---------- */
  var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  function visible(n) { return !!(n.offsetWidth || n.offsetHeight || n.getClientRects().length); }
  function trap(e, box) {
    if (e.key !== 'Tab' || !box) return;
    var f = $$(FOCUSABLE, box).filter(visible);
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || !box.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !box.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
  }
  var uid = 0;
  function describeDialog(ov) {
    var m = $('.modal', ov) || ov;
    if (!m.getAttribute('role')) m.setAttribute('role', 'dialog');
    m.setAttribute('aria-modal', 'true');
    if (!m.getAttribute('aria-label') && !m.getAttribute('aria-labelledby')) {
      var h = $('h1,h2,h3', m);
      if (h) { if (!h.id) h.id = 'pe-dlg-h' + (++uid); m.setAttribute('aria-labelledby', h.id); }
    }
    $$('.modal-close,button.close,[data-close]', m).forEach(function (b) { if (!b.getAttribute('aria-label') && !/[a-z]{3}/i.test(b.textContent)) b.setAttribute('aria-label', 'Close'); });
    return m;
  }
  var openers = new WeakMap(), lastOutside = null;
  document.addEventListener('focusin', function (e) { if (!e.target.closest || !e.target.closest('.modal-overlay.show,.pe-cc-panel')) lastOutside = e.target; }, true);
  document.addEventListener('click', function (e) { var t = e.target.closest && e.target.closest('a,button,[tabindex]'); if (t && !t.closest('.modal-overlay.show,.pe-cc-panel')) lastOutside = t; }, true);
  function onOverlay(ov) {
    var shown = ov.classList.contains('show') || ov.classList.contains('open') || getComputedStyle(ov).display !== 'none' && ov.offsetWidth > 0;
    if (shown && !ov._peOpen) {
      ov._peOpen = true;
      openers.set(ov, lastOutside || document.activeElement);
      var m = describeDialog(ov);
      setTimeout(function () {
        if (m.contains(document.activeElement) && document.activeElement !== m) return;
        var f = $$(FOCUSABLE, m).filter(visible);
        var target = f.filter(function (n) { return !n.matches('.modal-close,[data-close]'); })[0] || f[0];
        if (!m.hasAttribute('tabindex')) m.setAttribute('tabindex', '-1');
        (target || m).focus();
      }, 30);
    } else if (!shown && ov._peOpen) {
      ov._peOpen = false;
      var o = openers.get(ov);
      if (o && o.focus && document.contains(o) && !$('.modal-overlay.show')) { try { o.focus(); } catch (e) { /* ignore */ } }
    }
  }
  document.addEventListener('keydown', function (e) {
    var ov = $$('.modal-overlay.show').filter(function (o) { return !o.classList.contains('ui-dialog'); }).pop();
    if (!ov) return;
    var m = $('.modal', ov) || ov;
    if (e.key === 'Escape' && !e.defaultPrevented) {
      var c = $('.modal-close,[data-close],button.close', m) || $$('button', m).filter(function (b) { return /^(close|cancel|×|✕|x)$/i.test(b.textContent.trim()); })[0];
      if (c) { e.preventDefault(); c.click(); }
    } else trap(e, m);
  });

  /* ---------- 5. labels + announcements ---------- */
  var lid = 0;
  function labels() {
    $$('label:not([for])').forEach(function (l) {
      if (l.querySelector('input,select,textarea')) return; // wrapped
      var c = null, n = l.nextElementSibling;
      if (n && /^(INPUT|SELECT|TEXTAREA)$/.test(n.tagName)) c = n;
      else if (n) c = n.querySelector('input,select,textarea');
      if (!c && l.parentElement) c = l.parentElement.querySelector('input:not([type=hidden]),select,textarea');
      if (!c || (c.labels && c.labels.length)) return;
      if (!c.id) c.id = 'pe-f' + (++lid);
      l.setAttribute('for', c.id);
    });
    $$('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]),select,textarea').forEach(function (c) {
      if ((c.labels && c.labels.length) || c.getAttribute('aria-label') || c.getAttribute('aria-labelledby')) return;
      var t = c.getAttribute('placeholder') || c.getAttribute('title') || c.getAttribute('data-sum') || (c.tagName === 'SELECT' && c.options.length ? c.options[0].textContent : '');
      if (t) c.setAttribute('aria-label', t.replace(/\s*\(.*$/, '').trim() || t);
    });
    $$('.field-error,.modal-error,.error,.msg.err').forEach(function (m) { if (!m.getAttribute('role') && !m.getAttribute('aria-live')) m.setAttribute('role', 'alert'); });
    $$('.modal-success,.ticket-note').forEach(function (m) { if (!m.getAttribute('role') && !m.getAttribute('aria-live')) m.setAttribute('aria-live', 'polite'); });
  }

  /* ---------- wiring ---------- */
  var obs;
  function sweep() { $$('.modal-overlay').forEach(onOverlay); labels(); }
  function start() {
    footerLinks(); showBanner(); sweep();
    if (FORCE) openSettings();
    var t; obs = new MutationObserver(function () { clearTimeout(t); t = setTimeout(sweep, 80); });
    obs.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'], subtree: true, childList: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
