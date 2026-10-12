# T060-crm-servicecenter-access-guard: Service Center dashboard — auth gate, role gate, deactivation and sign-out

| Field | Value |
|---|---|
| Route | `/crm/CRMservicecenter.html` |
| Source | `crm/CRMservicecenter.html` (gate: `onAuthStateChanged` block, `ALLOWED_ROLE = 'servicecenter'`); `crm/login.html` (`?deactivated=1` banner, `routeAfterLogin`) |
| Flow | Unauthenticated visit is redirected to the login wall; signed-in user with a different role is rejected; deactivated center is bounced; sign out |
| Requires auth | yes |
| Required role | servicecenter |
| Destructive | no |
| Estimated steps | 26 |

## Preconditions
- App running at `http://localhost:8080`
- Run only against the Firebase emulator or a dedicated test project — never the live makwell-websiteandcrm data. (TC-04 and TC-05 flip flags on test accounts.)
- Accounts available to the runner (resolved from `QA-tests/.qa-catalog/auth.local.json` / env vars — never typed into this file):
  - `servicecenter` → `QA_CRED_SERVICECENTER_USERNAME` / `QA_CRED_SERVICECENTER_PASSWORD`; `users/{uid}.role == "servicecenter"`, `accessDisabled` absent/false, `serviceCenterProfiles/{uid}.status` != `"INACTIVE"`.
  - `technician` (wrong-role account) → `QA_CRED_TECHNICIAN_USERNAME` / `QA_CRED_TECHNICIAN_PASSWORD`.
  - A second service center reserved for deactivation tests → `QA_CRED_SERVICECENTER_DEACTIVATED_USERNAME` / `QA_CRED_SERVICECENTER_DEACTIVATED_PASSWORD`. If that env var pair is not set, TC-04/TC-05 must be run against the main servicecenter account and the flags restored afterwards.
- Browser storage cleared before TC-01 (no persisted Firebase Auth session in IndexedDB).

## Test data
- `loginUrl = "http://localhost:8080/crm/login.html"`
- `dashboardUrl = "http://localhost:8080/crm/CRMservicecenter.html"`
- `deactivatedUrl = "http://localhost:8080/crm/login.html?deactivated=1"`
- `deactivatedBanner = "Your account has been deactivated. Contact your admin if you believe this is a mistake."`
- `gateText = "Checking your session…"`
- `badPassword = "QA-AUTO-wrong-password-1"` (used with the servicecenter username)
- Firestore flag edits (emulator UI or admin SDK):
  - TC-04: `serviceCenterProfiles/{deactivatedUid}.status = "INACTIVE"` → restore to `"ACTIVE"` afterwards
  - TC-05: `users/{deactivatedUid}.accessDisabled = true` → restore to `false` afterwards

## Steps

### TC-01: Signed-out visit is redirected to login
1. With no session, navigate to `dashboardUrl`.
2. Assert: the full-screen `#gate` overlay with text `Checking your session…` is shown first, and `#app` (sidebar, `Dashboard` heading) is never visible.
3. Assert: within 5 s the browser URL becomes `loginUrl` (exact path `/crm/login.html`, no query string).
4. Assert: login page shows heading `CRM login`, inputs `Email` and `Password`, button `Sign in`.
5. Assert: no element with id `nav-container`, `stat-new` or `content` from the dashboard was rendered at any time (screenshot at step 2).

### TC-02: Wrong password stays on login
1. On `loginUrl`, fill `Email` = servicecenter username, `Password` = `badPassword`.
2. Click **`Sign in`**.
3. Assert: error box shows `Incorrect email or password.`; URL stays `/crm/login.html`; button text returns to `Sign in`.

### TC-03: Happy path — servicecenter signs in and lands on the dashboard
1. Navigate to `loginUrl`. Sign in as `servicecenter` (env-resolved credentials). Click **`Sign in`**.
2. Assert: status text `Signed in — redirecting…` appears, then URL becomes `dashboardUrl`.
3. Assert: `#gate` is hidden; sidebar header shows `Pushpak Enterprises` / `Service Center`.
4. Assert: page title `h1#page-title` is `Dashboard`, sub-title `#page-sub` is `Welcome back`.
5. Assert: sidebar footer `#user-email` shows the signed-in email.
6. Assert: four stat cards render with labels `New Requests`, `In Progress`, `Technicians`, `Alerts`, and each value changes from `…` to an integer within 10 s.
7. Assert: panel `Getting started` is visible.
8. Reload the page. Assert: dashboard loads again without passing through the login page (session persisted).

### TC-04: Wrong role is rejected
1. Click **`Sign out`**. Sign in at `loginUrl` as `technician`.
2. Assert: login routes the technician to `CRMtechnician.html` (its own dashboard), not the service center page.
3. While still signed in as technician, navigate directly to `dashboardUrl`.
4. Assert: `#app` never becomes visible; URL becomes `loginUrl` within 5 s.
5. Assert: the technician session was signed out — reloading `loginUrl` shows the login form (it does not auto-route to `CRMtechnician.html`).

### TC-05: Deactivated center → `login.html?deactivated=1`
1. Set `serviceCenterProfiles/{deactivatedUid}.status = "INACTIVE"`.
2. Sign in at `loginUrl` with the deactivated center's credentials. (Login itself succeeds because login.html only checks `users.role`/`accessDisabled`; the redirect to the dashboard happens.)
3. Assert: on `dashboardUrl` the `#app` never becomes visible; URL becomes exactly `deactivatedUrl`.
4. Assert: login page shows the error box with `deactivatedBanner`.
5. Assert: the session is signed out (reload `loginUrl` without the query string → plain login form, no auto-redirect).
6. Restore `status = "ACTIVE"`. Sign in again. Assert: dashboard loads normally.

### TC-06: `accessDisabled` account is rejected
1. Set `users/{deactivatedUid}.accessDisabled = true`.
2. Sign in at `loginUrl` with that account.
3. Assert: login page itself shows `Your account has been deactivated. Contact your admin if you believe this is a mistake.` and stays on `/crm/login.html`.
4. With the session from TC-03 still alive in a second tab for that same account (if available), set the flag and reload `dashboardUrl` → Assert: redirect to `loginUrl` (plain, no `?deactivated=1`) and `#app` never visible.
5. Restore `accessDisabled = false`.

### TC-07: Sign out
1. Signed in as `servicecenter` on `dashboardUrl`, click **`Sign out`** (`#logout-btn`).
2. Assert: URL becomes `loginUrl`.
3. Navigate back to `dashboardUrl` (browser Back and direct URL both).
4. Assert: redirected to `loginUrl`; no dashboard content visible.

### TC-08: Negative & edge cases
- User doc missing: an Auth user with no `users/{uid}` document opening `dashboardUrl` → redirected to `loginUrl`; login page shows `Your account has no role assigned yet. Contact your admin.` when signing in.
- Profile lookup failure is non-fatal: if `serviceCenterProfiles/{uid}` read is denied/offline, the console shows a warning starting `Account-status check skipped:` and the dashboard still loads (role check already passed). Verify with emulator rules temporarily denying that read, or skip and mark N/A.
- Deep-linking with a hash or query (`dashboardUrl + "?x=1"`) while signed out → still redirected to `loginUrl`.

## Assertions
- [ ] Signed-out visit never renders `#app`; redirects to `/crm/login.html`.
- [ ] `servicecenter` login lands on `CRMservicecenter.html` with title `Dashboard` / `Welcome back`.
- [ ] Wrong role (technician) opening the page is signed out and sent to `/crm/login.html`.
- [ ] `status = "INACTIVE"` center is sent to `/crm/login.html?deactivated=1` and sees the deactivated banner.
- [ ] `accessDisabled = true` account cannot get past login.
- [ ] `Sign out` ends the session; Back button does not restore the dashboard.
- [ ] Test-account flags are restored at the end of the run.
- [ ] No console errors in DevTools at any step (the expected `Login failed:` error in TC-02 and the `Account-status check skipped:` warning in TC-08 are allowed).
- [ ] No failed network requests (no 4xx/5xx) except the expected auth failure in TC-02.

## Screenshots required
- Gate overlay (`Checking your session…`) during TC-01
- Login page after signed-out redirect
- Dashboard initial load (TC-03 step 6)
- Login page with deactivated banner (TC-05 step 4)
- Login page after sign out

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
