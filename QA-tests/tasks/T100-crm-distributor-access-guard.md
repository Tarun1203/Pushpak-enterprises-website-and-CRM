# T100-crm-distributor-access-guard: Distributor portal access guard (signed-out, wrong role, disabled, sign out)

| Field | Value |
|---|---|
| Route | `/crm/CRMdistributor.html` |
| Source | `crm/CRMdistributor.html` (lines 319-350: `onAuthStateChanged` guard, `ALLOWED_ROLE = 'distributor'`, `accessDisabled` check, `logout-btn`) |
| Flow | Unauthenticated visit is redirected to the login wall; signed-in user with a different role is rejected |
| Requires auth | yes |
| Required role | distributor |
| Destructive | no |
| Estimated steps | 16 |

## Preconditions
- App running at `http://localhost:8080`
- **Run only against the Firebase emulator or a dedicated test project — never the live makwell-websiteandcrm data. Mark BLOCKED if traffic would reach the live project.** The page hardcodes `projectId: "makwell-websiteandcrm"` and has no emulator switch, so before starting, confirm in DevTools > Network that Firestore/Auth requests go to the emulator host or the test project. If they go to `firestore.googleapis.com` / `identitytoolkit.googleapis.com` for `makwell-websiteandcrm`, stop and mark the whole task BLOCKED.
- Distributor account: sign in at `/crm/login.html` with env vars `QA_CRED_DISTRIBUTOR_USERNAME` / `QA_CRED_DISTRIBUTOR_PASSWORD`. Its `users/{uid}` doc has `role: "distributor"` and `accessDisabled` absent or `false`.
- Wrong-role account (TC-02): a `dealer`-role account resolved via `QA-tests/.qa-catalog/auth.local.json` (role `dealer`). If none is configured, mark TC-02 BLOCKED. Do not borrow a live user.
- Disabled account (TC-03): a test distributor whose `users/{uid}.accessDisabled === true` (emulator seed). If none is seeded, mark TC-03 BLOCKED.
- Never write credentials into this file or into run notes.

## Test data
- `routeUrl = "http://localhost:8080/crm/CRMdistributor.html"`
- `loginUrl = "http://localhost:8080/crm/login.html"`
- `gateText = "Checking your session…"`
- `sidebarRoleLabel = "Distributor"`

## Steps

### TC-01: Signed-out visit is redirected to the login page
1. Open a fresh browser profile (or clear site data for `localhost:8080`, including IndexedDB `firebaseLocalStorageDb`).
2. Navigate to `routeUrl`.
3. Assert: until the auth check finishes, only the `#gate` overlay with text `Checking your session…` is visible. `#app` is `display:none`, so no sidebar, no `Dashboard` heading, and no stat cards are visible.
4. Assert: within 5 s the browser is at `loginUrl`.
5. Assert: no Firestore read of `users/*`, `distributorCustomers`, `distributorOrders`, etc. succeeded during the visit. In Network, the only Firestore traffic is none, or it is denied.

### TC-02: Signed-in user with the wrong role is rejected and signed out
1. At `loginUrl`, sign in as the `dealer`-role test account.
2. Navigate directly to `routeUrl`.
3. Assert: the `#gate` overlay shows `Checking your session…`. The distributor sidebar (`Pushpak Enterprises` / `Distributor`) never becomes visible.
4. Assert: the browser is redirected to `loginUrl`.
5. Navigate to `routeUrl` again. Assert: you are redirected to `loginUrl` again, which proves the user was signed out (`signOut(auth)` ran) and not merely redirected.
6. Record whether the login page shows any message explaining the rejection. Expected per source: none. Log as an observation, not a failure.

### TC-03: Distributor with `accessDisabled: true` is rejected
1. Sign in at `loginUrl` as the disabled test distributor.
2. Navigate to `routeUrl`.
3. Assert: redirected to `loginUrl`, and the `#app` content never renders.
4. Navigate to `routeUrl` again. Assert: redirected again, because the session was signed out.

### TC-04: Happy path, distributor gets in
1. Sign in at `loginUrl` with `QA_CRED_DISTRIBUTOR_USERNAME` / `QA_CRED_DISTRIBUTOR_PASSWORD`.
2. Navigate to `routeUrl`.
3. Assert: `#gate` is hidden and `#app` is visible.
4. Assert: the sidebar header shows `Pushpak Enterprises` and the role label `Distributor`.
5. Assert: `#user-email` in the sidebar footer equals the signed-in email.
6. Assert: `#page-title` is `Dashboard` and `#page-sub` is `Welcome back`. The `Dashboard` nav item has class `active`.
7. Assert: four stat cards `Customers`, `Orders Placed`, `Sales Logged`, `Open Enquiries` each change from `…` to an integer (0 or more) within 5 s.

### TC-05: Sign out
1. While on the dashboard, click **`Sign out`** (`#logout-btn`).
2. Assert: redirected to `loginUrl`.
3. Press the browser Back button, or navigate to `routeUrl`. Assert: redirected to `loginUrl` again, and no distributor content flashes beyond the `#gate` overlay.

### TC-06: Negative and edge cases
- Users-doc read failure: in the emulator, temporarily deny `users/{uid}` reads for the distributor (or take the Firestore emulator offline after Auth has signed in), then load `routeUrl`. Expected per source (lines 335-338): the `Role check failed:` console error and a redirect to `login.html` **without** `signOut`. Then check whether `login.html` auto-forwards signed-in users back to the role page. If it does, the result is a redirect loop. Record the outcome. A loop is a defect.
- Distributor `users/{uid}` doc missing entirely, with an Auth account that has no Firestore profile: expect a redirect to `loginUrl`, and the user is signed out.

## Assertions
- [ ] Signed-out visit never shows `#app` and lands on `/crm/login.html`.
- [ ] A dealer-role user is signed out and redirected.
- [ ] An `accessDisabled: true` distributor is signed out and redirected.
- [ ] The distributor sees the sidebar, their own email, `Dashboard`, and four numeric stats.
- [ ] `Sign out` returns to login, and the route stays protected afterwards.
- [ ] No console errors at any step, except the expected `Role check failed:` in TC-06.
- [ ] No failed network requests (4xx/5xx), except Firestore permission denials that are expected for the rejected users.

## Screenshots required
- `#gate` overlay (`Checking your session…`)
- Login page after the signed-out redirect
- Login page after the wrong-role redirect
- Distributor dashboard after a successful sign-in
- Login page after Sign out

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
