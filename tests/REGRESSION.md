# Regression tests

Every push to `main` (and the scheduled run) re-runs **all** QA suites, then
one last step — **Regression gate** — gives a single verdict over all of them.

## How the gate works

1. Each suite writes a small results file to `qa-results/json/<step id>.json`
   (Node tests through `scripts/qa/node-json-reporter.mjs`, Playwright through
   its JSON reporter).
2. `scripts/qa/regression-summary.mjs` reads them all and compares with
   `tests/regression-baseline.json`. It fails if:
   - any test failed;
   - a suite produced **no results** (the step crashed or was skipped);
   - a suite ran **fewer tests** than its baseline (tests deleted, renamed out
     of the file pattern, or no longer found).
3. The table appears on the Actions run page (job summary) and in
   `qa-results/regression.md` inside the **pushpak-qa-report** artifact.
   Flaky tests (passed only on retry) are counted as passed but shown.

After **adding** tests, raise the baseline so they are protected too:

```
node scripts/qa/regression-summary.mjs --update   # after a full green run
```

(or edit the numbers in `tests/regression-baseline.json` by hand).

## Run locally

```
npm run test:unit:ci                       # frontend → qa-results/json/frontend_qa.json
cd functions && npm test                   # backend
PLAYWRIGHT_JSON_OUTPUT_FILE=qa-results/json/perf_qa.json \
  npx playwright test tests/e2e/performance.spec.js --reporter=list,json
node scripts/qa/regression-summary.mjs     # verdict over whatever ran
```

Locally, suites you did not run show as "no results" — that is expected.

## Bugs fixed, and the test that stops each one coming back

| Bug (fixed) | Guarded by |
|---|---|
| Anyone could read every product registration / ticket (names, addresses, phones) | `tests/emulator/rules.test.mjs` (public reads denied), `workflows.test.mjs` › security |
| Public lookups could be hammered | `workflows.test.mjs` › security (rate limit), `functions/lookup.test.js` |
| Customer could act as staff, or staff as customer | `tests/emulator/roles.test.mjs` |
| Technician's **first** leave request / document upload refused by rules | `rules.test.mjs` › "apply for leave", Aadhaar document rows |
| Technician could self-approve leave or self-verify a document | `rules.test.mjs` › "self-approve leave", "self-verify document" |
| Uploaded documents could be silently overwritten | `storage.test.mjs` › "uploaded documents are write-once" |
| Assignment check crashed on ticket updates (`event.data.ref`) | `workflows.test.mjs` › ticket lifecycle, `functions/flow.test.js` |
| Stored text could run as HTML/script (~360 places) | `tests/e2e/security.spec.js` (every role, every screen, portal) |
| Escaped text shown double-escaped (`&amp;amp;`) | `security.spec.js` › "not shown double-escaped" |
| Secrets / credential files committed | `tests/unit/secrets.test.mjs` |
| Broken local links, wrong file-name case, dead anchors | `tests/unit/links.test.mjs`, `tests/e2e/external-links.spec.js` |
| Query needing an undeclared Firestore index | `tests/unit/indexes.test.mjs` |
| CRM unusable on phones (no menu, zooming inputs, overflowing tables) | `tests/e2e/mobile.spec.js` |
| Layout breaking at tablet / desktop widths | `tests/e2e/responsive.spec.js` |
| 1 MB+ logo and oversized hero images | `performance.spec.js` › "right-sized images" |
| Dashboards downloading whole collections to count them | `performance.spec.js` › "no full history downloads on open" |
| 404 page scrolled sideways; home-page header overflowed on landscape phones | `tests/e2e/fit.spec.js` (every page × 10 screen sizes) |
| Pages stayed laptop-sized on big monitors/TVs | `fit.spec.js` (page scale and fill at 1920 / 2560 / 3840 px), styles in `assets/fit.css` |
| Portal registrations always got 12 months warranty, even on a 2-year plan (wrong in/out-of-warranty at intake and closure) | `functions/phase9.test.js` P9.2/P9.3, `customer.test.js` (plan → months), emulator `workflows.test.mjs` › phase 9 |
| Two registrations of one serial (same moment, dealer typing lower case, spaces) | `phase9.test.js` P9.2 "one registration per serial", emulator phase 9 test |
| Closure warranty verdict missed a registration that has no serial number (booking link ignored) | `phase9.test.js` P9.3 (JOB-W4) |
| Customer 360 ran hostile names as HTML; pasted "+91 …" phone cut off | `tests/e2e/customer360.spec.js` |
| Approved leave ignored when ranking technicians and when a center assigned one for a given day | `phase9b.test.js` P9.6 (matching + server assignment check) |
| Impossible dates such as 30 Feb accepted as appointment dates (rolled over to 2 Mar) | `phase9b.test.js` P9.7 |
| Re-assigning a booked appointment to a technician who is busy or on leave was not checked | `phase9b.test.js` P9.7 |
| Customer tracking kept only the latest appointment, not moves and cancellations | `phase9b.test.js` P9.7 (appointmentHistory) |
| Parts could be added to a finished or cancelled job | `phase9b.test.js` P9.9 |
| Duplicate open spare requests for one part on one job went unflagged | `phase9b.test.js` P9.9, emulator `workflows.test.mjs` › phase 9 spare requests |
| A late retry of the website request's trigger dragged a finished service's tracking back to its first state | `phase9c.test.js` P9.18 (replaying triggers of a finished run changes nothing) |
| Customer 360 had no single chronological timeline (routing, assignment, appointment, spare, billing, closure, feedback) | `phase9c.test.js` P9.13, `customer360.spec.js`, emulator phase 9 timeline test |
| Appointment missed, no technician for a day, unrouted request, job stuck waiting for a spare: nobody was told | `phase9c.test.js` P9.16 (`escalationSweep`) |
| A business ID used twice (request, job, spare request, return, claim, registration, order) went unnoticed | `phase9c.test.js` P9.15, emulator phase 9 timeline test |
| A technician could write the server's own markers (`lifecycleRejected`, `scheduleRejected`, `assignmentRejected`, `escalation`, `idCheck`) on a service job | `firestore.rules`, `rules_qa` |
| A suspended / terminated technician or an inactive service center could still read and write data directly (only the web page turned them away) | `functions/phase10a.test.js` P10.2 (account switch-off), `rules.test.mjs` › "switched-off accounts", `phase10-roles.spec.js` |
| Head Office had no way to switch any account off | `users/{uid}.disabledByAdmin` → `syncAccess_users`, `phase10a.test.js` P10.2 |
| Technician working hours, breaks, days off, service-center closures and the daily job limit were stored but never enforced when booking | `phase10a.test.js` P10.5 |
| A spare part for one brand could be fitted on another brand's job | `phase10a.test.js` P10.3 |
| The same spare part, model, product, category, brand or active warranty plan could be created twice | `phase10a.test.js` P10.4 (`checkMasterIntegrity_*`) |
| Vulnerable Cloud Functions dependencies | CI step "Dependency audit" (`npm audit --audit-level=high`) |

When you fix a new bug, add a test that fails without the fix, add a row here,
and raise the baseline.
