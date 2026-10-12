# T090-crm-crmdealer-access-guard: Dealer portal access guard (signed-out, wrong role, disabled, sign-out)

| Field | Value |
|---|---|
| Route | `/crm/CRMdealer.html` |
| Source | `crm/CRMdealer.html` |
| Flow | Unauthenticated visit is redirected to the login wall; signed-in user with a different role is rejected |
| Requires auth | yes |
| Required role | dealer |
| Destructive | no |
| Estimated steps | 16 |

## Preconditions
- App running at `http://localhost:8080`
- **Run only against the Firebase emulator or a dedicated test project — never the live makwell-websiteandcrm data. Mark BLOCKED if traffic would reach the live project.** The page hardcodes `projectId: "makwell-websiteandcrm"` with no emulator switch; confirm in DevTools > Network that Firestore/Auth requests go to the emulator host (e.g. `localhost:8080`/`localhost:9099`) or a test project before continuing.
- Signed-in user role: `dealer` (credentials from env vars `QA_CRED_DEALER_USERNAME` / `QA_CRED_DEALER_PASSWORD`, sign-in at `/crm/login.html`).
- For TC-02: a second account whose `users/{uid}.role` is NOT `dealer` (e.g. `technician`), resolved by the runner from the credential map. If no such account exists, mark TC-02 BLOCKED (do not fabricate one in a live project).
- For TC-03: a test dealer account with `users/{uid}.accessDisabled = true` (emulator seed only). If unavailable, mark TC-03 BLOCKED.
- For TC-04: an Auth user with no `users/{uid}` document (emulator seed only).

## Test data
- `protectedUrl = "http://localhost:8080/crm/CRMdealer.html"`
- `loginUrl = "http://localhost:8080/crm/login.html"`
- `gateText = "Checking your session…"`
- Dealer credentials: env `QA_CRED_DEALER_USERNAME` / `QA_CRED_DEALER_PASSWORD` (never written into this file)

## Steps

### TC-01: Signed-out visit is redirected to login
1. Open a fresh browser context (no cookies / IndexedDB).
2. Navigate to `/crm/CRMdealer.html`.
3. Assert: before redirect, only the gate text `Checking your session…` is visible; the sidebar, `Dashboard` heading content and `Sign out` button are NOT visible (`#app` has `display:none`).
4. Assert: the browser lands on `/crm/login.html` within 5 s.
5. Assert: no dealer data (customer names, order IDs) appears in the DOM at any point.

### TC-02: Signed-in user with a different role is rejected
1. Sign in at `/crm/login.html` as the non-dealer role (e.g. `technician`).
2. Navigate directly to `/crm/CRMdealer.html`.
3. Assert: the page redirects to `/crm/login.html`.
4. Assert: the user is signed out (navigating back to that role's own portal page also redirects to login).
5. Assert: the dealer sidebar (`My Customers`, `My Orders`, `Account & Invoices`) was never displayed.

### TC-03: Disabled dealer account is rejected
1. Sign in as the dealer account with `accessDisabled = true`.
2. Navigate to `/crm/CRMdealer.html`.
3. Assert: redirect to `/crm/login.html` and the session is signed out.

### TC-04: Auth user with no `users/{uid}` profile
1. Sign in as the Auth-only user (no `users` doc).
2. Navigate to `/crm/CRMdealer.html`.
3. Assert: redirect to `/crm/login.html` and the session is signed out.

### TC-05: Happy path — dealer is admitted, then signs out
1. Sign in at `/crm/login.html` as `dealer` (env `QA_CRED_DEALER_USERNAME` / `QA_CRED_DEALER_PASSWORD`).
2. Navigate to `/crm/CRMdealer.html`.
3. Assert: gate disappears; page title is `Dealer — Pushpak Enterprises CRM`; `h1#page-title` is `Dashboard`; sub-title is `Welcome back`; sidebar role label is `Dealer`.
4. Assert: sidebar footer `#user-email` shows the signed-in dealer's email.
5. Assert: four stat cards `Customers`, `Orders Placed`, `Sales Logged`, `Open Enquiries` show numbers (not `…`) within 5 s.
6. Click **`Sign out`**.
7. Assert: redirect to `/crm/login.html`.
8. Navigate to `/crm/CRMdealer.html` again. Assert: redirected to `/crm/login.html` (session really ended).

### TC-06: Negative & edge cases
- Role check read fails (emulator: deny `users/{uid}` read via rules, or block Firestore in DevTools offline mode after sign-in then hard-reload): Assert redirect to `/crm/login.html`. Record whether the user remains signed in afterwards (source does NOT call `signOut` on this path — see defects; a redirect loop between login and dealer page is a FAIL).
- Browser Back after sign-out: Assert the dealer portal does not re-render cached data; it redirects to login.

## Assertions
- [ ] Signed-out visit never shows `#app` content; lands on `/crm/login.html`.
- [ ] Non-dealer, disabled and profile-less accounts are signed out and redirected.
- [ ] Dealer sees `Dashboard`, `Welcome back`, own email, four numeric stats.
- [ ] `Sign out` ends the session.
- [ ] No console errors in DevTools at any step (except the expected `Role check failed:` in TC-06).
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected.
- [ ] All Firebase traffic targets the emulator / test project.

## Screenshots required
- Page initial load (gate text)
- Login page after each rejection (TC-01..TC-04)
- Dealer dashboard after successful sign-in
- Login page after Sign out

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
