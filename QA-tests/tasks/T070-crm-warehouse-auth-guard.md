# T070-crm-warehouse-auth-guard: Warehouse portal access guard (signed-out, wrong role, disabled, correct role)

| Field | Value |
|---|---|
| Route | `/crm/CRMwarehouse.html` |
| Source | `crm/CRMwarehouse.html` (guard: `onAuthStateChanged` block, `ALLOWED_ROLE = 'warehouse'`) |
| Flow | Unauthenticated visit is redirected to the login wall; signed-in user with a different role is rejected |
| Requires auth | no (TC-01 is anonymous; TC-02..TC-04 sign in) |
| Required role | anonymous |
| Destructive | no |
| Estimated steps | 22 |

## Preconditions
- App running at `http://localhost:8080`
- TC-01: anonymous (fresh browser context, no Firebase auth state in IndexedDB).
- TC-02: role `servicecenter` resolvable from `QA-tests/.qa-catalog/auth.local.json` (env `QA_CRED_SERVICECENTER_USERNAME` / `QA_CRED_SERVICECENTER_PASSWORD`).
- TC-03: role `warehouse` resolvable (env `QA_CRED_WAREHOUSE_USERNAME` / `QA_CRED_WAREHOUSE_PASSWORD`).
- TC-04 only: a second warehouse test account whose `users/{uid}` doc has `role: "warehouse"` and `accessDisabled: true`. Seed it in the emulator. Skip TC-04 if it is not seeded.
- No Firestore writes are made by this task. The page hardcodes `projectId: "makwell-websiteandcrm"`, so sign-ins hit whichever Auth backend the served build points at. Use test accounts only.

## Test data
- `warehouseUrl = "http://localhost:8080/crm/CRMwarehouse.html"`
- `loginUrl = "http://localhost:8080/crm/login.html"`
- `wrongRole = "servicecenter"` (its login lands on `CRMservicecenter.html`)
- `deepLink = "http://localhost:8080/crm/CRMwarehouse.html#requests-new"`

## Steps

### TC-01: Signed-out visit is redirected to login
1. In a fresh context, navigate to `warehouseUrl`.
2. Assert: while auth resolves, `#gate` is visible with text `Checking your session…` and `#app` has `display:none`.
3. Assert: within 10 s the URL becomes `loginUrl` (path ends `/crm/login.html`).
4. Assert: the login page shows heading `CRM login`, inputs `Email` and `Password`, and button **`Sign in`**.
5. Assert: no protected content was ever shown. `#app` never became visible, and the text `Spare Requests & Dispatch` and the sidebar label `Warehouse / Warehouse` never appeared in the visible DOM.
6. Navigate to `deepLink`. Assert: the same redirect to `loginUrl` happens.

### TC-02: Signed-in user with the wrong role is rejected
1. Navigate to `loginUrl`. Sign in as `servicecenter` (the runner resolves credentials; nothing is typed from this file).
2. Assert: you land on `/crm/CRMservicecenter.html`.
3. Navigate directly to `warehouseUrl`.
4. Assert: `#gate` (`Checking your session…`) shows, then within 10 s the URL is `loginUrl`.
5. Assert: the session was signed out. Navigate to `/crm/CRMservicecenter.html` again and it also redirects to `loginUrl`, because `signOut(auth)` ran before the redirect.
6. Assert: `#app` never became visible on the warehouse page.

### TC-03: Correct role (warehouse) is admitted
1. Navigate to `loginUrl`. Sign in as `warehouse`.
2. Assert: the URL becomes `/crm/CRMwarehouse.html`.
3. Assert: `#gate` is hidden and `#app` is visible.
4. Assert: the sidebar header shows `Pushpak Enterprises` and `Warehouse / Warehouse`. `#user-email` shows the signed-in account's email, which is non-empty and contains `@`.
5. Assert: `#page-title` = `Dashboard`, `#page-sub` = `Welcome back`, and the `Dashboard` nav item has class `active`.
6. Click **`Sign out`** (`#logout-btn`). Assert: the URL becomes `loginUrl`.
7. Navigate to `warehouseUrl` again. Assert: you are redirected to `loginUrl` (the session really ended).

### TC-04: Disabled warehouse account is rejected
1. Sign in with the `accessDisabled: true` warehouse account.
2. Navigate to `warehouseUrl`.
3. Assert: you are redirected to `loginUrl`, `#app` never becomes visible, and the session is signed out (same check as TC-02 step 5).

### TC-05: Negative & edge cases
- **Missing profile doc:** sign in with an Auth user that has no `users/{uid}` doc. Expected: redirect to `loginUrl` and sign-out (the `!roleSnap.exists()` branch).
- **Role read fails (offline after auth):** sign in as `warehouse`, then go offline in DevTools and reload `warehouseUrl`. Expected: the console logs `Role check failed:` and the page redirects to `login.html`. It must not show `#app`.
- **Back button after sign out:** after TC-03 step 6, press Back. Expected: the warehouse page shows `#gate`, then redirects to login. No cached dashboard tiles are shown.

## Assertions
- [ ] Anonymous visit redirects to `/crm/login.html`. `#app` is never visible.
- [ ] Wrong role (`servicecenter`) is signed out and redirected.
- [ ] `accessDisabled: true` is signed out and redirected.
- [ ] The warehouse role sees `#app`, the `Warehouse / Warehouse` header and the `Dashboard` title.
- [ ] **`Sign out`** ends the session.
- [ ] No console errors in DevTools at any step, except the expected `Role check failed:` in the TC-05 offline case.
- [ ] No failed network requests (no 4xx/5xx), except the expected offline failures in TC-05.

## Screenshots required
- `#gate` "Checking your session…" state
- Login page after the anonymous redirect
- Login page after the wrong-role redirect
- Warehouse dashboard after the correct-role sign-in

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
