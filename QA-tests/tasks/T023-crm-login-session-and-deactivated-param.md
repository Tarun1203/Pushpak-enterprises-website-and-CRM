# T023-crm-login-session-and-deactivated-param: CRM login — already-signed-in auto-redirect and `?deactivated=1`

| Field | Value |
|---|---|
| Route | `/crm/login.html` |
| Source | `crm/login.html` (`onAuthStateChanged` handler; `deactivated` query param) |
| Flow | Returning signed-in user is routed straight to the dashboard; dashboards bounce deactivated accounts to `?deactivated=1` |
| Requires auth | no (page is public; TCs start signed in where stated) |
| Required role | anonymous |
| Destructive | no |
| Estimated steps | 34 |

## Preconditions
- App running at `http://localhost:8080`
- Run only against the Firebase emulator or a dedicated test project — never the live makwell-websiteandcrm data.
- `crm/login.html` hardcodes the live `makwell-websiteandcrm` config with no emulator hook; the runner MUST point the page at the emulator/test project first, or mark the task BLOCKED. Run the Firestore emulator on a port other than 8080.
- Seeded fixtures (see T020 / T022 for the doc shapes): superadmin (`QA_CRED_SUPERADMIN_*`), servicecenter (`QA_CRED_SERVICECENTER_*`), customer (`QA_CRED_CUSTOMER_*`), accessDisabled technician (`QA_CRED_DEACTIVATED_*`).
- Fixture for TC-06: `QA_CRED_SUSPENDEDSC_USERNAME` / `QA_CRED_SUSPENDEDSC_PASSWORD` — a service-center user whose `users/{uid}` has `role: "servicecenter"`, `accessDisabled` absent, `displayName: "QA-AUTO Suspended SC"`, `phone: "9000000014"`, `city: "Raichur"`, `state: "Karnataka"`, `pincode: "584101"`, and whose service-center record is set to a deactivated/suspended status so that `CRMservicecenter.html`'s auth gate redirects to `login.html?deactivated=1`.

## Test data
- `deactivatedMsg` = `Your account has been deactivated. Contact your admin if you believe this is a mistake.`
- Query variants: `?deactivated=1`, `?deactivated=0`, `?deactivated=true`, `?deactivated=1&foo=bar`, `?deactivated=%3Cb%3Ex%3C%2Fb%3E`

## Steps

### TC-01: Already signed in → auto-redirect without submitting
1. Clear site data. Sign in as superadmin through `/crm/login.html`; assert landing on `/crm/CRMsuperadmin.html`.
2. In the same tab, navigate to `http://localhost:8080/crm/login.html`.
3. Assert: without any click, `#status-msg` shows `Signed in — redirecting…` and the browser lands on `/crm/CRMsuperadmin.html` within 5 s.
4. Assert: `#email` / `#password` were never filled and no identitytoolkit `signInWithPassword` request was sent in step 2–3.

### TC-02: Already signed in as customer → portal
1. Sign out / clear site data. Sign in as customer via `/crm/login.html`; assert landing on `/portal.html`.
2. Navigate to `/crm/login.html`.
3. Assert: auto-redirect to `/portal.html` (title `My Account — Pushpak Enterprises`).

### TC-03: Signed in + new tab
1. While signed in as servicecenter, open `http://localhost:8080/crm/login.html` in a new tab.
2. Assert: the new tab auto-redirects to `/crm/CRMservicecenter.html`.

### TC-04: `?deactivated=1` while signed out
1. Clear site data. Navigate to `http://localhost:8080/crm/login.html?deactivated=1`.
2. Assert: `#error-msg` is visible on load with text exactly `deactivatedMsg`.
3. Assert: inputs are empty and enabled; `Sign in` is enabled; no redirect occurs within 3 s.
4. Sign in as superadmin. Assert: the error clears on submit and the browser lands on `/crm/CRMsuperadmin.html`. Sign out.

### TC-05: Other `deactivated` values do not show the message
For each variant, clear site data, navigate to `/crm/login.html<variant>`, and assert:

| Variant | `#error-msg` |
|---|---|
| `?deactivated=0` | hidden |
| `?deactivated=true` | hidden (only the exact value `1` triggers it) |
| `?deactivated=1&foo=bar` | visible, `deactivatedMsg` |
| `?deactivated=%3Cb%3Ex%3C%2Fb%3E` | hidden; no `<b>` element rendered anywhere on the page |

### TC-06: Dashboard bounces a suspended service center to `?deactivated=1` — no redirect loop
1. Clear site data. Navigate to `/crm/login.html`. Sign in with `QA_CRED_SUSPENDEDSC_*`.
2. Record the full navigation sequence for 15 s (DevTools Network "Preserve log", Doc filter).
3. Assert: the sequence ends on `/crm/login.html?deactivated=1` with `#error-msg` = `deactivatedMsg` visible and stable.
4. Assert: there are at most 3 document navigations total (login → CRMservicecenter → login?deactivated=1). If the page keeps alternating between `/crm/CRMservicecenter.html` and `/crm/login.html?deactivated=1` (because the login page's `onAuthStateChanged` sees a still-signed-in user whose `users` doc has no `accessDisabled`), mark FAIL as a redirect-loop bug and attach the navigation log.
5. Reload `/crm/login.html`. Assert: no auto-redirect (the user was signed out by the dashboard gate).

### TC-07: `accessDisabled` user arriving with `?deactivated=1` while still signed in
1. Using the emulator/test project admin tools, sign in as `QA_CRED_DEACTIVATED_*` in a way that leaves an Auth session (for example sign in with `accessDisabled: false`, then set `accessDisabled: true` on the doc).
2. Navigate to `/crm/login.html?deactivated=1`.
3. Assert: `#error-msg` shows `deactivatedMsg`; the browser stays on `/crm/login.html`; after ≤ 5 s the session is signed out (reload shows no auto-redirect).
4. Reset the fixture to `accessDisabled: true`.

### TC-08: Back button after sign-in
1. Sign in as superadmin from `/crm/login.html`; land on `/crm/CRMsuperadmin.html`.
2. Press browser **Back**.
3. Assert: the login page auto-redirects to `/crm/CRMsuperadmin.html` again (user is still signed in) and does not show the login form as usable for more than 5 s.

## Assertions
- [ ] Signed-in users opening `/crm/login.html` are routed to their `ROLE_REDIRECTS` page without submitting.
- [ ] `?deactivated=1` shows exactly `Your account has been deactivated. Contact your admin if you believe this is a mistake.`; other values do not.
- [ ] The query string is never rendered as HTML.
- [ ] No redirect loop between a dashboard and `login.html?deactivated=1`.
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected.

## Screenshots required
- Page initial load with `?deactivated=1`
- `Signed in — redirecting…` auto-redirect state (TC-01)
- Final state of TC-06 (with the navigation log)
- Final state after the happy path (TC-04 superadmin dashboard)

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
