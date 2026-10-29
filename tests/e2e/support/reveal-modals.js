// The Phase 3/4 contract checks type into fields that live in the service center's
// job modals (spare request, schedule appointment, close request). Those modals are
// display:none until a job's action button opens them, and the QA service center may
// have no jobs at all. Playwright's fill()/selectOption() wait for a visible field, so
// without this they sit out the whole 30s test timeout.
//
// Showing the modals lets the form validation (required, min, validity) be exercised
// directly. It uses the page's own `.show` class, the same one the buttons toggle.
async function revealModals(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.modal-overlay').forEach((overlay) => overlay.classList.add('show'));
  });
}

module.exports = { revealModals };
