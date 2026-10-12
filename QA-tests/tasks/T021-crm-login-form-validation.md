# T021-crm-login-form-validation: Form validation — `login-form` (empty, malformed, wrong credentials)

| Field | Value |
|---|---|
| Route | `/crm/login.html` |
| Source | `crm/login.html` |
| Flow | Submit "login-form" with invalid input → native validation or `friendlyAuthError` message |
| Requires auth | no |
| Required role | anonymous |
| Destructive | no |
| Estimated steps | 40 |

## Preconditions
- App running at `http://localhost:8080`
- Anonymous (no Firebase Auth session; clear site data before starting).
- Run only against the Firebase emulator or a dedicated test project — never the live makwell-websiteandcrm data.
- `crm/login.html` hardcodes the live `makwell-websiteandcrm` config with no emulator hook; the runner MUST point the page at the emulator/test project first, or mark the task BLOCKED. Run the Firestore emulator on a port other than 8080.
- Seeded fixture: dealer account (`QA_CRED_DEALER_USERNAME` / `QA_CRED_DEALER_PASSWORD`, `users/{uid}` = `{ role: "dealer", displayName: "QA-AUTO Dealer", phone: "9000000005", city: "Raichur", state: "Karnataka", pincode: "584101" }`).
- Fixture: Firebase Auth user that is **disabled in Auth** (`QA_CRED_AUTHDISABLED_USERNAME` / `QA_CRED_AUTHDISABLED_PASSWORD`, `users/{uid}` = `{ role: "dealer", displayName: "QA-AUTO Auth Disabled", phone: "9000000010" }`).

## Test data
- `validEmail` = `QA_CRED_DEALER_USERNAME`; `validPassword` = `QA_CRED_DEALER_PASSWORD`
- `emptyRequired` = `""`
- `badEmailNoAt` = `"qa-auto-not-an-email"`
- `badEmailNoDomain` = `"qa-auto@"`
- `unknownEmail` = `"qa-auto-nobody-9000000099@example.test"`
- `wrongPassword` = `"QA-AUTO-wrong-Pass-9000000001"`
- `wrongCasePassword` = `QA_CRED_DEALER_PASSWORD` with every letter's case inverted (skip this row if the password has no letters)
- `paddedPassword` = `QA_CRED_DEALER_PASSWORD` + one trailing space (password is NOT trimmed by the page)
- `longEmail` = 300 × `"a"` + `"@example.test"`

## Steps

### TC-01: Form validation — `login-form` (native HTML5 validation, form has no `novalidate`)
For each row: navigate to `/crm/login.html`, fill the inputs as shown, click **`Sign in`**, then assert. For every row the submit MUST be blocked by the browser: the `Sign in` button stays enabled with text `Sign in`, `#error-msg` stays hidden, and NO request to identitytoolkit (`accounts:signInWithPassword`) is sent.

| # | `#email` | `#password` | Expected |
|---|---|---|---|
| 1 | `""` | `""` | `#email.validity.valueMissing === true`; browser tooltip on Email; focus moves to `#email` |
| 2 | `""` | `validPassword` | `#email.validity.valueMissing === true` |
| 3 | `validEmail` | `""` | `#password.validity.valueMissing === true`; focus moves to `#password` |
| 4 | `badEmailNoAt` | `validPassword` | `#email.validity.typeMismatch === true` |
| 5 | `badEmailNoDomain` | `validPassword` | `#email.validity.typeMismatch === true` |
| 6 | `"   "` (3 spaces) | `validPassword` | `#email.validity.valueMissing === true` (spaces are sanitised to empty) |

Max-length: neither input has `maxlength`; no max-length overflow rule applies (see TC-06).

### TC-02: Wrong password
1. Navigate to `/crm/login.html`. Fill `#email` = `validEmail`, `#password` = `wrongPassword`. Click **`Sign in`**.
2. Assert: button shows `Signing in…` while pending, then returns to enabled `Sign in`.
3. Assert: `#error-msg` is visible with text exactly `Incorrect email or password.`
4. Assert: the page stays on `/crm/login.html`; `#email` keeps its value; `#status-msg` is hidden.
5. Assert: the identitytoolkit request returned HTTP 400 (expected) and a console error `Login failed:` is logged (expected, from `console.error`).

### TC-03: Unknown email
1. Fill `#email` = `unknownEmail`, `#password` = `wrongPassword`. Click **`Sign in`**.
2. Assert: `#error-msg` text is exactly `Incorrect email or password.` (same text as wrong password — no account enumeration).

### TC-04: Password is case-sensitive and not trimmed
1. Fill `#email` = `validEmail`, `#password` = `wrongCasePassword`. Click **`Sign in`**. Assert: `Incorrect email or password.`
2. Fill `#email` = `validEmail`, `#password` = `paddedPassword`. Click **`Sign in`**. Assert: `Incorrect email or password.`

### TC-05: Error clears on the next attempt
1. Produce the TC-02 error.
2. Fill `#password` = `validPassword`. Click **`Sign in`**.
3. Assert: `#error-msg` is hidden as soon as the submit starts (`clearError()`), then `Signed in — redirecting…` shows and the browser lands on `/crm/CRMdealer.html`.
4. Sign out / clear site data.

### TC-06: Very long email
1. Fill `#email` = `longEmail`, `#password` = `wrongPassword`. Click **`Sign in`**.
2. Assert: the page does not freeze; `#error-msg` shows one of `Incorrect email or password.` or `Enter a valid email address.` (record which); button returns to `Sign in`.

### TC-07: Account disabled in Firebase Auth
1. Fill `#email` = `QA_CRED_AUTHDISABLED_USERNAME`, `#password` = `QA_CRED_AUTHDISABLED_PASSWORD`. Click **`Sign in`**.
2. Assert: `#error-msg` text is exactly `This account has been disabled. Contact your admin.`
3. Assert: stays on `/crm/login.html`; no Firestore `users/{uid}` read was made.

### TC-08: Too many attempts (dedicated test project only — the emulator does not rate-limit)
1. Submit `validEmail` + `wrongPassword` repeatedly (up to 15 times, 1 s apart) until the message changes.
2. Assert: the message becomes exactly `Too many attempts. Please wait a few minutes and try again.` If the limit is not hit after 15 tries (emulator), mark TC-08 SKIPPED, not failed.

### TC-09: Network failure during sign-in
1. Fill `validEmail` + `validPassword`. In DevTools set the network to **Offline**. Click **`Sign in`**.
2. Assert: `#error-msg` text is exactly `Network error — check your connection and try again.`; button returns to enabled `Sign in`.
3. Assert: the top banner `#pe-notice` shows `You're offline. Check your internet connection. Nothing is saved until it is back.`
4. Go back **Online**. Assert: banner text becomes `Back online. You can continue.` and hides within ~3 s.
5. Click **`Sign in`** again. Assert: lands on `/crm/CRMdealer.html`.

## Assertions
- [ ] Empty Email / empty Password / malformed Email are blocked by native validation with no Auth request.
- [ ] Wrong password and unknown email both show exactly `Incorrect email or password.`
- [ ] Auth-disabled account shows exactly `This account has been disabled. Contact your admin.`
- [ ] Offline sign-in shows exactly `Network error — check your connection and try again.`
- [ ] After every failure the button is re-enabled with text `Sign in` and the user stays on `/crm/login.html`.
- [ ] No console errors in DevTools at any step, except the expected `Login failed:` entries for TC-02 … TC-09.
- [ ] No failed network requests (no 4xx/5xx) except the expected HTTP 400 identitytoolkit responses for invalid credentials.

## Screenshots required
- Page initial load
- Each native validation state (TC-01 rows 1, 3, 4)
- `Incorrect email or password.` error
- `This account has been disabled. Contact your admin.` error
- Network error + offline banner
- Final state after TC-05 / TC-09 (dealer dashboard)

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
