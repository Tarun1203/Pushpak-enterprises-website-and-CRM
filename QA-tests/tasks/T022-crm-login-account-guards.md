# T022-crm-login-account-guards: CRM login — missing/unknown role, accessDisabled, role-lookup failure

| Field | Value |
|---|---|
| Route | `/crm/login.html` |
| Source | `crm/login.html` (`routeAfterLogin`) |
| Flow | Valid Auth credentials but the `users/{uid}` profile blocks entry → error + `auth.signOut()` |
| Requires auth | no |
| Required role | anonymous |
| Destructive | no |
| Estimated steps | 38 |

## Preconditions
- App running at `http://localhost:8080`
- Anonymous (clear site data before each TC).
- Run only against the Firebase emulator or a dedicated test project — never the live makwell-websiteandcrm data.
- `crm/login.html` hardcodes the live `makwell-websiteandcrm` config with no emulator hook; the runner MUST point the page at the emulator/test project first, or mark the task BLOCKED. Run the Firestore emulator on a port other than 8080.
- Seeded fixtures (each is a valid, enabled Firebase Auth user):

| Fixture | Credentials env vars | `users/{uid}` doc |
|---|---|---|
| No profile doc | `QA_CRED_NOROLE_USERNAME` / `QA_CRED_NOROLE_PASSWORD` | **does not exist** |
| Empty role | `QA_CRED_EMPTYROLE_USERNAME` / `QA_CRED_EMPTYROLE_PASSWORD` | `{ role: "", displayName: "QA-AUTO Empty Role", phone: "9000000011", city: "Raichur", state: "Karnataka", pincode: "584101" }` |
| Unrecognised role | `QA_CRED_BADROLE_USERNAME` / `QA_CRED_BADROLE_PASSWORD` | `{ role: "areamanager", displayName: "QA-AUTO Area Manager", phone: "9000000012", city: "Raichur", state: "Karnataka", pincode: "584101" }` |
| accessDisabled | `QA_CRED_DEACTIVATED_USERNAME` / `QA_CRED_DEACTIVATED_PASSWORD` | `{ role: "technician", accessDisabled: true, displayName: "QA-AUTO Deactivated Tech", phone: "9000000013", city: "Raichur", state: "Karnataka", pincode: "584101" }` |
| accessDisabled = false | `QA_CRED_TECHNICIAN_USERNAME` / `QA_CRED_TECHNICIAN_PASSWORD` | `{ role: "technician", accessDisabled: false, displayName: "QA-AUTO Technician", phone: "9000000004", … }` |

## Test data
- Credentials: per fixture env vars above (never literal values).
- Expected messages (exact text from `crm/login.html`):
  - `noRole` = `Your account has no role assigned yet. Contact your admin.`
  - `badRole` = `Unrecognized role "areamanager". Contact your admin.`
  - `deactivated` = `Your account has been deactivated. Contact your admin if you believe this is a mistake.`
  - `lookupFailed` = `Could not verify your account. Contact your admin.`

## Steps

For every blocked case below, "assert signed out" means: after the message appears, reload `/crm/login.html` and assert it stays on the login page for 3 s with no auto-redirect (proving `auth.signOut()` ran), and `firebase:authUser:*` is absent from IndexedDB/localStorage.

### TC-01: No `users/{uid}` document
1. Navigate to `/crm/login.html`. Fill `#email` = `QA_CRED_NOROLE_USERNAME`, `#password` = `QA_CRED_NOROLE_PASSWORD`. Click **`Sign in`**.
2. Assert: `#error-msg` text is exactly `noRole`; `#status-msg` hidden.
3. Assert: button is enabled with text `Sign in`; URL is still `/crm/login.html`.
4. Assert signed out.

### TC-02: Role field is an empty string
1. Sign in with `QA_CRED_EMPTYROLE_*`.
2. Assert: `#error-msg` text is exactly `noRole`. Assert signed out.

### TC-03: Unrecognised role
1. Sign in with `QA_CRED_BADROLE_*`.
2. Assert: `#error-msg` text is exactly `badRole` (role value is shown in straight double quotes).
3. Assert: no navigation to `CRMareamanager.html` occurs, even though `crm/CRMareamanager.html` exists in the repo (it is not in `ROLE_REDIRECTS`). Record this as an observation in the run report.
4. Assert signed out.

### TC-04: `accessDisabled: true`
1. Sign in with `QA_CRED_DEACTIVATED_*`.
2. Assert: `#error-msg` text is exactly `deactivated`.
3. Assert: no navigation to `/crm/CRMtechnician.html`. Assert signed out.

### TC-05: `accessDisabled: false` is allowed
1. Sign in with `QA_CRED_TECHNICIAN_*`.
2. Assert: lands on `/crm/CRMtechnician.html` (only strict `true` blocks). Sign out.

### TC-06: Role lookup fails (Firestore unreachable after Auth succeeds)
1. Navigate to `/crm/login.html`. In DevTools → Network request blocking, block the Firestore host only (`firestore.googleapis.com` for a test project, or the Firestore emulator host:port). Leave identitytoolkit unblocked.
2. Sign in with `QA_CRED_DEALER_USERNAME` / `QA_CRED_DEALER_PASSWORD`.
3. Assert: within 15 s `#error-msg` text is exactly `lookupFailed`; console shows `Role lookup failed:` (expected).
4. Assert: button is enabled with text `Sign in`; stays on `/crm/login.html`.
5. Remove the block. Reload. Assert signed out.
6. If after 30 s the button is still `Signing in…` with no message (Firestore SDK waiting instead of failing), mark FAIL: the user is stuck with no feedback.

### TC-07: Report Bug button after a blocked sign-in
`crm/release.js` loads `bug-reporter.js` on every `/crm/` page, and it builds the `🐞 Report Bug` button whenever an Auth user appears — including the brief moment before `routeAfterLogin` signs a blocked user out.
1. Repeat TC-01 (no profile doc).
2. Record whether a `🐞 Report Bug` button is visible on `/crm/login.html` after the `noRole` message.
3. If visible: click it. Assert: browser alert text is exactly `Please sign in to the CRM before reporting a bug.` and no `bugReports` document is created. Record the leftover button as a UI finding (an anonymous login page shows a Report Bug control).
4. If not visible: pass.

## Assertions
- [ ] Missing profile doc and empty role both show exactly `Your account has no role assigned yet. Contact your admin.`
- [ ] Role `areamanager` shows exactly `Unrecognized role "areamanager". Contact your admin.`
- [ ] `accessDisabled: true` shows exactly `Your account has been deactivated. Contact your admin if you believe this is a mistake.`
- [ ] `accessDisabled: false` signs in normally.
- [ ] Firestore failure shows exactly `Could not verify your account. Contact your admin.`
- [ ] In every blocked case the user is signed out, the button is re-enabled as `Sign in`, and no dashboard is loaded.
- [ ] No console errors in DevTools at any step, except the expected `Role lookup failed:` in TC-06.
- [ ] No failed network requests (no 4xx/5xx) except the blocked Firestore requests in TC-06.

## Screenshots required
- Page initial load
- Each error state (TC-01, TC-03, TC-04, TC-06)
- Report Bug button state after TC-07
- Final state after TC-05 (technician dashboard)

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
