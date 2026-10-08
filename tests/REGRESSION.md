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
| Vulnerable Cloud Functions dependencies | CI step "Dependency audit" (`npm audit --audit-level=high`) |

When you fix a new bug, add a test that fails without the fix, add a row here,
and raise the baseline.
