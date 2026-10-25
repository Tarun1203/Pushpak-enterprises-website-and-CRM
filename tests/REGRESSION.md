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
| Nothing could be printed or sent: warranty card, service voucher, claim voucher and dispatch challan did not exist, and the invoice had no paper size | `functions/phase10b.test.js` P10.8/P10.9, `phase10-field.spec.js` (A4/A5/A6/thermal PDFs, 320px phone, toolbar) |
| Technician ranking and stock rules (leave, suspension, brand, skills, negative stock, per-owner isolation) had no readiness check | `functions/phase10b.test.js` P10.6/P10.7 |
| Only Chrome was ever tested | `browsers.spec.js` on Chrome, Firefox, Safari engine, Android, iPhone, iPad (CI step "Browser compatibility QA") |
| An error, a lost connection or a double tap on Save gave a blank page, a silent failure or a double save | `crm/resilience.js`, `phase10c.test.js` P10.13/P10.17, `browsers.spec.js` |
| Nobody could see who created, approved, dispatched or closed a job, claim, spare request, order or invoice | `audit.js` WORKFLOW, `phase10c.test.js` P10.15 |
| A technician was not told when the center assigned a job or set an appointment; centers and requesters were not told about completion, spare decisions or claim approval | `notify.js`, `phase10c.test.js` P10.16 |
| No go / no-go decision, backup, rollback, monitoring, UAT, SOP or training documents | `docs/`, `scripts/qa/go-live-gate.mjs`, `phase10c.test.js` P10.18-24 |
| Customer website redesign broke hub tiles, hash deep links, wizard forms, service timeline or phone layout | `ui-customer.spec.js`, `mobile.spec.js` |
| CRM redesign broke the dashboard hero, jump-to palette, phone bottom bar, dialogs, keyboard menu or phone layout on a role screen | `ui-crm.spec.js`, `phase10-roles.spec.js`, `mobile.spec.js` |
| CRM header repeated the organisation and a fixed role on every screen, or showed a hard-coded name instead of the signed-in person | `ui-crm.spec.js` (header, account menu, breadcrumb) |
| Printed documents showed the wrong business city (Raichur, not Hubli); a claim voucher for a defective part showed blank Claimant / Claim for and no service center | `phase10b.test.js` (claim voucher), `CRMwarehouse.html` fileClaimFromReturn |
| "Download" on a document saved an HTML file, not a PDF | `phase10-field.spec.js` (real PDF for every document and page size), `phase10b.test.js` file names |
| A new ticket, registration, claim, enquiry or notification arrived but nothing told the person until they reloaded, and its details had no pop-up | `ui-live.spec.js` (alerts, View pop-up, own-records-only, safe refresh, phone) |
| Clicking an item in a list (registration, ticket, claim ...) did nothing; no pop-up with that item's details | `ui-rows.spec.js` (row pop-up, no double pop-up, buttons/selection ignored) |
| The row pop-up only repeated the row's own columns, with no extra information | `ui-rows.spec.js` (full record, warranty valid-until, role-scoped lookup, quiet fallback) |
| No screen to switch an account off (needed a console edit); temporary passwords used Math.random | `crm-fixes.spec.js` (switch off / on with audit entry, never your own account) |
| Report Bug / My Bugs had no Firestore rule, so every report was refused | rules tests (create as yourself, read your own, Head Office sees all) |
| No way to say a brand's installation / demo / service is free (company paid) or customer paid, e.g. Skevia | `crm-fixes.spec.js` (Warehouse brand rules, center billing follows the brand rule even out of warranty, website tells the customer), `functions/billing.test.js`, rules tests |
| No way to say who pays for installation / demo / service (e.g. Skevia free, some MakWell models free) | `crm-fixes.spec.js` (Warehouse sets who pays per rate card row; center billing and rate card follow it), `functions/billing.test.js` (company-paid claimed even out of warranty, customer-paid never claimed) |
| No way to add a service center from the Service Centers screen | `crm-fixes.spec.js` (button opens the account form with Service Center chosen) |
| Areas with no service center had no way to get a technician | `crm-fixes.spec.js` (technician areas, Super Admin assigns a website ticket straight to a covering technician), `functions/routing.test.js` (auto-routing falls back to a covering technician), rules tests |
| Installation tickets closed with repair codes | `crm-fixes.spec.js` (installation outcomes + checklist; repair unchanged) |
| Rate-card service charge not shown in center billing when the ticket had no size recorded | `crm-fixes.spec.js` (size guessed from the product, changeable, saved for the server) |
| Approved rate requests did not take effect; a request with several rates could only be approved or rejected whole | `crm-fixes.spec.js`, `tests/unit/rate-approvals.test.mjs` (one row per line, approve / reject / edit each, approved rates written at once, keys match the server), rules tests |
| My Bugs page needed an undeclared Firestore index | `tests/unit/indexes.test.mjs` |
| The QA bug-snapshot step committed a stale copy of the whole site, deleting the Pages deploy workflow and newer work | `automated-qa.yml` publish step: resets to latest main, commits only `crm/bug-data.json`, refuses any wider commit |
| "Find service center" was only an enquiry form; no list or map of the nearest service centers and stores | `locator.spec.js` (published-only list, type filter, city and pincode search, nearest-first with location only on request, map and OpenStreetMap tiles only on request, self-hosted Leaflet, empty state, keyboard, axe, 360px phone, Super Admin add/hide/import) and `tests/unit/locations.test.mjs` (map-link reading) |
| Super Admin ticket pop-up stuck on "Loading status history…" when the ticket had a closure code | `ui-rows.spec.js` (closure code and status history both shown) |
| No privacy policy, terms, cookie policy or consent choice; fonts were loaded from Google; unticked-consent forms could be submitted | `trust-a11y.spec.js` (legal pages and footer links, banner with equal choices and nothing stored before a choice, 12-month expiry, withdraw from footer, no third-party requests, source audit vs `docs/THIRD-PARTY.md`, consent tick-box blocks submit) |
| Dark patterns: pre-ticked boxes, urgency or guilt wording, optional fields made required, a banner that hides the page | `trust-a11y.spec.js` (dark-pattern scan, optional enquiry fields, banner leaves room and sits under pop-ups) |
| Keyboard and screen-reader gaps: no focus ring on cards, pop-ups with no dialog role or name, focus lost on close, unlabelled fields, images without alt | `trust-a11y.spec.js` (skip link, visible focus, dialog role/name/Tab trap/Esc/focus return, field names, alt text) |
| Colour contrast or WCAG 2.2 AA violations on public pages, legal pages, banner, pop-ups and all CRM dashboards | `trust-a11y.spec.js` (axe-core, WCAG 2.0/2.1/2.2 A and AA) |
| Area Manager portal was only a shell ("not built yet") | `areamanager.spec.js` (every screen built, ticket queries limited to own districts, route to a center or a direct technician, assign / move tickets, SLA and coverage gaps, center and technician approvals, no-district message), `tests/unit/areamanager.test.mjs`, `functions/district.test.js`, rules tests (own districts only, no billing, no widening own districts) |
| A job could be closed without the customer confirming the work | `closing-messages.spec.js` (code or signature in the closure form, required setting), `functions/closeConfirm.test.js` (server checks the code / signature and undoes a bad completion; code sent only to the customer), `tests/unit/close-confirm.test.mjs`, rules tests |
| No automatic SMS / WhatsApp to customers | `functions/messaging.test.js` (events, switched off by default, MSG91 requests, errors never thrown), `closing-messages.spec.js` (Super Admin settings), `tests/unit/messages-admin.test.mjs` |
| Request, job, claim and spare numbers were made in the browser | `functions/closeConfirm.test.js` (issueNumber continues the shared counter, role checked), `functions/numbers.test.js` |
| A spare could be marked dispatched without the stock leaving the warehouse | `functions/lifecycle.test.js` (dispatch audit), rules tests (only the server writes the audit) |
| SLA rules were only shown, never acted on | `functions/phase9c.test.js` (breach after the district rule's hours tells Head Office, the district's Area Manager and the center, once) |
| Warehouse Profile showed "not built yet" | `closing-messages.spec.js` |

When you fix a new bug, add a test that fails without the fix, add a row here,
and raise the baseline.
