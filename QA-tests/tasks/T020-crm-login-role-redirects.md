# T020-crm-login-role-redirects: CRM login — each role signs in and lands on its dashboard

| Field | Value |
|---|---|
| Route | `/crm/login.html` |
| Source | `crm/login.html` |
| Flow | Fill and submit form "login-form" (2 fields) → `routeAfterLogin` → `ROLE_REDIRECTS[role]` |
| Requires auth | no (page is public; the task signs in as each role) |
| Required role | anonymous |
| Destructive | no |
| Estimated steps | 52 |

## Preconditions
- App running at `http://localhost:8080`
- Start anonymous: no Firebase Auth session in the browser profile (clear site data for `localhost:8080` before TC-01 and between TCs, or run TC-09 sign-out between them).
- Run only against the Firebase emulator or a dedicated test project — never the live makwell-websiteandcrm data.
- Note: `crm/login.html` hardcodes `projectId: "makwell-websiteandcrm"` and has no `connectAuthEmulator` / `connectFirestoreEmulator` call. The runner MUST serve a build pointed at the test project or emulator (for example by injecting an emulator shim). If the page cannot be pointed away from the live project, STOP and mark the task BLOCKED — do not sign in against live data.
- Port note: the Firestore emulator defaults to port 8080, which collides with the dev server at `http://localhost:8080`. Run the Firestore emulator on a different port (for example 8081).
- Seeded fixtures (Auth user + `users/{uid}` doc each, `accessDisabled` absent or `false`):

| Role | Credentials env vars | `users/{uid}` doc |
|---|---|---|
| superadmin | `QA_CRED_SUPERADMIN_USERNAME` / `QA_CRED_SUPERADMIN_PASSWORD` | `{ role: "superadmin", displayName: "QA-AUTO Superadmin", phone: "9000000001", city: "Raichur", state: "Karnataka", pincode: "584101" }` |
| warehouse | `QA_CRED_WAREHOUSE_USERNAME` / `QA_CRED_WAREHOUSE_PASSWORD` | `{ role: "warehouse", displayName: "QA-AUTO Warehouse", phone: "9000000002", … }` |
| servicecenter | `QA_CRED_SERVICECENTER_USERNAME` / `QA_CRED_SERVICECENTER_PASSWORD` | `{ role: "servicecenter", displayName: "QA-AUTO Service Center", phone: "9000000003", … }` (service-center status active) |
| technician | `QA_CRED_TECHNICIAN_USERNAME` / `QA_CRED_TECHNICIAN_PASSWORD` | `{ role: "technician", displayName: "QA-AUTO Technician", phone: "9000000004", … }` (employment status active) |
| dealer | `QA_CRED_DEALER_USERNAME` / `QA_CRED_DEALER_PASSWORD` | `{ role: "dealer", displayName: "QA-AUTO Dealer", phone: "9000000005", … }` |
| distributor | `QA_CRED_DISTRIBUTOR_USERNAME` / `QA_CRED_DISTRIBUTOR_PASSWORD` | `{ role: "distributor", displayName: "QA-AUTO Distributor", phone: "9000000006", … }` |
| customer | `QA_CRED_CUSTOMER_USERNAME` / `QA_CRED_CUSTOMER_PASSWORD` | `{ role: "customer", displayName: "QA-AUTO Customer", phone: "9000000007", … }` |

All fixture emails MUST be on a fake domain (for example `qa-auto-<role>@example.test`). Never write the literal values into this file; read them from the env vars at run time.

## Test data
- `email` = value of `QA_CRED_<ROLE>_USERNAME` for the role under test
- `password` = value of `QA_CRED_<ROLE>_PASSWORD` for the role under test
- Expected landing page per role (from `ROLE_REDIRECTS` in `crm/login.html`):

| Role | Landing URL | Landing `<title>` |
|---|---|---|
| superadmin | `/crm/CRMsuperadmin.html` | `Super Admin — Pushpak Enterprises CRM` |
| warehouse | `/crm/CRMwarehouse.html` | `Warehouse / Warehouse — Pushpak Enterprises CRM` |
| servicecenter | `/crm/CRMservicecenter.html` | `Service Center — Pushpak Enterprises CRM` |
| technician | `/crm/CRMtechnician.html` | `Technician — Pushpak Enterprises CRM` |
| dealer | `/crm/CRMdealer.html` | `Dealer — Pushpak Enterprises CRM` |
| distributor | `/crm/CRMdistributor.html` | `Distributor — Pushpak Enterprises CRM` |
| customer | `/portal.html` | `My Account — Pushpak Enterprises` |

## Steps

### TC-01: Page renders for an anonymous visitor
1. Navigate to `http://localhost:8080/crm/login.html`.
2. Assert: document title is `Pushpak Enterprises CRM — Login`.
3. Assert: tag text `Pushpak Enterprises` and heading `CRM login` are visible; logo image with alt `Pushpak Enterprises` is visible.
4. Assert: input `#email` (placeholder `Email`, type `email`) and input `#password` (placeholder `Password`, type `password`) are visible and empty.
5. Assert: link `Forgot password?` is visible; button `Sign in` is visible and enabled.
6. Assert: `#error-msg` and `#status-msg` are hidden (no `show` class).
7. Assert: link `← Back to Pushpak Enterprises` and links `Privacy`, `Terms`, `Cookies` are visible.
8. Assert: no `🐞 Report Bug` button is present (anonymous visitor).
9. Assert: the page stays on `/crm/login.html` for 3 s (no auto-redirect when signed out).

### TC-02 … TC-08: Happy path — sign in as `<role>` and land on its dashboard
Run the following steps once per role, in this order: TC-02 superadmin, TC-03 warehouse, TC-04 servicecenter, TC-05 technician, TC-06 dealer, TC-07 distributor, TC-08 customer.
1. Ensure signed out (clear site data). Navigate to `http://localhost:8080/crm/login.html`.
2. Fill `#email` with `QA_CRED_<ROLE>_USERNAME`.
3. Fill `#password` with `QA_CRED_<ROLE>_PASSWORD`.
4. Click **`Sign in`**.
5. Assert: immediately after the click the button is disabled and its text is `Signing in…`.
6. Assert: `#status-msg` shows `Signed in — redirecting…` (it can be brief; capture it via a DOM text wait or screenshot before navigation).
7. Assert: the browser navigates to the landing URL for the role from the Test data table, and the document title equals the landing `<title>`.
8. Assert: the landing page does NOT bounce back to `/crm/login.html` within 5 s (its own auth gate accepts the role).
9. Assert: exactly one `GET`/`Listen` read of Firestore `users/{uid}` occurred from the login page and no request returned 4xx/5xx.
10. Sign out (use the dashboard's sign-out control, or clear site data) before the next role.

### TC-09: Session persists after reload
1. Sign in as superadmin (TC-02 steps 1–7).
2. Reload `/crm/CRMsuperadmin.html`.
3. Assert: the page stays on `/crm/CRMsuperadmin.html` (session persisted) and title is `Super Admin — Pushpak Enterprises CRM`.
4. Sign out and clear site data.

### TC-10: Email is trimmed before sign-in
1. Signed out. Navigate to `/crm/login.html`.
2. Fill `#email` with two leading spaces + `QA_CRED_DEALER_USERNAME` + two trailing spaces; fill `#password` with `QA_CRED_DEALER_PASSWORD`.
3. Click **`Sign in`**.
4. Assert: the browser lands on `/crm/CRMdealer.html` (the browser's email sanitisation and the `.trim()` in the submit handler remove the spaces). If native validation blocks the submit instead, record it as a finding with a screenshot.

### TC-11: Pressing Enter submits the form
1. Signed out. Navigate to `/crm/login.html`.
2. Fill `#email` with `QA_CRED_DISTRIBUTOR_USERNAME`, fill `#password` with `QA_CRED_DISTRIBUTOR_PASSWORD`, press **Enter** while focus is in `#password`.
3. Assert: lands on `/crm/CRMdistributor.html`.

### TC-12: Double-tap guard on Sign in
1. Signed out. Navigate to `/crm/login.html`. Fill valid technician credentials.
2. Click **`Sign in`** twice within 300 ms.
3. Assert: exactly one `signInWithPassword` (identitytoolkit `accounts:signInWithPassword`) request is sent; lands on `/crm/CRMtechnician.html`; no error is shown.

## Assertions
- [ ] Title `Pushpak Enterprises CRM — Login`, heading `CRM login`, both inputs, `Forgot password?`, and `Sign in` render for anonymous visitors.
- [ ] Each of the 7 roles lands on exactly the URL in `ROLE_REDIRECTS` (customer → `/portal.html`).
- [ ] Button switches to disabled `Signing in…` during sign-in.
- [ ] `Signed in — redirecting…` status appears before navigation.
- [ ] No landing page bounces back to the login page.
- [ ] No `🐞 Report Bug` button while anonymous.
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected.

## Screenshots required
- Page initial load (TC-01)
- `Signing in…` button state (one role)
- Each role's landing page (TC-02 … TC-08)
- Final state after the happy path (customer on `/portal.html`)

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
