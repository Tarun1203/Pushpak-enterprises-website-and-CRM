// Pushpak CRM — shared interface layer (UI phases 7-13). Presentation only:
// it never reads or writes data. It adds a greeting hero on each dashboard
// home, number count-up, a Ctrl/Cmd+K "jump to" palette built from the
// sidebar, a phone bottom bar for technicians and warehouse staff, page
// entrance motion, and accessibility fixes (keyboard menu, labels, dialogs,
// skip link). Every piece is optional: if something is missing it is skipped.
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function roleKey() {
    var t = (($('.sidebar-header .role') || {}).textContent || '').toLowerCase();
    if (/technician/.test(t)) return 'technician';
    if (/warehouse/.test(t)) return 'warehouse';
    if (/service center|service centre/.test(t)) return 'servicecenter';
    if (/super|head office|admin/.test(t)) return 'superadmin';
    if (/area/.test(t)) return 'areamanager';
    if (/distributor/.test(t)) return 'distributor';
    if (/dealer/.test(t)) return 'dealer';
    return 'other';
  }
  var HERO = {
    superadmin: { title: 'Command Center', sub: 'Everything across customers, service, stock and partners.' },
    servicecenter: { title: 'Service Center', sub: 'Today\'s jobs, technicians and spares at a glance.' },
    technician: { title: 'Your day', sub: 'Jobs, visits and spares for today.' },
    warehouse: { title: 'Warehouse & Operations', sub: 'Orders to pick, pack and dispatch.' },
    areamanager: { title: 'Area', sub: 'Your territory and partners.' },
    distributor: { title: 'Distributor', sub: 'Orders, stock and payments.' },
    dealer: { title: 'Dealer', sub: 'Orders, sales and stock.' },
    other: { title: 'Dashboard', sub: '' }
  };

  function greeting() {
    var h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }
  function firstName() {
    var e = (($('#user-email') || {}).textContent || '').trim();
    var n = e.split('@')[0].split(/[._\d-]+/)[0] || '';
    return n ? n.charAt(0).toUpperCase() + n.slice(1) : '';
  }

  /* ---------- Greeting hero ---------- */
  function isHome() {
    var t = (($('#page-title') || {}).textContent || '').trim().toLowerCase();
    return /^(dashboard|home|overview|command center)$/.test(t);
  }
  function navItems() { return $$('.sidebar .nav-item'); }
  function addHero() {
    var content = $('#content') || $('.content');
    if (!content || !isHome() || $('.ui-hero', content)) return;
    var rk = roleKey(), cfg = HERO[rk] || HERO.other;
    var name = firstName();
    var items = navItems().filter(function (n) { return !/dashboard|home|overview/i.test(n.textContent); }).slice(0, 2);
    var d = new Date();
    var hero = document.createElement('section');
    hero.className = 'ui-hero';
    hero.setAttribute('aria-label', cfg.title);
    hero.innerHTML =
      '<div><div class="hi">' + esc(greeting()) + (name ? ', ' + esc(name) : '') + '</div>' +
      '<div class="where">' + esc(cfg.title) + (cfg.sub ? ' &middot; ' + esc(cfg.sub) : '') + '</div>' +
      '<div class="actions"></div></div>' +
      '<div class="date"><b>' + esc(d.toLocaleDateString(undefined, { weekday: 'long' })) + '</b>' +
      esc(d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })) + '</div>';
    var act = $('.actions', hero);
    items.forEach(function (n) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = n.textContent.replace(/soon$/i, '').trim();
      b.addEventListener('click', function () { n.click(); });
      act.appendChild(b);
    });
    var j = document.createElement('button');
    j.type = 'button';
    j.innerHTML = 'Jump to&hellip;<kbd>Ctrl K</kbd>';
    j.addEventListener('click', openPalette);
    act.appendChild(j);
    content.insertBefore(hero, content.firstChild);
  }

  /* ---------- Count-up ---------- */
  function countUp() {
    if (reduce) return;
    $$('.stat-card .value').forEach(function (el) {
      if (el.dataset.uiCount) return;
      var txt = el.textContent.trim();
      if (!/^\d{1,7}$/.test(txt)) return;
      el.dataset.uiCount = '1';
      var to = parseInt(txt, 10);
      if (to < 2) return;
      var t0 = null;
      function step(ts) {
        if (t0 === null) t0 = ts;
        var p = Math.min(1, (ts - t0) / 600);
        el.textContent = String(Math.round(to * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(step); else el.textContent = String(to);
      }
      requestAnimationFrame(step);
    });
  }

  /* ---------- Entrance motion ---------- */
  var enterTimer;
  function enter(content) {
    if (reduce) return;
    content.classList.add('ui-enter');
    clearTimeout(enterTimer);
    enterTimer = setTimeout(function () { content.classList.remove('ui-enter'); }, 700);
  }

  /* ---------- Command palette ---------- */
  var cmd, cmdInput, cmdList, cmdPrev, cmdSel = 0, cmdRows = [];
  function buildPalette() {
    if (cmd) return;
    cmd = document.createElement('div');
    cmd.className = 'ui-cmd';
    cmd.setAttribute('role', 'dialog');
    cmd.setAttribute('aria-modal', 'true');
    cmd.setAttribute('aria-label', 'Jump to a screen');
    cmd.innerHTML = '<div class="ui-cmd-box"><input type="text" id="ui-cmd-input" placeholder="Jump to a screen…" aria-label="Jump to a screen" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="ui-cmd-list"><ul class="ui-cmd-list" id="ui-cmd-list" role="listbox"></ul></div>';
    document.body.appendChild(cmd);
    cmdInput = $('#ui-cmd-input', cmd);
    cmdList = $('#ui-cmd-list', cmd);
    cmd.addEventListener('mousedown', function (e) { if (e.target === cmd) closePalette(); });
    cmdInput.addEventListener('input', renderPalette);
    cmdInput.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); selectRow(cmdSel + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); selectRow(cmdSel - 1); }
      else if (e.key === 'Enter') { e.preventDefault(); pick(cmdSel); }
      else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
      else if (e.key === 'Tab') { e.preventDefault(); }
    });
  }
  function renderPalette() {
    var q = cmdInput.value.trim().toLowerCase();
    cmdRows = navItems().map(function (n) {
      var g = n.closest('.nav-group'), gl = g ? ($('.nav-group-label', g) || {}).textContent : '';
      return { el: n, label: n.textContent.replace(/soon$/i, '').trim(), group: gl || '' };
    }).filter(function (r) { return !q || (r.label + ' ' + r.group).toLowerCase().indexOf(q) !== -1; });
    cmdList.innerHTML = cmdRows.length ? cmdRows.map(function (r, i) {
      return '<li role="option" id="ui-cmd-' + i + '" data-i="' + i + '"><span>' + esc(r.label) + '</span><small>' + esc(r.group) + '</small></li>';
    }).join('') : '<div class="ui-cmd-empty">Nothing matches &ldquo;' + esc(cmdInput.value) + '&rdquo;</div>';
    $$('li', cmdList).forEach(function (li) { li.addEventListener('click', function () { pick(+li.dataset.i); }); });
    selectRow(0);
  }
  function selectRow(i) {
    if (!cmdRows.length) return;
    cmdSel = (i + cmdRows.length) % cmdRows.length;
    $$('li', cmdList).forEach(function (li, k) {
      li.setAttribute('aria-selected', k === cmdSel ? 'true' : 'false');
      if (k === cmdSel) { cmdInput.setAttribute('aria-activedescendant', li.id); li.scrollIntoView({ block: 'nearest' }); }
    });
  }
  function pick(i) {
    var r = cmdRows[i];
    closePalette();
    if (r && r.el) r.el.click();
  }
  function openPalette() {
    buildPalette();
    cmdPrev = document.activeElement;
    cmd.classList.add('show');
    cmdInput.value = '';
    renderPalette();
    cmdInput.focus();
  }
  function closePalette() {
    if (!cmd) return;
    cmd.classList.remove('show');
    if (cmdPrev && cmdPrev.focus) try { cmdPrev.focus(); } catch (e) { /* ignore */ }
  }
  document.addEventListener('keydown', function (e) {
    var typing = /^(input|textarea|select)$/i.test((e.target.tagName || ''));
    if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); (cmd && cmd.classList.contains('show')) ? closePalette() : openPalette(); }
    else if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey) { e.preventDefault(); openPalette(); }
  });

  /* ---------- Phone bottom bar ---------- */
  var ICONS = {
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    box: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/>',
    truck: '<path d="M1 6h13v10H1zM14 10h5l3 3v3h-8z"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    wallet: '<rect x="2" y="6" width="20" height="14" rx="2"/><path d="M16 13h2M2 10h20"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
    more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>'
  };
  function iconFor(label) {
    var l = label.toLowerCase();
    if (/dashboard|home|overview/.test(l)) return 'home';
    if (/job|order|request|ticket|task/.test(l)) return 'list';
    if (/schedule|calendar|availab|appoint/.test(l)) return 'cal';
    if (/spare|stock|inventor|bag|product|part|receiv|putaway|count/.test(l)) return 'box';
    if (/dispatch|ship|deliver|transit|logistic|pick|pack/.test(l)) return 'truck';
    if (/earning|claim|finance|payment|invoice|bill/.test(l)) return 'wallet';
    if (/profile|account|user/.test(l)) return 'user';
    return 'list';
  }
  var PREF = { technician: [/dashboard|home/i, /jobs/i, /schedule/i, /spare/i], warehouse: [/dashboard|home|overview/i, /order|pick|dispatch/i, /stock|inventor/i, /receiv|return|transfer|request/i] };
  var bottom;
  function buildBottom() {
    var rk = roleKey();
    if (!PREF[rk]) return;
    var items = navItems();
    if (!items.length) return;
    document.body.setAttribute('data-ui-bottom', rk);
    if (!bottom) {
      bottom = document.createElement('nav');
      bottom.className = 'ui-bottom';
      bottom.setAttribute('aria-label', 'Main');
      document.body.appendChild(bottom);
    }
    var chosen = [];
    PREF[rk].forEach(function (re) {
      var m = items.filter(function (n) { return re.test(n.textContent) && chosen.indexOf(n) === -1; })[0];
      if (m) chosen.push(m);
    });
    items.forEach(function (n) { if (chosen.length < 4 && chosen.indexOf(n) === -1) chosen.push(n); });
    chosen = chosen.slice(0, 4);
    bottom.innerHTML = '';
    chosen.forEach(function (n) {
      var label = n.textContent.replace(/soon$/i, '').trim();
      var short = /^(dashboard|overview)$/i.test(label) ? 'Home' : label;
      var b = document.createElement('button');
      b.type = 'button';
      b.dataset.id = n.dataset.id || '';
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[iconFor(label)] + '</svg><span>' + esc(short) + '</span>';
      b.setAttribute('aria-label', label);
      b.addEventListener('click', function () { n.click(); });
      b._nav = n;
      bottom.appendChild(b);
    });
    var more = document.createElement('button');
    more.type = 'button';
    more.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS.more + '</svg><span>More</span>';
    more.addEventListener('click', function () { var m = $('.crm-menu-btn'); if (m) m.click(); });
    bottom.appendChild(more);
    syncBottom();
  }
  function syncBottom() {
    if (!bottom) return;
    $$('button', bottom).forEach(function (b) {
      if (!b._nav) return;
      if (b._nav.classList.contains('active')) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
  }

  /* ---------- Accessibility ---------- */
  function a11yNav() {
    navItems().forEach(function (n) {
      if (n.dataset.uiA11y) { if (n.classList.contains('active')) n.setAttribute('aria-current', 'page'); else n.removeAttribute('aria-current'); return; }
      n.dataset.uiA11y = '1';
      n.setAttribute('role', 'button');
      n.tabIndex = 0;
      n.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); n.click(); } });
      if (n.classList.contains('active')) n.setAttribute('aria-current', 'page');
    });
  }
  function a11yMisc() {
    var bell = $('.notif-bell');
    if (bell && !bell.getAttribute('aria-label')) bell.setAttribute('aria-label', 'Notifications');
    var lo = $('.logout-btn'); if (lo && !lo.getAttribute('aria-label')) lo.setAttribute('aria-label', 'Sign out');
    $$('.modal-overlay').forEach(function (o) {
      var m = $('.modal', o);
      if (m && !m.getAttribute('role')) { m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); var h = $('h3', m); if (h) { if (!h.id) h.id = 'ui-h-' + Math.random().toString(36).slice(2, 8); m.setAttribute('aria-labelledby', h.id); } }
    });
    // Connect each label to the field that follows it.
    $$('.form-row').forEach(function (r) {
      var l = $('label', r), f = $('input,select,textarea', r);
      if (l && f && !l.getAttribute('for') && f.id) l.setAttribute('for', f.id);
    });
    var c = $('.content');
    if (c) { if (!c.id) c.id = 'content'; c.setAttribute('tabindex', '-1'); c.setAttribute('role', 'main'); }
    var main = $('.main'); if (main && !main.getAttribute('role')) main.setAttribute('aria-live', 'off');
    if (!$('.ui-skip') && c) {
      var s = document.createElement('a');
      s.className = 'ui-skip'; s.href = '#' + c.id; s.textContent = 'Skip to content';
      s.addEventListener('click', function (e) { e.preventDefault(); c.focus(); });
      document.body.insertBefore(s, document.body.firstChild);
    }
  }
  // Escape closes the open dialog and focus returns to what opened it.
  var lastFocus = null;
  document.addEventListener('focusin', function (e) { if (!e.target.closest || !e.target.closest('.modal-overlay')) lastFocus = e.target; });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (cmd && cmd.classList.contains('show')) return;
    var open = $$('.modal-overlay.show');
    if (!open.length) return;
    open[open.length - 1].classList.remove('show');
    if (lastFocus && document.contains(lastFocus)) try { lastFocus.focus(); } catch (er) { /* ignore */ }
  });
  var overlayObs;
  function watchOverlays() {
    if (overlayObs) return;
    overlayObs = new MutationObserver(function (list) {
      list.forEach(function (m) {
        var o = m.target;
        if (o.classList && o.classList.contains('modal-overlay') && o.classList.contains('show')) {
          var f = $('input:not([type=hidden]):not([disabled]),select,textarea,button', $('.modal', o) || o);
          if (f) setTimeout(function () { try { f.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 30);
        }
      });
    });
    $$('.modal-overlay').forEach(function (o) { overlayObs.observe(o, { attributes: true, attributeFilter: ['class'] }); });
  }

  /* ---------- Wiring ---------- */
  var scheduled = false;
  function refresh() {
    scheduled = false;
    a11yNav(); a11yMisc(); addHero(); countUp(); syncBottom();
    if (!bottom && navItems().length) buildBottom();
  }
  function schedule() { if (!scheduled) { scheduled = true; requestAnimationFrame(refresh); } }

  function init() {
    var app = $('#app');
    if (!app) return;
    watchOverlays();
    var content = $('#content') || $('.content');
    if (content) new MutationObserver(function () { schedule(); }).observe(content, { childList: true });
    var title = $('#page-title');
    if (title) new MutationObserver(function () { if (content) enter(content); schedule(); }).observe(title, { childList: true, characterData: true, subtree: true });
    var sb = $('.sidebar');
    if (sb) new MutationObserver(function () { schedule(); }).observe(sb, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    var userEl = $('#user-email');
    if (userEl) new MutationObserver(function () {
      var h = $('.ui-hero .hi'); if (h) { h.textContent = greeting() + (firstName() ? ', ' + firstName() : ''); }
    }).observe(userEl, { childList: true, characterData: true, subtree: true });
    schedule();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());
