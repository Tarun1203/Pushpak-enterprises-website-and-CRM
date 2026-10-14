/* Pushpak UI Foundation — Phase 1 theme/accessibility behavior. */
(function () {
  'use strict';
  var doc = document;
  var key = 'pushpak-theme';

  function systemTheme() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    var resolved = theme === 'system' ? systemTheme() : theme;
    doc.documentElement.dataset.theme = resolved;
    doc.documentElement.dataset.themePreference = theme;
    doc.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
      button.setAttribute('aria-pressed', resolved === 'dark' ? 'true' : 'false');
      button.setAttribute('title', resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
      button.setAttribute('aria-label', resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
      var sun = button.querySelector('[data-theme-icon="sun"]');
      var moon = button.querySelector('[data-theme-icon="moon"]');
      if (sun) sun.hidden = resolved === 'dark';
      if (moon) moon.hidden = resolved !== 'dark';
    });
  }

  function initialPreference() {
    try {
      var saved = localStorage.getItem(key);
      if (saved === 'dark' || saved === 'light' || saved === 'system') return saved;
    } catch (_) {}
    return 'system';
  }

  function ready(fn) {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    applyTheme(initialPreference());

    doc.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
      button.addEventListener('click', function () {
        var current = doc.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
        var next = current === 'dark' ? 'light' : 'dark';
        try { localStorage.setItem(key, next); } catch (_) {}
        applyTheme(next);
      });
    });

    if (window.matchMedia) {
      var media = window.matchMedia('(prefers-color-scheme: dark)');
      media.addEventListener && media.addEventListener('change', function () {
        if (doc.documentElement.dataset.themePreference === 'system') applyTheme('system');
      });
    }
  });
}());
