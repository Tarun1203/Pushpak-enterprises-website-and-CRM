# Debugging

Operating procedures live in [TROUBLESHOOTING.md](TROUBLESHOOTING.md) and [SOP.md](SOP.md). This page is the developer's playbook.

## A CI run failed: find out why

With the GitHub CLI (`gh auth login` once):

```bash
gh run list --limit 5
gh run view <run-id>                         # which step failed
gh run view <run-id> --log --job <job-id>    # full log (large; search it)
gh api repos/Tarun1203/Pushpak-enterprises-website-and-CRM/check-runs/<job-id>/annotations
```

The annotations list each failed test by name, so start there. Without the CLI, the same annotations are public through the GitHub API. Most steps are allowed to fail so the report completes; the last step, "Fail workflow when QA fails", is what turns the run red.

The first failure message is usually the cause; the rest are the same cause repeated.

## "QA login failed"

`tests/e2e/support/qa-login.js` prints the login page's own error plus a likely fix:

| Login page says | Meaning |
|---|---|
| Incorrect email or password | `QA_EMAIL` / `QA_PASSWORD` secrets do not match a Firebase Auth user |
| Your account has no role assigned yet | `users/{uid}` is missing, empty, or has no `role`. Check it in the Firestore console: an italic document with "This document has no data" is a placeholder with no fields |
| Unrecognized role | `role` holds a value `login.html` does not know; set `servicecenter` |
| Deactivated / disabled | `accessDisabled` / `disabledByAdmin` is set, or the center profile is `INACTIVE` |
| Could not verify your account | Reading `users/{uid}` failed: rules or network |
| Too many attempts | Firebase Auth rate limit |

## A website ticket does not show up

Open `publicServiceRequests/<ticket>` in the Firestore console:

| You see | Meaning |
|---|---|
| No such document | The browser never saved it: check the booking form and its rule |
| Document, no `routing` field | `routePublicServiceRequest` did not run: check the function is deployed and read its logs in Firebase → Functions |
| `routing.status: "manual"` + `reason` | Routing found no match. `pincode_not_in_master`, `no_center_covers_pincode`, `no_center_covers_district`, `brand_not_authorized`, `multiple_district_candidates`, `no_pincode`. Usually a data gap; route it by hand |
| `routing.status: "routed"` | Check `centerRequests/route_<ticket>` and that its `serviceCenterUid` matches the center's login uid |

A Service Center reads only `centerRequests`; Super Admin → Service also lists the original website tickets. If that page shows "Couldn't load service activity", one of its queries failed: open the browser console.

## Functions

```bash
cd functions && npm install && npm test         # unit tests, no Firebase needed
firebase emulators:start                        # auth 9099, firestore 8080, storage 9199
firebase functions:log --only routePublicServiceRequest
```

Deploying: see [DEPLOY-ROLLBACK.md](DEPLOY-ROLLBACK.md). If discovery times out on Windows: `$env:FUNCTIONS_DISCOVERY_TIMEOUT=60`.

## Frontend

- Open the browser console first. CRM pages log real errors there; the on-screen message is intentionally short.
- A button that "does nothing" twice may be the double-tap guard in `crm/resilience.js`.
- Skeleton or empty-state odd? `crm/ui.js` marks `.empty-row` cells whose text is only "Loading…" with `.is-loading`; see [design.md](design.md).
- Run a page against the Firebase stub: `npx playwright test tests/e2e/<spec>` (browsers: `npx playwright install`).

## Flaky tests

Suspect the calendar before the code. One test failed only on Thursdays because it computed two dates independently ([testing.md](testing.md)).
