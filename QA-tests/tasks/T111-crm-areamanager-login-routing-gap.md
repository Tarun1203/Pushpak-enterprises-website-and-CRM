# T111-crm-areamanager-login-routing-gap: Area Manager login routes to CRMareamanager.html (known gap, expected FAIL)

| Field | Value |
|---|---|
| Route | `/crm/CRMareamanager.html` (entered via `/crm/login.html`) |
| Source | `crm/CRMareamanager.html`, `crm/login.html` |
| Flow | Area manager signs in and lands on their dashboard |
| Requires auth | yes |
| Required role | areamanager |
| Destructive | no |
| Estimated steps | 9 |

> **Known gap — this task FAILS today, and that is intentional.** The `ROLE_REDIRECTS` map in `crm/login.html` (lines 96–104) has entries for `superadmin`, `warehouse`, `servicecenter`, `technician`, `dealer`, `distributor` and `customer`. It has **no `areamanager` entry**. So `routeAfterLogin()` shows `Unrecognized role "areamanager". Contact your admin.` and signs the user out. The `CRMareamanager.html` guard (`ALLOWED_ROLE = 'areamanager'`) is therefore unreachable through login. This task turns PASS only after `areamanager: 'CRMareamanager.html'` is added to `ROLE_REDIRECTS`. Do not mark it PASS before that fix exists.

## Preconditions
- App running at `http://localhost:8080`.
- Signed-in user role: `areamanager`. Credentials come from the env vars `QA_CRED_AREAMANAGER_USERNAME` and `QA_CRED_AREAMANAGER_PASSWORD` (or `QA-tests/.qa-catalog/auth.local.json` via `scripts/auth-resolve.mjs`). Never write the values into this file, screenshots or the report. If either env var is unset or empty, mark the task **BLOCKED (no areamanager credential)**.
- Seed data: a Firebase Auth user whose `users/{uid}` doc has `role: "areamanager"` and `accessDisabled` absent or `false`.
- Clear site data for `localhost:8080` before you start, so there is no leftover session.
- **Live-project safety gate:** both pages hardcode `projectId: "makwell-websiteandcrm"` (the live project). Signing in calls `identitytoolkit.googleapis.com` and reads `users/{uid}` from Firestore. If those requests would go to the live `makwell-websiteandcrm` project and not to a local Firebase emulator or a dedicated test project, **do not submit the login form**. Mark the task **BLOCKED (would hit live Firebase project)** and record the static finding from the box above as the evidence.

## Test data
- `loginUrl = "http://localhost:8080/crm/login.html"`
- `email = $QA_CRED_AREAMANAGER_USERNAME`
- `password = $QA_CRED_AREAMANAGER_PASSWORD`
- `expectedDestination = "http://localhost:8080/crm/CRMareamanager.html"`
- `currentGapError = 'Unrecognized role "areamanager". Contact your admin.'`

## Steps

### TC-01: Happy path — Area manager signs in and reaches the Area Manager dashboard (expected FAIL until fixed)
1. Navigate to `loginUrl`. Assert: heading `CRM login` and the `Email` / `Password` inputs are visible.
2. Fill `Email` with `email`, then fill `Password` with `password`.
3. Click **`Sign in`**. Assert: the button text changes to `Signing in…` and the button is disabled.
4. **Expected (target behavior):** status `Signed in — redirecting…` appears, then the browser lands on `expectedDestination`.
5. Assert: `#gate` hides, then `#app` shows. The sidebar header shows `Pushpak Enterprises` / `Area Service Manager`. `#user-email` shows the signed-in email. `#page-title` is `Dashboard` and `#page-sub` is `Welcome back`.
6. Assert: the four stat cards `Status`, `Pending`, `This month` and `Alerts` each show value `—` and hint `Module not built yet`. The panel `Getting started` is visible.
7. Reload the page. Assert: the user stays on `CRMareamanager.html` and the dashboard renders again (the session persists).

**Observed today (record as FAIL):** after step 3, the `#error-msg` banner shows exactly `Unrecognized role "areamanager". Contact your admin.`. The `Sign in` button resets, the user is signed out and stays on `login.html`. Record this text as the failure evidence and cite the missing `ROLE_REDIRECTS.areamanager` entry in `crm/login.html`.

### TC-02: Direct-URL regression check (only after the fix, or with an existing session)
1. While signed in as `areamanager`, navigate directly to `expectedDestination`.
2. Assert: the dashboard renders (the guard accepts `role === 'areamanager'`).
3. Today you cannot get a session that survives login.html, so mark this TC **BLOCKED (depends on TC-01 fix)** while TC-01 fails.

### TC-03: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| `Sign in` | click with valid areamanager credentials | Target: redirect to `CRMareamanager.html`. Today: error `Unrecognized role "areamanager". Contact your admin.` |

## Assertions
- [ ] After login with an `areamanager` account, the URL is `/crm/CRMareamanager.html`. **Currently fails.**
- [ ] The text `Unrecognized role` does not appear. **Currently fails.**
- [ ] The dashboard shell renders with `Dashboard` / `Welcome back` and the 4 stat cards.
- [ ] No credential value appears in the report or screenshots.
- [ ] No traffic to the live `makwell-websiteandcrm` project. If there is any, the task is BLOCKED.
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx).

## Screenshots required
- `login.html` initial load
- The `Unrecognized role "areamanager"` error banner (current behavior)
- After the fix: the Area Manager dashboard initial load

## Pass criteria
TC-01 passes only when the areamanager login lands on `CRMareamanager.html` with the dashboard rendered and there are no unexpected console or network errors. Until `ROLE_REDIRECTS` in `crm/login.html` has `areamanager`, the expected result of this task is **FAIL**. If the run would reach the live Firebase project, the result is **BLOCKED**.
