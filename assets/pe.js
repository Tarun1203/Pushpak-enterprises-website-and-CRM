/* Pushpak Enterprises - public site behaviour (UI phases 1-5).
   Header shadow on scroll, reveal-on-scroll, hero rotation, mobile tab bar,
   and the step-by-step form helper. Nothing here touches Firebase. */
(function () {
  'use strict';
  var doc = document;
  doc.documentElement.classList.remove('no-js');

  function ready(fn) { if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', fn); else fn(); }

  ready(function () {
    // header gets a hairline + shadow once the page scrolls
    var header = doc.querySelector('header');
    function onScroll() { if (header) header.classList.toggle('scrolled', window.scrollY > 8); }
    onScroll(); window.addEventListener('scroll', onScroll, { passive: true });

    // reveal-on-scroll (falls back to visible when IntersectionObserver is missing)
    var items = doc.querySelectorAll('.rv');
    if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
      }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
      items.forEach(function (el) { io.observe(el); });
    } else { items.forEach(function (el) { el.classList.add('in'); }); }

    // hero product rotation (only when the page has hero images)
    var imgs = doc.querySelectorAll('.hero-product-img'), dots = doc.querySelectorAll('.hero-dots i');
    if (imgs.length > 1) {
      var cur = 0;
      var show = function (n) {
        imgs[cur].classList.remove('active'); if (dots[cur]) dots[cur].classList.remove('on');
        cur = n; imgs[cur].classList.add('active'); if (dots[cur]) dots[cur].classList.add('on');
      };
      if (dots[0]) dots[0].classList.add('on');
      setInterval(function () { if (!doc.hidden) show((cur + 1) % imgs.length); }, 4500);
      dots.forEach(function (d, i) { d.addEventListener('click', function () { show(i); }); });
    }

    // mobile tab bar: mark the section in view
    var tabs = doc.querySelectorAll('.tabbar a[data-sec]');
    if (tabs.length && 'IntersectionObserver' in window) {
      var map = {};
      tabs.forEach(function (a) { var s = doc.getElementById(a.dataset.sec); if (s) map[a.dataset.sec] = a; });
      var so = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (!e.isIntersecting) return;
          tabs.forEach(function (a) { a.classList.remove('on'); });
          if (map[e.target.id]) map[e.target.id].classList.add('on');
        });
      }, { rootMargin: '-45% 0px -50% 0px' });
      Object.keys(map).forEach(function (id) { so.observe(doc.getElementById(id)); });
    }

    doc.querySelectorAll('form[data-wizard]').forEach(wizard);
  });

  // Step-by-step form. Children of the form marked .wiz-step (with data-label)
  // become pages; a progress bar and Back / Next are added; the form's own
  // submit button is shown only on the last page. Field ids and names are
  // untouched, so the page's existing submit code keeps working.
  function wizard(form) {
    var steps = Array.prototype.slice.call(form.querySelectorAll(':scope > .wiz-step'));
    if (steps.length < 2) return;
    var submit = form.querySelector(':scope > button[type="submit"]');
    var bar = doc.createElement('ol'); bar.className = 'wiz-progress'; bar.setAttribute('aria-label', 'Progress');
    steps.forEach(function (s, i) {
      var li = doc.createElement('li'); li.dataset.n = String(i + 1); li.textContent = s.dataset.label || ('Step ' + (i + 1)); bar.appendChild(li);
    });
    form.insertBefore(bar, form.firstChild);
    var nav = doc.createElement('div'); nav.className = 'wiz-nav';
    var back = doc.createElement('button'); back.type = 'button'; back.className = 'btn btn-secondary'; back.textContent = 'Back';
    var next = doc.createElement('button'); next.type = 'button'; next.className = 'btn btn-primary'; next.textContent = 'Continue';
    nav.appendChild(back); nav.appendChild(next);
    if (submit) form.insertBefore(nav, submit); else form.appendChild(nav);
    var i = 0;
    function summary() {
      var box = form.querySelector('.wiz-summary'); if (!box) return;
      box.innerHTML = '';
      form.querySelectorAll('[data-sum]').forEach(function (f) {
        var v = f.tagName === 'SELECT' ? (f.options[f.selectedIndex] ? f.options[f.selectedIndex].text : '') : f.value;
        if (!v || /^select/i.test(v)) return;
        var row = doc.createElement('div'), a = doc.createElement('span'), b = doc.createElement('b');
        a.textContent = f.dataset.sum; b.textContent = v; row.appendChild(a); row.appendChild(b); box.appendChild(row);
      });
    }
    function go(n) {
      i = Math.max(0, Math.min(steps.length - 1, n));
      steps.forEach(function (s, k) { s.classList.toggle('cur', k === i); });
      bar.querySelectorAll('li').forEach(function (li, k) { li.classList.toggle('done', k < i); li.classList.toggle('cur', k === i); });
      back.style.visibility = i === 0 ? 'hidden' : 'visible';
      var last = i === steps.length - 1;
      next.style.display = last ? 'none' : '';
      if (submit) submit.style.display = last ? '' : 'none';
      if (last) summary();
      var first = steps[i].querySelector('input:not([type=hidden]):not([disabled]),select,textarea');
      if (first && first.offsetParent !== null && doc.activeElement && !form.contains(doc.activeElement)) first.focus({ preventScroll: true });
    }
    function valid() {
      var fields = steps[i].querySelectorAll('input,select,textarea');
      for (var k = 0; k < fields.length; k++) {
        var f = fields[k];
        if (f.disabled || f.offsetParent === null) continue;
        if (!f.checkValidity()) { f.reportValidity(); return false; }
      }
      return true;
    }
    next.addEventListener('click', function () { if (valid()) go(i + 1); });
    back.addEventListener('click', function () { go(i - 1); });
    // start over whenever the surrounding sheet is opened
    var overlay = form.closest('.modal-overlay');
    if (overlay) new MutationObserver(function () { if (overlay.classList.contains('show')) go(0); }).observe(overlay, { attributes: true, attributeFilter: ['class'] });
    form.addEventListener('submit', function (e) { if (i !== steps.length - 1) { e.preventDefault(); e.stopImmediatePropagation(); if (valid()) go(i + 1); } }, true);
    go(0);
  }
  window.PE = { wizard: wizard };
}());
