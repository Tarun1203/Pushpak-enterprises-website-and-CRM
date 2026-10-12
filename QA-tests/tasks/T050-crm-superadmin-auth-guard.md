# T050-crm-superadmin-auth-guard: Super Admin dashboard access guard

| Field | Value |
|---|---|
| Route | `/crm/CRMsuperadmin.html` |
| Source | `crm/CRMsuperadmin.html` (auth gate: `onAuthStateChanged` handler, ~lines 1124-1148; Sign out ~line 1150) |
| Flow | Unauthenticated visit / wrong role / disabled account are bounced to `login.html`; superadmin gets in; Sign out |
| Requires auth | yes |
| Required role | superadmin |
| Destructive | no |
| Estimated steps | 22 |

## Preconditions
- App running at `http://localhost:8080`
- Fresh browser context (no Firebase Auth session in IndexedDB) for TC-01.
- Credentials are resolved by the runner from `QA-tests/.qa-catalog/auth.local.json`. Super Admin: env `QA_CRED_SUPERADMIN_USERNAME` / `QA_CRED_SUPERADMIN_PASSWORD`. Wrong-role account: role `warehouse` (env `QA_CRED_WAREHOUSE_USERNAME` / `QA_CRED_WAREHOUSE_PASSWORD`). Never type literal credentials into this file or logs.
- TC-04 only: a third test account whose `users/{uid}` doc has `role: "superadmin"` and `accessDisabled: true` (role `superadmin-disabled` in the credential map). If that account is not in the map, mark TC-04 `BLOCKED`, not failed.
- Read-only task. It writes nothing to Firestore. Still, run only against the Firebase emulator or a dedicated test project, never the live makwell-websiteandcrm data, because signing in creates real Auth sessions.
- **Environment check (mandatory):** the page hard-codes `projectId: "makwell-websiteandcrm"` and has no `connect*Emulator` call in source. Before TC-02, open DevTools → Network. If requests go to `firestore.googleapis.com/.../projects/makwell-websiteandcrm` with no emulator or interception in place, STOP and report `BLOCKED: page targets live Firebase project`.

## Test data
- `routeUrl = "http://localhost:8080/crm/CRMsuperadmin.html"`
- `loginUrl = "http://localhost:8080/crm/login.html"`
- `gateText = "Checking your session…"`
- `superadminEmail` = value of env `QA_CRED_SUPERADMIN_USERNAME` (used only for the sidebar email assertion)

## Steps

### TC-01: Signed-out visit is redirected to login
1. In a fresh context, navigate to `routeUrl`.
2. Assert: before redirect, `#gate` shows `Checking your session…` and `#app` has `display:none`. Capture this only if it is observable.
3. Assert: within 10 s the URL ends with `/crm/login.html`.
4. Assert: the login page shows heading `CRM login` and the button **Sign in**.
5. Assert: no Super Admin content was rendered at any point. `#nav-container` never contained `.nav-item` elements and the text `Pushpak Enterprises` + `Super Admin` sidebar header was never visible.

### TC-02: Superadmin signs in and lands on the dashboard
1. On `loginUrl`, fill **Email** with `QA_CRED_SUPERADMIN_USERNAME` and **Password** with `QA_CRED_SUPERADMIN_PASSWORD`, then click **Sign in**.
2. Navigate to `routeUrl` if login does not already route there.
3. Assert: `#gate` is hidden and `#app` is visible.
4. Assert: `h1#page-title` text is `Dashboard` and `#page-sub` text is `Overview across brands and services`.
5. Assert: sidebar header shows `Pushpak Enterprises` / `Super Admin`, and `#user-email` text equals `superadminEmail`.
6. Assert: 13 dashboard tiles render with these labels, in order: `Pending Contact Enquiries`, `Pending Approvals`, `Pending RMA & Replacement`, `Pending Payments`, `Pending Claims`, `Pending Local Purchase Claims`, `Spare Request & Logistics`, `SLA Alerts`, `Service Tickets`, `Installation / Demo`, `Pending Dealer Orders`, `Brands`, `CRM Users`.
7. Assert: within 15 s every tile value is a number. It is not `…`, and it is not `—`. A `—` means `Dashboard stats failed`, so capture the console error.
8. Click the `CRM Users` tile. Assert: `#page-title` becomes `Users & Access`.

### TC-03: Wrong-role user is rejected and signed out
1. Click **Sign out** (`#logout-btn`). Assert: URL ends with `/crm/login.html`.
2. Sign in as role `warehouse`.
3. Navigate directly to `routeUrl`.
4. Assert: within 10 s the URL ends with `/crm/login.html`.
5. Assert: the Firebase session was signed out. Navigating to `routeUrl` again redirects to login again and never shows `#app`.
6. Assert: the Super Admin sidebar was never visible.

### TC-04: Disabled superadmin account is rejected
1. Sign in as role `superadmin-disabled` (or mark `BLOCKED`, see Preconditions).
2. Navigate to `routeUrl`.
3. Assert: redirect to `/crm/login.html` within 10 s and `#app` never becomes visible.

### TC-05: Sign out
1. Sign in as superadmin and open `routeUrl`.
2. Click **Sign out**.
3. Assert: URL ends with `/crm/login.html`.
4. Press browser Back. Assert: the dashboard does not render; the page redirects to login again.

### TC-06: Negative & edge cases
- Navigate to `routeUrl#users` while signed out. Assert: redirect to login, and the hash does not bypass the gate.
- Signed in as superadmin, reload `routeUrl` 3 times. Assert: each load lands on `Dashboard` with no console error `Role check failed:`.

## Assertions
- [ ] Signed-out visit redirects to `/crm/login.html`.
- [ ] Wrong role (`warehouse`) redirects to `/crm/login.html` and is signed out.
- [ ] `accessDisabled: true` superadmin redirects to `/crm/login.html`.
- [ ] Superadmin sees `Dashboard` / `Overview across brands and services` and 13 numeric tiles.
- [ ] Sign out returns to login, and Back does not re-show the dashboard.
- [ ] No console errors in DevTools at any step. Allowed exception: none.
- [ ] No failed network requests (no 4xx/5xx) except Firestore `permission-denied` for the wrong-role user in TC-03.

## Screenshots required
- Login page after the TC-01 redirect
- Dashboard initial load (TC-02 step 7)
- Login page after the TC-03 wrong-role redirect
- Login page after sign out (TC-05)

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
