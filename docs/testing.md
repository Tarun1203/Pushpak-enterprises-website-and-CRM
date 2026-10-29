# Testing

CI runs everything on every push to `main`, on a daily schedule, and on demand (`.github/workflows/automated-qa.yml`). The workflow is one job with many steps; most steps tolerate failure so the whole report is produced, then the last step fails the run if anything failed.

## Suites

| Suite | Run locally | Notes |
|---|---|---|
| Cloud Functions | `cd functions && npm test` | `node --test`, 205 tests, against an in-memory Firestore fake (`functions/testsupport/fakefs.js`) |
| Frontend units | `npm run test:unit` | `tests/unit/*.test.mjs`, 38 tests; needs `npm install` at the repo root (uses `linkedom`) |
| Browser (Playwright) | `npx playwright test` | `tests/e2e/`. Firebase is stubbed by `tests/e2e/support/firebase-stub.js`; sample data in `tests/e2e/support/sample-data.js` |
| Rules | Firebase emulator | `tests/emulator/`. **Runs only in CI** |
| Live CRM checks | CI only | Phases 2–5 sign in to the real site as the QA account |
| Accessibility | in the e2e suite | axe, WCAG 2.2 AA, every page |
| Regression gate | `scripts/qa/regression-summary.mjs` | Fails if any suite drops below `tests/regression-baseline.json` |
| Go-live gate | `scripts/qa/go-live-gate.mjs` | NO-GO / GO WITH KNOWN ISSUES / GO. Owner confirmations come from `docs/go-live-confirmations.json` |

After adding tests, raise the minimum counts in `tests/regression-baseline.json` and add a row to `tests/REGRESSION.md`.

## The live QA account

The live checks need the `QA_EMAIL`, `QA_PASSWORD` and `QA_ROLE=servicecenter` secrets and a valid `users/{uid}` record ([auth.md](auth.md)). If sign-in fails, the report now says why. `tests/e2e/support/qa-login.js` turns a bare timeout into one line such as `QA login failed: login page error "…" | likely fix: …`.

## Writing tests that stay green

- **Do not depend on today's weekday.** A closure range built from two independent "next Thursday" and "next Friday" lookups ended before it started when the suite ran on a Thursday. Derive related dates from one another.
- **Hidden fields need revealing.** Forms in the Service Center job modals (spare request, schedule, close) are `display:none` until a job action opens them, and Playwright's `fill()` waits for a visible field. Use `revealModals(page)` from `tests/e2e/support/reveal-modals.js` before typing into them, so the test does not need a job to exist on the QA account.
- **Keep "Loading…" text in the page.** Skeleton loaders are drawn by CSS over the text, so tests and screen readers still see it ([design.md](design.md)).
- New files under `crm/` need `git add -f`.

## Reading a failed run

See [debugging.md](debugging.md).
