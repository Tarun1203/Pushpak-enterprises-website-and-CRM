// Shared wait for the authenticated CRM suites (Phase 2-5).
//
// crm/login.html never navigates when sign-in fails: it shows the reason in
// #error-msg and stays put. Waiting only on the URL therefore turned every
// login problem into a bare "page.waitForURL: Timeout 20000ms exceeded".
// This helper waits for the role dashboard and, if it never arrives, fails
// with the page the browser ended up on plus the login page's own message,
// so the CI report says WHY (wrong password, no role, deactivated, ...).
// Only on-page text is reported, never the QA credentials.

const HINTS = [
  [/incorrect email or password/i,
    'QA_EMAIL / QA_PASSWORD secrets do not match a Firebase Auth user: re-check both secrets.'],
  [/no role assigned/i,
    'Firestore users/{uid} for the QA account is missing or has no "role" field: set role to "servicecenter".'],
  [/unrecognized role/i,
    'users/{uid}.role holds a value login.html does not know: set it to "servicecenter".'],
  [/deactivated|disabled/i,
    'The QA account is switched off: clear users/{uid}.accessDisabled and make sure its service center profile is not INACTIVE.'],
  [/could not verify your account/i,
    'Reading users/{uid} failed (Firestore rules or network): check the users rule for a signed-in user reading their own doc.'],
  [/too many attempts/i,
    'Firebase Auth rate-limited the QA account: wait, or reduce how many suites sign in per run.'],
];

async function readText(page, selector) {
  try {
    const loc = page.locator(selector).first();
    if (!(await loc.count())) return '';
    return ((await loc.textContent({ timeout: 1_000 })) || '').trim();
  } catch {
    return '';
  }
}

// 15s: well under the 30s per-test limit, so the diagnosis below gets to run
// (a successful sign-in redirects in a few seconds).
async function waitForRoleDashboard(page, dashboardFile, { timeout = 15_000 } = {}) {
  try {
    await page.waitForURL((url) => url.pathname.endsWith('/' + dashboardFile), { timeout });
    return;
  } catch {
    // fall through to diagnosis
  }
  const url = new URL(page.url());
  const where = url.pathname.split('/').slice(-2).join('/') + url.search;
  const error = await readText(page, '#error-msg.show') || await readText(page, '#error-msg');
  const status = await readText(page, '#status-msg.show');
  let hint = 'No message on the login page: the sign-in request may not have finished. Check the live site loads and Firebase Auth is reachable.';
  if (/deactivated=1/.test(url.search)) {
    hint = 'The dashboard bounced back with ?deactivated=1: the QA service center profile has status INACTIVE.';
  } else if (url.pathname.endsWith('/' + dashboardFile) === false && /login\.html$/.test(url.pathname) && !error && status) {
    hint = 'Login succeeded but the dashboard gate sent the browser back to login.html: users/{uid}.role is not "servicecenter" or accessDisabled is set.';
  }
  for (const [re, text] of HINTS) if (re.test(error)) { hint = text; break; }
  // One line on purpose: the CI regression gate and GitHub annotations keep
  // only the first line of an error message.
  throw new Error(
    `QA login failed: login page error ${error ? JSON.stringify(error) : '(none)'}` +
    ` | status ${status ? JSON.stringify(status) : '(none)'}` +
    ` | ended on ${where}` +
    ` | likely fix: ${hint}` +
    ` | (waited ${Math.round(timeout / 1000)}s for the role dashboard)`
  );
}

module.exports = { waitForRoleDashboard };
