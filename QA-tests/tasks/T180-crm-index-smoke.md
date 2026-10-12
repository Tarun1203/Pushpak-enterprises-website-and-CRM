# T180-crm-index-smoke: CRM entry — redirects to /crm/login.html

| Field | Value |
|---|---|
| Route | `/crm/index.html` |
| Source | `crm/index.html` |
| Flow | Smoke — CRM root immediately redirects to the login page |
| Requires auth | no |
| Required role | anonymous |
| Destructive | no |
| Estimated steps | 10 |

## Preconditions
- App running at `http://localhost:8080`
- anonymous (no Firebase session in the browser)
- `crm/login.html` exists

## Test data
- `entryUrls = ["http://localhost:8080/crm/index.html", "http://localhost:8080/crm/"]`
- `expectedTarget = "http://localhost:8080/crm/login.html"`

## Steps

### TC-01: Happy path — Redirect to login
1. Request `http://localhost:8080/crm/index.html` without following redirects. Assert: HTTP 200, `<title>` is `Pushpak Enterprises CRM`, and the body contains `<meta http-equiv="refresh" content="0; url=login.html">` and `window.location.replace('login.html')`.
2. Navigate to `http://localhost:8080/crm/index.html` in the browser.
3. Assert: within 2 s the URL is exactly `http://localhost:8080/crm/login.html` and the login page renders (HTTP 200, non-empty title, a sign-in form is visible).
4. Press browser **Back**. Assert: the browser does NOT return to `/crm/index.html` (`location.replace` leaves no history entry), so there is no redirect loop.
5. Navigate to `http://localhost:8080/crm/`. Assert: it ends on `/crm/login.html`.

### TC-02: Fallback link
1. With JavaScript disabled, load `/crm/index.html`. Assert: the meta refresh still lands on `/crm/login.html`. If the runner blocks meta refresh, assert the text `Redirecting to login…` is visible and the `login` link (`href="login.html"`) resolves to `/crm/login.html` with HTTP 200.

### TC-03: Phone width (375px)
1. At viewport 375 × 812, navigate to `/crm/index.html`. Assert: it redirects to `/crm/login.html`, and on login `document.documentElement.scrollWidth <= 375`.

## Assertions
- [ ] `/crm/index.html` and `/crm/` both end on `/crm/login.html`.
- [ ] No redirect loop; Back does not bounce through the redirect page.
- [ ] Fallback `login` link resolves (no 404).
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx).

## Screenshots required
- Final state (login page) after the redirect
- Login page at 375px

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
