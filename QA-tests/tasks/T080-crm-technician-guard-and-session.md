# T080-crm-technician-guard-and-session: Technician portal access guard, role rejection, deactivation and sign-out

| Field | Value |
|---|---|
| Route | `/crm/CRMtechnician.html` |
| Source | `crm/CRMtechnician.html` (guard: `onAuthStateChanged` handler, lines ~493-546) |
| Flow | Unauthenticated visit is redirected to the login wall; signed-in user with a different role is rejected; deactivated technician is bounced; Sign out |
| Requires auth | yes |
| Required role | technician |
| Destructive | no (TC-04/TC-05 need seeded account-state changes — emulator only) |
| Estimated steps | 26 |

## Preconditions
- App running at `http://localhost:8080`.
- **Run only against the Firebase emulator or a dedicated test project — never the live makwell-websiteandcrm data. Mark BLOCKED if traffic would reach the live project.** The page hardcodes `projectId: "makwell-websiteandcrm"` with no emulator switch. Before TC-01, open DevTools > Network and confirm Firestore/Auth traffic goes to the emulator host (e.g. `localhost:8080`/`localhost:9099`) or a test project. If requests go to `firestore.googleapis.com` for project `makwell-websiteandcrm`, stop and mark every TC BLOCKED.
- Sign-in is done at `/crm/login.html` with the credentials in env vars `QA_CRED_TECHNICIAN_USERNAME` / `QA_CRED_TECHNICIAN_PASSWORD` (resolved by the runner; never typed into this file).
- Seed (emulator):
  - `users/{techUid}` with `role: "technician"`, `accessDisabled` absent/false; a `centerTechnicians` doc with `technicianUid == techUid` and `employmentStatus: "ACTIVE"`.
  - For TC-03: a second account with a non-technician role (e.g. `servicecenter` or `dealer`), credentials via `QA_CRED_<ROLE>_USERNAME` / `QA_CRED_<ROLE>_PASSWORD`. If no such pair exists, mark TC-03 BLOCKED.
  - For TC-04: ability to set `users/{techUid}.accessDisabled = true` in the emulator (Emulator UI or admin script), then revert.
  - For TC-05: ability to set the technician's `centerTechnicians.employmentStatus` to `SUSPENDED`, then `TERMINATED`, then `RESIGNED`, and also `ON_LEAVE`; revert to `ACTIVE` afterwards.

## Test data
- `techUser` = env `QA_CRED_TECHNICIAN_USERNAME` / `QA_CRED_TECHNICIAN_PASSWORD`
- `otherRoleUser` = env `QA_CRED_SERVICECENTER_USERNAME` / `QA_CRED_SERVICECENTER_PASSWORD` (or any other non-technician role pair available)
- `blockedStatuses` = `SUSPENDED`, `TERMINATED`, `RESIGNED`
- `allowedNonActiveStatus` = `ON_LEAVE`
- `missingProfileUser` = an Auth account with no `users/{uid}` doc (optional; emulator only)

## Steps

### TC-01: Signed-out visit is redirected to the login page
1. Open a fresh browser context (no Firebase auth persisted in IndexedDB).
2. Navigate to `http://localhost:8080/crm/CRMtechnician.html`.
3. Assert: a full-screen gate with text `Checking your session…` is visible first; the sidebar, `Dashboard` heading and `Sign out` button are NOT visible.
4. Assert: within 5 s the browser URL ends with `/crm/login.html` (no query string).
5. Assert: at no point was the element `#app` displayed (`display:none` until redirect).

### TC-02: Happy path — technician signs in and lands on the Dashboard
1. Navigate to `/crm/login.html` and sign in as `technician` (env `QA_CRED_TECHNICIAN_USERNAME` / `QA_CRED_TECHNICIAN_PASSWORD`).
2. Navigate to `/crm/CRMtechnician.html` (if login did not already redirect there).
3. Assert: gate `Checking your session…` disappears; sidebar header shows `Pushpak Enterprises` / `Technician`.
4. Assert: topbar `<h1>` is `Dashboard`, sub-text `Welcome back`.
5. Assert: sidebar footer shows the signed-in email (equal to `QA_CRED_TECHNICIAN_USERNAME`).
6. Assert: stat cards `Assigned`, `In Progress`, `Completed` change from `…` to integers; `Alerts` shows `—` with hint `Module not built yet`.

### TC-03: Wrong role is rejected and signed out
1. Sign out (or use a fresh context). Sign in at `/crm/login.html` as the non-technician account (`otherRoleUser`).
2. Navigate to `/crm/CRMtechnician.html`.
3. Assert: the browser is redirected to `/crm/login.html` (no `?deactivated=1`).
4. Assert: the Firebase session is signed out — navigating again to `/crm/CRMtechnician.html` redirects to `/crm/login.html` again, and `/crm/login.html` shows the sign-in form (not an auto-forward to another dashboard).
5. Assert: technician content (`My Jobs`, `Spare Bag` nav items) was never shown.

### TC-04: `accessDisabled === true` is rejected
1. In the emulator set `users/{techUid}.accessDisabled = true`.
2. Sign in as `technician` and navigate to `/crm/CRMtechnician.html`.
3. Assert: redirected to `/crm/login.html` (source sends no `?deactivated=1` for this case — record the actual URL).
4. Assert: the user is signed out (re-visiting the route redirects again).
5. Revert `accessDisabled` to `false`.

### TC-05: Employment-status deactivation → `login.html?deactivated=1`
For each value in `blockedStatuses`:
1. In the emulator set the technician's `centerTechnicians.employmentStatus` to the value.
2. Sign in as `technician` at `/crm/login.html`, then navigate to `/crm/CRMtechnician.html`.
3. Assert: the browser URL is `/crm/login.html?deactivated=1`.
4. Assert: `/crm/login.html?deactivated=1` displays a deactivation notice (record its exact text in the run report; if no notice is shown, log as a defect).
5. Assert: the session is signed out (navigating back to `/crm/CRMtechnician.html` redirects to `/crm/login.html`).

Then:
6. Set `employmentStatus` to `ON_LEAVE`. Sign in and navigate to the route. Assert: Dashboard loads normally (On Leave is NOT a blocked status).
7. Revert `employmentStatus` to `ACTIVE`.

### TC-06: Sign out
1. Signed in as `technician` on the Dashboard, click **`Sign out`** in the sidebar footer.
2. Assert: URL becomes `/crm/login.html`.
3. Press browser Back. Assert: the route redirects to `/crm/login.html` again; no technician content renders.

### TC-07: Negative & edge cases
- Auth user with no `users/{uid}` doc (`missingProfileUser`): navigate to the route → redirected to `/crm/login.html` and signed out.
- With the Firestore emulator stopped after sign-in, reload the route → the `users/{uid}` read fails → page redirects to `/crm/login.html` WITHOUT signing out (source line ~533). Assert there is no infinite redirect loop between `login.html` and `CRMtechnician.html` (watch URL for 15 s). A loop is a defect.
- With `centerTechnicians` read denied/failing but role valid, the page loads (fails open) and console shows warning `Account-status check skipped:`. Record this as observed behaviour.

## Assertions
- [ ] Gate `Checking your session…` hides all app content until the guard passes.
- [ ] Signed-out → `/crm/login.html`.
- [ ] Non-technician role → signed out + `/crm/login.html`.
- [ ] `accessDisabled: true` → signed out + `/crm/login.html`.
- [ ] `SUSPENDED` / `TERMINATED` / `RESIGNED` → signed out + `/crm/login.html?deactivated=1`.
- [ ] `ON_LEAVE` → allowed in.
- [ ] `Sign out` returns to `/crm/login.html` and the session is gone.
- [ ] No console errors in DevTools at any step (except the expected `Role check failed:` in the TC-07 offline case).
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected (permission-denied reads for wrong-role users).

## Screenshots required
- Gate `Checking your session…`
- Login page after signed-out redirect
- Login page with `?deactivated=1` notice
- Dashboard after successful technician sign-in

## Pass criteria
All TCs above pass AND no unexpected console/network errors AND no traffic reached the live `makwell-websiteandcrm` project.
