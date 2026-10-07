// Phone menu for the CRM dashboards (see mobile.css): adds a menu button to
// the top bar that slides the sidebar in, and closes it again when a menu
// item is chosen, the backdrop is tapped or Escape is pressed.
(function () {
  function init() {
    var sidebar = document.querySelector('.sidebar');
    var topbar = document.querySelector('.main .topbar');
    if (!sidebar || !topbar || document.querySelector('.crm-menu-btn')) return;
    if (!sidebar.id) sidebar.id = 'crm-sidebar';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'crm-menu-btn';
    btn.setAttribute('aria-label', 'Open menu');
    btn.setAttribute('aria-controls', sidebar.id);
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '&#9776;';
    topbar.insertBefore(btn, topbar.firstChild);
    var backdrop = document.createElement('div');
    backdrop.className = 'crm-nav-backdrop';
    document.body.appendChild(backdrop);
    function set(open) {
      document.body.classList.toggle('crm-nav-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    }
    btn.addEventListener('click', function () { set(!document.body.classList.contains('crm-nav-open')); });
    backdrop.addEventListener('click', function () { set(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') set(false); });
    // Choosing a page from the menu closes it (the nav is rebuilt by the
    // page script, so listen on the sidebar itself).
    sidebar.addEventListener('click', function (e) {
      if (e.target.closest('.nav-item, a')) set(false);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
