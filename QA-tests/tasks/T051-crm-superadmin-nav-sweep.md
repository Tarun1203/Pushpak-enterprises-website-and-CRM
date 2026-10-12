# T051-crm-superadmin-nav-sweep: Every sidebar section opens without console errors

| Field | Value |
|---|---|
| Route | `/crm/CRMsuperadmin.html` |
| Source | `crm/CRMsuperadmin.html` (`NAV` ~line 1160, `selectSection` ~line 1268); modules `tradeOrders.js`, `tradeFinance.js`, `productStock.js`, `rma.js`, `locations-admin.js` |
| Flow | Navigate to each of the 44 NAV sections and verify title, subtitle, primary panel, and a clean console |
| Requires auth | yes |
| Required role | superadmin |
| Destructive | no |
| Estimated steps | 50 |

## Preconditions
- App running at `http://localhost:8080`
- Signed in as `superadmin` (env `QA_CRED_SUPERADMIN_USERNAME` / `QA_CRED_SUPERADMIN_PASSWORD`, via `/crm/login.html`).
- Run only against the Firebase emulator or a dedicated test project, never the live makwell-websiteandcrm data. Some sections write when they load: **Service** runs `autoRouteExactPincodeMatches()` and can route website requests older than 2 min, and **Service Centers → Full profile** can create `serviceCenterProfiles` docs. The page hard-codes the live `makwell-websiteandcrm` config with no emulator switch. If DevTools → Network shows traffic going to the live project, **mark this task BLOCKED** and stop.
- Seed data is helpful but not required. Empty collections are valid and show an empty-state row.
- Do not click any action button inside a section. This task only navigates.

## Test data
- `routeUrl = "http://localhost:8080/crm/CRMsuperadmin.html"`
- No form data. This task is read-only apart from the Service auto-route side effect noted above.

## Steps

### TC-01: Navigation sweep
1. Sign in as superadmin and navigate to `routeUrl`. Assert `#page-title` = `Dashboard`.
2. Open DevTools Console and clear it. Record every `console.error` from this point.
3. For **each row** in the table below, in order:
   1. Click the sidebar `.nav-item` whose text equals **Label**.
   2. Assert: that `.nav-item` has class `active` and no other `.nav-item` does.
   3. Assert: `#page-title` text equals **Label**.
   4. Assert: `#page-sub` text equals **Subtitle**.
   5. Wait until the **Loaded when** condition is true (max 15 s). Then assert that `#content` contains no text `Couldn't load`, `Could not load`, `Search failed`, or `isn't built yet`.
   6. Assert: no new `console.error` since the previous row. If one appears, record the section and the message.

| # | Group | Label | Subtitle | Loaded when |
|---|---|---|---|---|
| 1 | Overview | Dashboard | Overview across brands and services | 13 `.dash-tile` elements visible |
| 2 | Customers & Sales | Customer 360 | Search by phone — unified view across every collection | `#c360-phone-input` visible and `#custs-tbody` not `Loading…` |
| 3 | Customers & Sales | Serial & Registration | All product registrations | `#regs-tbody` not `Loading…` |
| 4 | Customers & Sales | Warranty | Warranty status across registrations | tabs `All` / `Active` / `Expiring Soon` / `Expired` visible and `#regs-tbody` not `Loading…` |
| 5 | Customers & Sales | Dealers | All dealer accounts | `#dealers-tbody` not `Loading…` |
| 6 | Customers & Sales | Distributors | All distributor accounts | `#distributors-tbody` not `Loading…` |
| 7 | Customers & Sales | Trade Orders | Direct dealer and distributor orders (Warehouse approves; you can too) | `#content` no longer shows `Loading…` |
| 8 | Customers & Sales | Trade Price List | Private per-account prices, excluding GST | `#content` not `Loading…`, and not `Couldn't load dealer and distributor accounts.` |
| 9 | Product Catalog | Brands | MakWell, Flyvision, Skevia — public copy | `#brands-tbody` has 3 rows: MakWell, Flyvision, Skevia |
| 10 | Product Catalog | Products | Your catalog — each entry is one sellable item, with sizes/variants grouped underneath | button `+ Add Product` visible and `#products-tbody` not `Loading…` |
| 11 | Product Catalog | Categories | Category master, per brand | tabs `All Categories` … `Dynamic Attributes` and `+ Add Category` visible |
| 12 | Product Catalog | Warranty Plans | Multi-component warranty coverage, by brand and category | `+ Add Plan` visible and `#wplans-tbody` not `Loading…` |
| 13 | Service Operations | Service | All service activity, company-wide | `Backfill website tracking` button visible and `#service-tbody` not `Loading…` |
| 14 | Service Operations | Service Centers | All service center accounts | `#centers-tbody` not `Loading…` |
| 15 | Service Operations | Technicians | All technician accounts | `#techs-tbody` not `Loading…` |
| 16 | Service Operations | Pincode Master | PIN → City / Taluk / District / State — the territory hierarchy everything else resolves against | `Bulk import` and `+ Add Pincode` visible and `#pincode-tbody` not `Loading…` |
| 17 | Service Operations | Store & Service Locations | What the public website's "Find service center" map shows | `#content` populated by `locations-admin.js` (not empty) |
| 18 | Service Operations | Coverage Analysis | Overlapping Service Center coverage, and districts with unassigned pincodes | `#conflicts-tbody` and `#gaps-tbody` not `Loading…` |
| 19 | Service Operations | Appointments | All scheduled activity, company-wide | tabs `Upcoming` / `Unscheduled` / `All Scheduled` and `#appt-tbody` not `Loading…` |
| 20 | Service Operations | SLA & Escalation | Requests open too long | `+ Add rule` visible and `#sla-rules-tbody` and `#sla-tbody` not `Loading…` |
| 21 | Inventory & Logistics | Spare Parts | Master parts list — add/edit here or in Warehouse, same collection | `+ Add part` visible and `#sp-tbody` not `Loading…` |
| 22 | Inventory & Logistics | Inventory | Stock across all locations | `#inv-overview-tbody` not `Loading…` |
| 23 | Inventory & Logistics | Stock Movement | Full movement log, company-wide | `+ Transfer` and `+ Adjustment` visible and `#sm-tbody` not `Loading…` |
| 24 | Inventory & Logistics | Spare Request & Logistics | Spare requests, company-wide | `#sr-tbody` not `Loading…` |
| 25 | Inventory & Logistics | Local Purchase | Local purchase requests, company-wide | `#lp-overview-tbody` not `Loading…` |
| 26 | Inventory & Logistics | Finished Goods Stock | Finished goods at Head Office — receive with one serial per unit | `#content` populated by `productStock.js` |
| 27 | Inventory & Logistics | Serial Lookup | Where a unit is, who it was sold to, and its history | `#content` populated by `productStock.js` |
| 28 | Finance & Claims | Finance | Claims & local purchase settlements | 4 stat cards show values other than `…`, and `+ Add Claim` is visible |
| 29 | Finance & Claims | Payments | Every recorded payment, with method and reference | `+ Record Payment` visible and `#pay-count` shows a number |
| 30 | Finance & Claims | RMA & Replacement | Product returns & replacements | `+ New RMA` visible and `#rma-module` populated |
| 31 | Finance & Claims | Brand Returns | Defective units and spares sent back to the brand, with credit notes and replacements | `#content` populated by `rma.js` |
| 32 | Finance & Claims | Dealer Credit & Accounts | Credit limits, payment terms, outstanding and ageing | `#content` populated by `tradeFinance.js` |
| 33 | Finance & Claims | Trade Invoices | GST invoices for approved Head Office orders | `#content` populated by `tradeFinance.js` |
| 34 | Finance & Claims | Trade Payments | Payments received from dealers and distributors | `#content` populated by `tradeFinance.js` |
| 35 | Finance & Claims | Company GST Profile | Seller details printed on invoices | `#content` populated by `tradeFinance.js` |
| 36 | Approvals | Approvals | Everything awaiting a decision | panels `Needs your decision`, `Waiting elsewhere`, `Pending claims`, `Pending local purchase`, `New spare requests` visible and all tbodies not `Loading…` |
| 37 | Approvals | Document Expiry | Service center and technician documents expiring within 30 days or already expired | `#dx-body` not `Loading…` |
| 38 | Operations | Communication | Reusable message templates | `+ Add Template` visible and `#template-tbody` not `Loading…` |
| 39 | Operations | Customer Support | Tickets customers open from the portal — reply, close or reopen | `#sup-filter` visible and `#sup-body` not `Loading…` |
| 40 | Operations | Reports | Company-wide summary | `#reports-body` contains `dealers,` and `service centers,` |
| 41 | Operations | Website Management | Public site content & enquiries | `Edit Content` visible and `#enq-tbody` not `Loading…` |
| 42 | Operations | Master Data | Bulk import for the product catalog | 10 tab buttons: Products, Pincode Master, Spare Parts, Serial No Master, Spare Part Images, Users (Staff), Dealers, Distributors, Technicians, Service Centers |
| 43 | System | Users & Access | Manage CRM accounts and roles | `CRM accounts` panel, `+ Create account`, and `#users-tbody` not `Loading…` |
| 44 | System | Administration | Company-wide settings | `General settings` panel with `#admin-company-name` filled, and `#audit-tbody` not `Loading…` |

4. Assert: across all 44 rows, no row shows the `coming-soon` block `<Label> isn't built yet`. Every NAV item is `built: true`.

### TC-02: Notification bell
1. Click the bell (`#notif-bell-btn`). Assert: `#notif-panel` gets class `show`, with header `Notifications` and a list that is either items or `No notifications yet.`. It is not `Couldn't load notifications.`.
2. Click outside the panel. Assert: the panel closes.

### TC-03: Rapid switching
1. Click `Service` → `Technicians` → `Approvals` → `Dashboard` with less than 300 ms between clicks.
2. Assert: the final `#page-title` is `Dashboard` with 13 tiles, and no `TypeError … null` console errors. Late async renders must not throw on missing tbody elements.

## Assertions
- [ ] All 44 sections render the exact title and subtitle above.
- [ ] No section shows `Couldn't load …` / `Could not load` / `isn't built yet`.
- [ ] No console errors in DevTools at any step. Log each offender as `section → message`.
- [ ] No failed network requests (no 4xx/5xx). Firestore `failed-precondition` (missing index) counts as a failure: name the section.

## Screenshots required
- Page initial load (Dashboard)
- One screenshot per section (44), named `T051-<nn>-<label>.png`
- Notification panel open
- Any section that fails, in its failing state

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
