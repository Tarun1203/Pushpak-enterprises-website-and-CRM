# T061-crm-servicecenter-nav-sweep: Service Center dashboard — navigation sweep of every sidebar section

| Field | Value |
|---|---|
| Route | `/crm/CRMservicecenter.html` |
| Source | `crm/CRMservicecenter.html` (`NAV` constant, `selectSection()`, each `render*()` function) |
| Flow | Navigate to every section in `NAV` (16 items in 5 groups) and verify title, subtitle and rendered content |
| Requires auth | yes |
| Required role | servicecenter |
| Destructive | no |
| Estimated steps | 40 |

## Preconditions
- App running at `http://localhost:8080`
- Signed in as `servicecenter` at `/crm/login.html` using `QA_CRED_SERVICECENTER_USERNAME` / `QA_CRED_SERVICECENTER_PASSWORD` (never literal values).
- Read-only task: no form is submitted. Still run only against the Firebase emulator or a dedicated test project — never the live makwell-websiteandcrm data.
- Either state is acceptable for the data-driven tables: seeded rows **or** the documented empty-state text. The runner records which one appeared.

## Test data
Expected sidebar structure (exact labels, exact order):

| Group label (uppercase in UI) | Items |
|---|---|
| Overview | Dashboard |
| Service | Center Requests, Center Technicians, Installation, Scheduling |
| Inventory | Center Inventory, Spare Requests (Head Office), Spare Dispatch, Send Back to Head Office |
| Finance | Service Billing, Service Charge Rates, Center Claims, Payment History |
| Operations | Performance, Reports, Profile |

No item carries a `soon` badge (every item has `built: true`).

## Steps

### TC-01: Happy path — sidebar renders all groups and items
1. Sign in as servicecenter; navigate to `/crm/CRMservicecenter.html`.
2. Assert: `#nav-container` contains exactly 5 `.nav-group` blocks whose `.nav-group-label` texts are `Overview`, `Service`, `Inventory`, `Finance`, `Operations` (rendered uppercase via CSS).
3. Assert: exactly 16 `.nav-item` elements, labels and order as in the Test data table.
4. Assert: no `.nav-badge` with text `soon` exists.
5. Assert: initial title `Dashboard`, subtitle `Welcome back`, no `.nav-item` has class `active` yet (the initial render does not call `setActiveNav`).

### TC-02: Section-by-section sweep
For each row: click the sidebar item, then assert (a) that item — and only that item — has class `active`, (b) `#page-title` text, (c) `#page-sub` text, (d) the listed content within 10 s, (e) no text `isn't built yet` anywhere in `#content`.

| # | Click | `#page-title` | `#page-sub` | Content that must render (seeded row OR empty-state) |
|---|---|---|---|---|
| 1 | Dashboard | Dashboard | Welcome back | Stat cards `New Requests`, `In Progress`, `Technicians`, `Alerts` with integer values; panel `Getting started` |
| 2 | Center Requests | Center Requests | All requests at this center | Panel `h2` = `Center Requests`; button `+ New Request`; table headers `Request ID, Type, Customer, Phone, Technician, Status, Actions`; rows or `Nothing here.` |
| 3 | Center Technicians | Center Technicians | Your technician roster | `h2` = `Center technicians`; button `+ Add Technician`; headers `Name, Phone, Skills, Account`; rows or `No technicians on your roster yet.` |
| 4 | Installation | Installation | Installation requests | `h2` = `Installation`; button `+ New Request`; same 7 headers as #2; only rows whose Type is `installation`, or `Nothing here.` |
| 5 | Scheduling | Scheduling | Upcoming scheduled requests | `h2` = `Upcoming schedule`; headers `Date, Request ID, Customer, Technician, Status`; rows sorted by date ascending or `No scheduled requests yet.` |
| 6 | Center Inventory | Center Inventory | Parts held at this center | `h2` = `Center inventory`; button `+ Add Part`; headers `Code, Part, Quantity, Actions`; rows with `Adjust` buttons or `No parts in center inventory yet.` |
| 7 | Spare Requests (Head Office) | Spare Requests (Head Office) | Parts requested from Head Office, and their dispatch status | `h2` = `Spare requests to Head Office`; headers `Request ID, Item, Qty, Status, Dispatch details, Actions`; rows or `No spare requests raised yet.` |
| 8 | Spare Dispatch | Spare Dispatch | Send parts to your technicians | `h2` = `Dispatch to technician` with button `+ Dispatch Spare`; second panel `Recent dispatches` headers `Date, Part, Qty, To`; rows or `No dispatches logged yet.` |
| 9 | Send Back to Head Office | Send Back to Head Office | Return parts to Head Office | Panel `Defective parts to send to Head Office` (headers `Used on, Part, Qty, From, Job, Due by` + select-all checkbox; rows or `No defective parts waiting to be sent.`); panel `Send back to Head Office` with button `+ Send Back` |
| 10 | Service Billing | Service Billing | Warranty claims to Head Office, and charges collected from customers | Three panels: `Needs billing` (rows or `Nothing waiting on billing.`), `Ready to claim (in-warranty) — unclaimed: ₹<n>` with disabled button `Submit selected as claim` (rows or `Nothing ready to claim yet.`), `Billing history` (rows or `No billed tickets yet.`) |
| 11 | Service Charge Rates | Service Charge Rates | Your technicians' warranty service-charge rates, by product category and service type | `h2` = `Service charge rates`; button `Save your overrides`; headers `Product Category, Size / Model, Repair — HO Default, Repair — Your Rate, Installation — HO Default, Installation — Your Rate`; last category row is `Other`; or `No product categories set up yet — add them under Super Admin's Categories first.` |
| 12 | Center Claims | Center Claims | Your reimbursement claims | `h2` = `My claims`; button `+ Submit Claim`; headers `Claim ID, Description, Amount, Status`; rows or `No claims submitted yet.` |
| 13 | Payment History | Payment History | Settled claims | Stat card `Total Received` = `₹<n>`; panel `Settled claims` headers `Claim ID, Description, Amount`; rows or `No settled claims yet.` |
| 14 | Performance | Performance | Center completion stats | Stat cards `Completed`, `Cancelled`, `Completion Rate` (percentage or `—`), `Total Requests` — each value replaces `…` |
| 15 | Reports | Reports | Center summary | Panel `Center summary` whose body changes from `Loading…` to text containing `total requests logged`, `technicians on your roster`, `claims submitted` and `settled to date` |
| 16 | Profile | Profile | Center account details | Panel `Center profile` with fields `Center name`, `Email` (disabled, equals signed-in email), `Phone`, `Address` and button `Save changes`; panel `Full profile` whose body leaves `Loading…` |

### TC-03: Cross-checks between sections
1. Note `New Requests` and `Technicians` values on Dashboard.
2. Open Center Requests; count rows with status pill `New`. Assert: equals the Dashboard `New Requests` value.
3. Open Center Technicians; count rows (excluding the empty-state row). Assert: equals Dashboard `Technicians`.
4. Open Performance; Assert `Total Requests` equals the number of rows on Center Requests.
5. Open Reports; Assert the `total requests logged` figure equals Performance `Total Requests`.

### TC-04: Repeated and rapid navigation
1. Click Center Requests → Center Technicians → Center Requests in < 1 s total.
2. Assert: final content is the Center Requests table (title `Center Requests`), no duplicated panels, no stale technician table.
3. Click the already-active item again. Assert: content re-renders once, no duplicate `+ New Request` buttons.

### TC-05: Negative & edge cases
- Reload while on any section (e.g. Service Billing) → page returns to `Dashboard` (navigation is not persisted in the URL). Record as expected behavior.
- Narrow viewport 390×844: sidebar items remain reachable (scroll/menu from `mobile.js`) and each section from TC-02 #2, #10 and #16 still renders.
- Firestore offline (DevTools → Network offline, then click Center Requests) → table body shows `Couldn't load requests. Check console for details.` in red.

## Assertions
- [ ] 5 groups, 16 items, exact labels and order; no `soon` badges.
- [ ] Each of the 16 sections sets the exact `#page-title` / `#page-sub` pair from TC-02.
- [ ] Each section renders its panel/table headers and either data or the exact empty-state text.
- [ ] Only the clicked item carries `.active`.
- [ ] Dashboard counts agree with the Requests/Technicians/Performance/Reports figures.
- [ ] No console errors in DevTools at any step (except the deliberate offline case).
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected.

## Screenshots required
- Page initial load (Dashboard)
- Each of the 16 sections after its content finished loading
- Offline error state on Center Requests

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
