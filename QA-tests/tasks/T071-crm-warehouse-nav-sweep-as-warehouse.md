# T071-crm-warehouse-nav-sweep-as-warehouse: Navigation sweep of every NAV section, including Service access

| Field | Value |
|---|---|
| Route | `/crm/CRMwarehouse.html` |
| Source | `crm/CRMwarehouse.html` (`const NAV`, `selectSection()`), `crm/tradeOrders.js`, `crm/tradeFinance.js`, `crm/productStock.js`, `crm/rma.js` |
| Flow | Navigate to every sidebar section (56 items in 7 groups) |
| Requires auth | yes |
| Required role | warehouse |
| Destructive | no (read-only; the steps do not click any action button inside a section) |
| Estimated steps | 62 |

## Preconditions
- App running at `http://localhost:8080`
- Signed in as `warehouse` at `/crm/login.html`. The runner resolves `QA_CRED_WAREHOUSE_USERNAME` / `QA_CRED_WAREHOUSE_PASSWORD`. Never type literal credentials.
- Run only against the Firebase emulator or a dedicated test project, never the live makwell-websiteandcrm data. The task does not submit forms, but **Service Request Routing auto-routes** `publicServiceRequests` with an exact pincode match when the section loads (`whAutoRouteExactPincodeMatches`). That is a write.
- Seed data is optional. Empty-state text is listed for every section, so the sweep passes against an empty emulator.

## Test data
- Address sidebar items by `.nav-item[data-id="<id>"]`, not by label. Two items are labelled `New Requests` (`requests-new` and `lp-new`).
- `expectedGroups = ["Overview","Stock Movement","Inventory","Parts & Purchase","Finished Goods","Dealers & Distributors","Operations"]`

## Steps

### TC-01: Sidebar structure
1. Sign in as `warehouse`. Navigate to `/crm/CRMwarehouse.html`.
2. Assert: `#nav-container` renders exactly 7 `.nav-group-label` elements, with the text of `expectedGroups` in order (CSS shows them uppercase).
3. Assert: there are exactly 56 `.nav-item` elements.
4. Assert: only `Profile` (`data-id="profile"`) carries a `.nav-badge` with text `soon`. No other item has a badge.
5. Assert: `Dashboard` is `.active` on load.

### TC-02: Click every section and assert what renders
For each row, click `.nav-item[data-id=<id>]` and assert all of the following:
- (a) The item gets class `active` and is the only active item.
- (b) `#page-title` = Label.
- (c) `#page-sub` = Subtitle (exact text).
- (d) The Landmark is visible in `#content` within 10 s.
- (e) `#content` does not show a red error row such as `Couldn't load …` / `Could not load` (`.empty-row` with `color:var(--err)`).

Either the populated table or the listed empty-state text is acceptable.

| # | data-id | Label | Subtitle (`#page-sub`) | Landmark in `#content` (heading / header / empty state) |
|---|---|---|---|---|
| 1 | `dashboard` | Dashboard | Welcome back | 9 `.stat-card.dash-tile` (see T072) |
| 2 | `requests-new` | New Requests | Spare Requests & Dispatch | `h2` "New Requests"; buttons **`+ New Transfer`**, **`+ New Request`**; columns Request ID / Service Center / Item / Qty / Priority / Status / Actions; empty: `No requests in this stage.` |
| 3 | `requests-approved` | Approved | Spare Requests & Dispatch | `h2` "Approved", same table |
| 4 | `requests-picking` | Picking | Spare Requests & Dispatch | `h2` "Picking" |
| 5 | `requests-packing` | Packing | Spare Requests & Dispatch | `h2` "Packing" |
| 6 | `requests-dispatch` | Dispatch | Spare Requests & Dispatch | `h2` "Dispatch" |
| 7 | `requests-transit` | In Transit | Spare Requests & Dispatch | `h2` "In Transit" |
| 8 | `requests-backorder` | Back Order | Spare Requests & Dispatch | `h2` "Back Order" |
| 9 | `move-receive` | Receive | Stock received into Warehouse | `h2` "Receive"; button **`Fix older transfers not showing up`**; columns Date / Type / Part / Qty / Location / Reason / Notes; empty: `No movements recorded yet.` |
| 10 | `move-issue` | Issue | Stock issued out of Warehouse | `h2` "Issue", same table |
| 11 | `move-adjust` | Adjustment | Manual stock corrections — physical counts, write-offs | `h2` "Stock adjustment"; button **`+ New Adjustment`**; `h2` "Adjustment history"; empty: `No adjustments logged yet.` |
| 12 | `move-history` | Movement History | Full log, all movement types | `h2` "Movement History" |
| 13 | `inv-warehouse` | Warehouse Stock | Current stock at Warehouse | `h2` "Warehouse stock"; columns include Qty (WH) and Actions; each row has **`Adjust`** |
| 14 | `inv-servicecenter` | Service Center Stock | Stock currently held at each Service Center | `h2` "Service Center Stock"; filter select with `All locations`; empty text starts `No stock recorded yet.` |
| 15 | `inv-technician` | Technician Stock | Stock currently held with each Technician | `h2` "Technician Stock" |
| 16 | `inv-summary` | Stock Summary | Stock across all parts | `h2` "Stock summary" (no Actions column) |
| 17 | `inv-lowstock` | Low / Out of Stock | Parts at or below reorder level | `h2` "Low / out of stock" |
| 18 | `inv-damaged` | Damaged / Returned | Parts written off through Returns & Defects — disposed or currently defective | `h2` "Damaged / written off, by part"; empty: `Nothing damaged or disposed on record.` |
| 19 | `spareparts` | Spare Parts | Part master list | `h2` "Spare parts master list"; button **`+ Add part`** |
| 20 | `stock-requests` | Spare Stock Requests | Service centers and technicians asking to add stock to themselves | `h2` "Waiting for approval" and "Recently decided"; empty: `Nothing waiting.` / `None yet.` |
| 21 | `my-change-requests` | My Change Requests | Price changes and stock reductions you sent to Super Admin | `h2` "My change requests"; empty: `No requests yet.` |
| 22 | `lp-new` | New Requests | Local Purchase | `h2` "New Requests"; button **`+ New Request`**; columns include Emergency; empty: `Nothing here.` |
| 23 | `lp-emergency` | Emergency Purchase | Local Purchase | `h2` "Emergency Purchase" |
| 24 | `lp-invoice` | Invoice Verification | Local Purchase | `h2` "Invoice Verification" |
| 25 | `lp-claims` | Claim Processing | Local Purchase | `h2` "Claim Processing" |
| 26 | `lp-history` | Local Purchase History | Local Purchase | `h2` "Local Purchase History"; **no** Actions column |
| 27 | `unclaimed-amounts` | Unclaimed Amounts | Ready-to-claim balances not yet submitted, by service center and technician | `h2` "Service centers — unclaimed" and "Technicians — unclaimed wallet balance" |
| 28 | `rate-card` | Service Charge Rates | Default warranty service-charge rates, by product category and service type | `h2` starting "Default rates"; button **`Save changes`** (do not click) |
| 29 | `claims-technician` | Technician Claims | Claims | `h2` "Technician Claims"; button **`+ New Claim`**; search input with placeholder `Search by ticket ID, claim ID, or customer name…` |
| 30 | `claims-servicecenter` | Service Center Claims | Claims | `h2` "Service Center Claims" |
| 31 | `claims-verification` | Claims Verification | Claims | `h2` "Claims Verification" |
| 32 | `claims-history` | Claims History | Claims | `h2` "Claims History" |
| 33 | `returns-due` | Defectives Due | Defective parts used on jobs and not yet sent back (monthly batches) | panel; empty: `No defective parts outstanding.` |
| 34 | `returns-requests` | Return Requests | Returns & Defects | `h2` "Return Requests"; buttons **`+ Request Return`**, **`+ Accept Return`** |
| 35 | `returns-intake` | Returns | Returns & Defects | `h2` "Returns" |
| 36 | `returns-defective` | Defective Parts | Returns & Defects | `h2` "Defective Parts" |
| 37 | `returns-rejected` | Rejected | Returns & Defects | `h2` "Rejected" |
| 38 | `returns-refurbished` | Refurbished | Returns & Defects | `h2` "Refurbished" |
| 39 | `returns-supplier` | Supplier Returns | Returns & Defects | `h2` "Supplier Returns" |
| 40 | `returns-disposal` | Disposal | Returns & Defects | `h2` "Disposal" |
| 41 | `fg-stock` | Stock & Receiving | Finished goods at Head Office — receive with one serial per unit | content rendered by `productStock.js` `renderWarehouseStock`; non-empty, no error text |
| 42 | `fg-serial` | Serial Lookup | Where a unit is, who it was sold to, and its history | rendered by `productStock.js` `renderSerialLookup`; a search input is present |
| 43 | `rma` | RMA & Replacement | Replace a customer's defective unit from stock, then get the defective unit back | rendered by `rma.js` `renderRmaList` (allowRaise) |
| 44 | `brand-returns` | Brand Returns | Defective units and spares sent back to the brand, with credit notes and replacements | rendered by `rma.js` `renderBrandReturns` |
| 45 | `trade-orders` | Trade Orders | Approve and dispatch Direct dealer and distributor orders | rendered by `tradeOrders.js` `renderOrderQueue` (mode company) |
| 46 | `trade-payments` | Trade Payments | Record payments received from dealers and distributors | rendered by `tradeFinance.js` `renderPayments` |
| 47 | `trade-invoices` | Trade Invoices | GST invoices for approved Head Office orders | rendered by `tradeFinance.js` `renderInvoices` |
| 48 | `trade-accounts` | Credit & Accounts | Credit limits (set by Super Admin), outstanding and ageing | rendered by `tradeFinance.js` `renderAccounts` (no credit-limit edit controls, because `isSuperAdmin:false`) |
| 49 | `servicevis` | Service | All service activity, company-wide | `h2` "All service activity"; columns Source / ID / Customer / Assigned To / Status; empty: `No service activity yet.` |
| 50 | `routing` | Service Request Routing | Assign unassigned requests to a service center or technician | `h2` "Unassigned requests" and "Already assigned — reroute"; empty: `Nothing unassigned right now.` / `Nothing currently assigned that needs rerouting.` |
| 51 | `masterdata` | Master Data | Bulk import spare parts from a CSV file | 10 tab buttons: Products, Pincode Master, Spare Parts, Serial No Master, Spare Part Images, Users (Staff), Dealers, Distributors, Technicians, Service Centers; **`Download sample CSV`**; **`Import`** disabled |
| 52 | `reports` | Reports | Warehouse summary | `h2` "Warehouse summary"; 6 lines: `Parts in catalog:`, `Total stock units at Warehouse:`, `Open spare requests:`, `Pending local purchases:`, `Stock movements, last 30 days:`, `Damaged / disposed units on record:` |
| 53 | `auditlogs` | Audit Logs | Every recorded change, company-wide | `h2` "Audit log"; columns Date / Type / Action / By / Details |
| 54 | `profile` | Profile | Not built yet | `.coming-soon` with `Profile isn't built yet` and `This module is on the roadmap — it'll be built out next, module by module.` |

The table lists 54 rows. Rows 2 and 22 share a label, and `dashboard` is counted once, so 56 sidebar items map to 54 unique render paths plus 2 extra clicks. Click all 56 items: include a second click on `dashboard` at the end, and click any item missing from the table to confirm it is not a dead end.

### TC-03: Service section access (the warehouse "Service" view of company-wide tickets)
The source has no section called "Service Hub". Company-wide ticket visibility for this role is the **Service** item (`servicevis`) plus **Service Request Routing**. This TC covers that access.
1. Click `.nav-item[data-id="servicevis"]`. Assert: TC-02 row 49 holds.
2. With at least one seeded `centerRequests` doc (`customerName = "QA-AUTO Customer Svc"`, `status = "new"`, `requestId = "PE-CR-QA-0001"`): assert one row with Source `Service Center`, ID link `PE-CR-QA-0001` and Status pill `New`.
3. Click the ID link. Assert: `#svc-ticket-overlay` is shown, `#svc-ticket-title` = `PE-CR-QA-0001`, the body contains `Customer:` `QA-AUTO Customer Svc`, and `#svc-ticket-actions` has the button **`Go to Routing`**.
4. Click **`Close`** (`#close-svc-ticket`). Assert: the overlay is hidden.
5. Reopen. Click **`Go to Routing`**. Assert: the overlay closes, `#page-title` = `Service Request Routing`, and `routing` is active.
6. Assert: the ticket's `Status history:` slot rendered either entries or `No logged history yet for this ticket…`. It must not show the permission-error text `Couldn't load status history — the updated Firestore security rules…`.

### TC-04: Dashboard tile drill-through
1. Click `dashboard`. For each tile, click it and assert the target nav item becomes active:
   `New Requests→requests-new`, `Back Order→requests-backorder`, `In Transit→requests-transit`, `Low / Out of Stock→inv-lowstock`, `Damaged / Defective Returns→inv-damaged`, `Pending Local Purchase→lp-new`, `Pending Claims→claims-verification`, `Pending Returns→returns-requests`, `Service Tickets→servicevis`. Return to `dashboard` between clicks.

### TC-05: Negative & edge cases
- **Rapid switching:** click `requests-new`, `inv-warehouse` and `auditlogs` within 300 ms. Expected: the final title is `Audit Logs` and `#content` shows the audit table. No leftover table from an earlier section is shown, and no uncaught exception occurs.
- **Ctrl/Cmd+K palette (ui.js):** press Ctrl+K and type `Movement`. Choose `Movement History`. Expected: the section opens just as a sidebar click would.
- **Offline section load:** go offline, then click `move-history`. Expected: a red row `Couldn't load movement history. Check console for details.` The page must not hang on `Loading…`.

## Assertions
- [ ] 7 groups and 56 nav items. Only `Profile` has the `soon` badge.
- [ ] Every section sets the exact `#page-title` / `#page-sub` from the table.
- [ ] Every section renders its landmark and no red load-error row.
- [ ] The Service ticket popup opens, closes and links to Routing.
- [ ] All 9 dashboard tiles drill to the right section.
- [ ] No console errors in DevTools at any step, except the deliberate offline case.
- [ ] No failed network requests (no 4xx/5xx), and no Firestore `permission-denied` for the warehouse role on any section.

## Screenshots required
- Sidebar fully expanded (all groups)
- One screenshot per nav group (first item of each)
- Service ticket popup open
- Profile "isn't built yet" placeholder
- Master Data tab bar

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
