// Phone menu for the public site headers. The pages hide their <nav> on
// small screens; this adds a "Menu" button that shows it as a drop-down
// (only while the nav is actually hidden by the page's own CSS).
(function () {
  function init() {
    var header = document.querySelector('header');
    var nav = header && header.querySelector('nav');
    if (!nav || header.querySelector('.mnav-btn')) return;
    var css = document.createElement('style');
    css.textContent =
      '.mnav-btn{display:none;align-items:center;justify-content:center;min-width:44px;min-height:44px;padding:0 12px;margin-left:8px;' +
      'border:1px solid currentColor;border-radius:4px;background:transparent;color:inherit;font:600 14px Inter,system-ui,sans-serif;cursor:pointer;}' +
      'header.mnav-open nav{display:flex !important;flex-direction:column;gap:4px;position:absolute;top:100%;left:0;right:0;' +
      'padding:10px 20px 16px;background:var(--paper,#fff);border-bottom:1px solid var(--hairline,#ddd);z-index:60;box-shadow:0 8px 16px rgba(0,0,0,.08);}' +
      'header.mnav-open nav a{display:block;padding:12px 0;font-size:16px;}';
    document.head.appendChild(css);
    if (getComputedStyle(header).position === 'static') header.style.position = 'relative';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mnav-btn';
    btn.textContent = 'Menu';
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', 'Open menu');
    nav.parentNode.insertBefore(btn, nav.nextSibling);
    function hiddenByPage() {
      if (header.classList.contains('mnav-open')) return true;
      return getComputedStyle(nav).display === 'none';
    }
    function sync() { btn.style.display = hiddenByPage() ? 'inline-flex' : 'none'; if (!hiddenByPage()) set(false); }
    function set(open) {
      header.classList.toggle('mnav-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      btn.textContent = open ? 'Close' : 'Menu';
    }
    btn.addEventListener('click', function () { set(!header.classList.contains('mnav-open')); });
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) set(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') set(false); });
    window.addEventListener('resize', sync);
    sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
