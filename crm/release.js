/* Release identification. scripts/stamp-release.mjs rewrites this file at deploy time. */
window.PE_RELEASE = {"version":"1.0.0-rc1","build":"dev","date":"2026-10-09"};

/* Phase 11A — global CRM bug reporter. Every authenticated CRM page that
   includes release.js gets the same Report Bug entry point. */
(function loadBugReporter(){
  if (!location.pathname.includes('/crm/')) return;
  if (document.querySelector('script[data-pe-bug-reporter]')) return;
  const s = document.createElement('script');
  s.type = 'module';
  s.src = 'bug-reporter.js';
  s.dataset.peBugReporter = '1';
  document.head.appendChild(s);
})();
