# T101-crm-distributor-nav-sweep: Sidebar navigation sweep, all 14 sections render

| Field | Value |
|---|---|
| Route | `/crm/CRMdistributor.html` |
| Source | `crm/CRMdistributor.html` (`NAV` line 352, `selectSection` lines 386-435); `crm/tradeOrders.js`, `crm/tradeFinance.js`, `crm/productStock.js` |
| Flow | Navigate to every sidebar section |
| Requires auth | yes |
| Required role | distributor |
| Destructive | no |
| Estimated steps | 32 |

## Preconditions
- App running at `http://localhost:8080`
- **Run only against the Firebase emulator or a dedicated test project — never the live makwell-websiteandcrm data. Mark BLOCKED if traffic would reach the live project.** This task is read-only, but it still reads business data, so the same rule applies.
- Signed in as `distributor`: at `/crm/login.html`, use env vars `QA_CRED_DISTRIBUTOR_USERNAME` / `QA_CRED_DISTRIBUTOR_PASSWORD`.
- Seed data is optional. Each section has a defined empty state, and this task accepts either the empty state or populated rows. It must never accept an error state.

## Test data
None. This task does not fill or submit anything.

Error strings that must **not** appear in any section:
`Couldn't load customers.`, `Couldn't load your orders.`, `Couldn't load the product catalogue.`, `Couldn't load your account.`, `Couldn't load the ledger.`, `Couldn't load sales.`, `Couldn't load the catalog.`, `Couldn't load orders.`, `Couldn't load your dealers.`, `Couldn't load the price list.`, `Couldn't load escalations.`, `Couldn't load registrations.`, `Couldn't load enquiries.`

## Steps

### TC-01: Sidebar structure
1. Sign in as distributor and navigate to `/crm/CRMdistributor.html`.
2. Assert: the sidebar shows the group labels in this order: `Overview`, `Business`, `Distribution Network`, `Support`, `Operations`.
3. Assert: there are exactly 14 nav items in this order: `Dashboard`, `My Customers`, `My Orders`, `Account & Invoices`, `My Sales`, `Products`, `Incoming Dealer Orders`, `Dealer Price List`, `My Stock`, `SLA Escalations`, `Product Registration`, `Enquiries`, `Performance`, `Profile`.
4. Assert: no nav item carries a `soon` badge.

### TC-02: Visit every section
For each row, click the nav item and then assert all of the following:
- the item has class `active` and no other item does
- `#page-title` equals the label
- `#page-sub` equals the subtitle shown
- within 8 s, the content shows the landmark below and no error string from Test data

| Nav item | `#page-sub` | Landmark in `#content` (empty or populated is fine) |
|---|---|---|
| `Dashboard` | `Welcome back` | 4 stat cards plus a `Getting started` panel; the values resolve from `…` to integers |
| `My Customers` | `Your customer directory` | Panel `My customers`, button `+ Add Customer`, table headers `Name / Phone / Address / Notes`; empty state `No customers yet — add your first one.` |
| `My Orders` | `Orders placed with Pushpak Enterprises` | Panel `New order` with a `Select product…` dropdown, `+ Add product`, and `Place order`; panel `My orders` (empty: `No orders yet.`) |
| `Account & Invoices` | `Credit, invoices, payments and statement with Pushpak Enterprises` | Panel `My account with Pushpak Enterprises` showing `Credit limit`, `Outstanding`, `Available`, `Payment terms`; panels `Invoices`, `Payments received`, `Statement` |
| `My Sales` | `Sales you've logged` | Panel `My sales`, button `+ Log Sale`; empty state `No sales logged yet.` |
| `Products` | `Product catalog` | Panel `Product catalog`, headers `Name / Category / Price`; empty state `No products in the catalog yet — Head Office hasn't set this up.` |
| `Incoming Dealer Orders` | `Approve, dispatch and deliver orders from dealers under you` | Panel `Orders from your dealers` with tab buttons `Awaiting approval`, `Approved — to dispatch`, `Dispatched`, `Closed`; empty state `Nothing here.` |
| `Dealer Price List` | `What your dealers pay you, per model (excl. GST)` | Panel `Trade price list` with `Prices for` select whose first option is `Standard — all my dealers` |
| `My Stock` | `Units delivered to you and not yet dispatched to dealers` | Stock panel renders with no error text |
| `SLA Escalations` | `Breached service tickets in your coverage area` | Panel `SLA escalations — breached tickets in your coverage area`; one of `No coverage pincodes set on your account yet — ask Super Admin to add them under Users & Access.`, `No breached tickets in your coverage area right now.`, or rows |
| `Product Registration` | `Register a product for warranty` | Panel `Product registrations`, button `+ Register Product`; empty state `No registrations yet.` |
| `Enquiries` | `Your leads and enquiries` | Panel `My enquiries`, button `+ Log Enquiry`; empty state `No enquiries logged yet.` |
| `Performance` | `Your sales stats` | 4 stat cards `Total Sales`, `Total Revenue` (starts with `₹`), `Enquiries Converted`, `Orders Placed` resolve from `…` |
| `Profile` | `Your distributor account details` | Panel `Distributor profile`; `Email` is disabled and equals the signed-in email; button `Save changes` |

### TC-03: Cross-section consistency
1. On `Dashboard`, note `Orders Placed` (= D_orders) and `Sales Logged` (= D_sales).
2. Open `Performance`. Assert: `Orders Placed` = D_orders and `Total Sales` = D_sales.

### TC-04: Rapid switching
1. Click `My Customers`, `My Sales`, `Enquiries`, `Dashboard` in quick succession, within about 1 s in total.
2. Assert: the final content is the Dashboard (stat cards). No section's table appears under the Dashboard heading, and no `Cannot set properties of null` TypeError appears in the console. A late `loadX()` writing into a removed tbody is a known race risk.

### TC-05: Negative and edge cases
- Reload while on `Enquiries`. Assert: the page comes back on `Dashboard`. There is no deep-link or hash routing, so this is expected and not a defect.
- Firestore unreachable: block the Firestore host in DevTools, then click `My Customers`. Assert: `Couldn't load customers. Check console for details.` appears in red, and the page does not hang on `Loading…`. Then click `Dashboard` and record whether the stats stay at `…`. Per source, the dashboard swallows the error into the console only, so record it as an observation.

## Assertions
- [ ] 14 nav items in 5 groups, none marked `soon`.
- [ ] Every section sets the correct title and subtitle and renders its landmark.
- [ ] No section shows a `Couldn't load …` error with healthy Firestore.
- [ ] Dashboard and Performance counts agree.
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected.

## Screenshots required
- Page initial load (Dashboard)
- One screenshot per section (14)
- Firestore-blocked `My Customers` error state

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
