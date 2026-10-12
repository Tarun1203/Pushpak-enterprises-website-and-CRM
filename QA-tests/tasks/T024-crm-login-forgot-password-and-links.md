# T024-crm-login-forgot-password-and-links: CRM login — Forgot password and page links

| Field | Value |
|---|---|
| Route | `/crm/login.html` |
| Source | `crm/login.html` (`#forgot-link` handler) |
| Flow | Request a password-reset email; follow footer/back links |
| Requires auth | no |
| Required role | anonymous |
| Destructive | no (sends a reset email to a fake test address) |
| Estimated steps | 26 |

## Preconditions
- App running at `http://localhost:8080`
- Anonymous (clear site data before starting).
- Run only against the Firebase emulator or a dedicated test project — never the live makwell-websiteandcrm data. A reset request against the live project would email a real inbox.
- `crm/login.html` hardcodes the live `makwell-websiteandcrm` config with no emulator hook; the runner MUST point the page at the emulator/test project first, or mark the task BLOCKED. Run the Firestore emulator on a port other than 8080.
- Seeded fixture: dealer account (`QA_CRED_DEALER_USERNAME` / `QA_CRED_DEALER_PASSWORD`, `users/{uid}` = `{ role: "dealer", displayName: "QA-AUTO Dealer", phone: "9000000005", city: "Raichur", state: "Karnataka", pincode: "584101" }`), on a fake `@example.test` address.

## Test data
- `resetEmail` = `QA_CRED_DEALER_USERNAME`
- `unknownEmail` = `"qa-auto-nobody-9000000099@example.test"`
- `badEmail` = `"qa-auto-not-an-email"`
- `emptyEmail` = `""`

## Steps

### TC-01: Happy path — request a password reset
1. Navigate to `/crm/login.html`.
2. Fill `#email` = `resetEmail`. Leave `#password` empty.
3. Click **`Forgot password?`**.
4. Assert: `#status-msg` is visible with text exactly `Password reset email sent — check your inbox.`; `#error-msg` hidden.
5. Assert: one identitytoolkit `accounts:sendOobCode` request (requestType `PASSWORD_RESET`) returned 200; no native validation tooltip appears (the link is not a submit).
6. Emulator only: open the Auth emulator UI / `GET /emulator/v1/projects/<project>/oobCodes` and assert one `PASSWORD_RESET` code exists for `resetEmail`.
7. Assert: the page stays on `/crm/login.html`; user is not signed in.

### TC-02: Forgot password with empty email
1. Clear `#email`. Click **`Forgot password?`**.
2. Assert: `#error-msg` text is exactly `Enter your email above first, then click "Forgot password?".`
3. Assert: no `sendOobCode` request is sent.
4. Fill `#email` with 3 spaces and click again. Assert: same message (value is trimmed).

### TC-03: Forgot password with malformed email
1. Fill `#email` = `badEmail`. Click **`Forgot password?`**.
2. Assert: `#error-msg` text is exactly `Enter a valid email address.` (Firebase `auth/invalid-email`); `#status-msg` hidden.

### TC-04: Forgot password with unknown email
1. Fill `#email` = `unknownEmail`. Click **`Forgot password?`**.
2. Assert: exactly one of the following is shown, and record which: `#status-msg` = `Password reset email sent — check your inbox.` (email-enumeration protection on), or `#error-msg` = `Incorrect email or password.` (Auth returned `auth/user-not-found`). Either is a pass; any other text is a FAIL.

### TC-05: Status and error messages replace each other
1. Do TC-02 step 1 (error visible). Then fill `resetEmail` and click **`Forgot password?`**.
2. Assert: the error hides and only the status `Password reset email sent — check your inbox.` is visible.

### TC-06: Forgot password while offline
1. Fill `#email` = `resetEmail`. Set DevTools network to **Offline**. Click **`Forgot password?`**.
2. Assert: `#error-msg` text is exactly `Network error — check your connection and try again.`; banner `#pe-notice` shows `You're offline. Check your internet connection. Nothing is saved until it is back.`
3. Go back **Online**.

### TC-07: Button coverage — links on the page

| Link | Action taken | Expected result |
|---|---|---|
| `Forgot password?` | click with keyboard: Tab to it, press Enter | Record whether it is reachable by keyboard. It is an `<a>` with no `href`, so it is not in the tab order; record as an accessibility finding if unreachable |
| `← Back to Pushpak Enterprises` | click | navigates to `/index.html`; HTTP 200 |
| `Privacy` | click | navigates to `/privacy.html`; HTTP 200 |
| `Terms` | click | navigates to `/terms.html`; HTTP 200 |
| `Cookies` | click | navigates to `/cookies.html`; HTTP 200 |

After each navigation, press **Back** and assert the login page reloads with empty `#error-msg`.

### TC-08: Sign in still works after a reset request (old password unchanged until the reset link is used)
1. Fill `#email` = `resetEmail`, `#password` = `QA_CRED_DEALER_PASSWORD`. Click **`Sign in`**.
2. Assert: lands on `/crm/CRMdealer.html`. Sign out / clear site data.

## Assertions
- [ ] Reset with a known email shows exactly `Password reset email sent — check your inbox.`
- [ ] Empty email shows exactly `Enter your email above first, then click "Forgot password?".` and sends no request.
- [ ] Malformed email shows exactly `Enter a valid email address.`
- [ ] Offline shows exactly `Network error — check your connection and try again.`
- [ ] Back, Privacy, Terms, Cookies links resolve with HTTP 200.
- [ ] No console errors in DevTools at any step, except the expected `Password reset failed:` entries in TC-03, TC-04 and TC-06.
- [ ] No failed network requests (no 4xx/5xx) except the expected identitytoolkit 400s in TC-03 / TC-04.

## Screenshots required
- Page initial load
- Reset-sent status (TC-01)
- Each error state (TC-02, TC-03, TC-06)
- Final state after the happy path (TC-08 dealer dashboard)

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
