# T091-crm-crmdealer-nav-sweep-as-dealer: Dealer sidebar navigation sweep

| Field | Value |
|---|---|
| Route | `/crm/CRMdealer.html` |
| Source | `crm/CRMdealer.html` |
| Flow | Navigate to every sidebar section (Dashboard … Profile) |
| Requires auth | yes |
| Required role | dealer |
| Destructive | no (TC-03 writes the dealer's own profile and restores it) |
| Estimated steps | 30 |

## Preconditions
- App running at `http://localhost:8080`
- **Run only against the Firebase emulator or a dedicated test project — never the live makwell-websiteandcrm data. Mark BLOCKED if traffic would reach the live project.** (Hardcoded `projectId: "makwell-websiteandcrm"`, no emulator switch — verify request hosts in DevTools > Network before step 1.)
- Signed in as `dealer` at `/crm/login.html` using env `QA_CRED_DEALER_USERNAME` / `QA_CRED_DEALER_PASSWORD`.
- Seed (emulator): the dealer may have zero or more records; both empty and populated states are acceptable, but each table must leave its `Loading…` state.

## Test data
- `profileName = "QA-AUTO Dealer Raichur"`
- `profilePhone = "9000000101"`
- `profileAddress = "QA-AUTO Station Road, Raichur, Karnataka 584101"`
- `profileGstin = ""` (left empty)
- Original profile values: record them in TC-03 step 2 before editing, restore in step 9.

## Steps

### TC-01: Happy path — every section renders with correct title, sub-title and content
1. Sign in as `dealer`. Navigate to `/crm/CRMdealer.html`.
2. Assert: sidebar groups in order `Overview`, `Business`, `Support`, `Operations`; items in order `Dashboard`, `My Customers`, `My Orders`, `Account & Invoices`, `My Sales`, `Products`, `Product Registration`, `Enquiries`, `Performance`, `Profile`; no item shows a `soon` badge.
3. For each row below: click the sidebar item, then assert the item has the `active` class (only one active at a time), `h1#page-title` text, `#page-sub` text, and the content marker. Every `Loading…` placeholder must be replaced within 5 s.

| Sidebar item | `#page-title` | `#page-sub` | Content marker |
|---|---|---|---|
| `Dashboard` | Dashboard | Welcome back | 4 stat cards `Customers`, `Orders Placed`, `Sales Logged`, `Open Enquiries` with numbers; panel `Getting started` |
| `My Customers` | My Customers | Your customer directory | panel `My customers`, button `+ Add Customer`, table headers Name/Phone/Address/Notes; rows or `No customers yet — add your first one.` |
| `My Orders` | My Orders | `Orders placed with Pushpak Enterprises` (Direct dealer) or `Orders placed with <distributor name>` (under a distributor) | panel `New order` with `Select product…` dropdown, `+ Add product`, `Estimated total: —`, `Place order`; panel `My orders` with cards or `No orders yet.` |
| `Account & Invoices` | Account & Invoices | Credit, invoices, payments and statement with Pushpak Enterprises | panels `My account with Pushpak Enterprises`, `Invoices`, `Payments received`, `Statement` |
| `My Sales` | My Sales | Sales you've logged | panel `My sales`, `+ Log Sale`, headers Sale ID/Customer/Product/Qty/Amount/Date |
| `Products` | Products | Product catalog | panel `Product catalog`, headers Name/Category/Price; rows or `No products in the catalog yet — Head Office hasn't set this up.` |
| `Product Registration` | Product Registration | Register a product for warranty | panel `Product registrations`, `+ Register Product` |
| `Enquiries` | Enquiries | Your leads and enquiries | panel `My enquiries`, `+ Log Enquiry`, headers Customer/Phone/Subject/Status/Actions |
| `Performance` | Performance | Your sales stats | stat cards `Total Sales`, `Total Revenue` (starts with `₹`), `Enquiries Converted`, `Orders Placed` |
| `Profile` | Profile | Your dealer account details | panel `Dealer profile`, fields Business name / Email (disabled) / Phone / Address / GSTIN (optional), button `Save changes` |

4. Assert: no section shows a red `Couldn't load …` message.
5. Cross-check: `Dashboard` stat `Orders Placed` equals `Performance` stat `Orders Placed`; `Dashboard` `Sales Logged` equals `Performance` `Total Sales`.

### TC-02: Products catalogue data fidelity
1. Click `Products`. If rows exist, compare one row against the `My Orders` > `New order` dropdown label for the same product.
2. Assert: `Category` column is not `—` for a product that has a category in Head Office, and `Price` column is not `—` for a product that has a dealer price in `My Orders` estimate. (Expected FAIL per source review: the tab reads `category`/`price` fields while the catalogue stores `categoryName` and prices live in `priceLists` — log as defect if reproduced.)

### TC-03: Profile save and restore
1. Click `Profile`.
2. Assert: `Email` input is disabled and equals the signed-in email. Record the current Business name, Phone, Address, GSTIN.
3. Fill `Business name` = `QA-AUTO Dealer Raichur`, `Phone` = `9000000101`, `Address` = `QA-AUTO Station Road, Raichur, Karnataka 584101`, leave `GSTIN (optional)` empty.
4. Click **`Save changes`**.
5. Assert: button shows `Saving…` then returns to `Save changes`; green text `Saved.` appears.
6. Click `Dashboard`, then `Profile` again. Assert: the three saved values are shown.
7. Reload the page. Assert: values persist.
8. Edge: set `Phone` = `abc` and click `Save changes`. Record the result (source has no phone validation — `Saved.` here is a defect, not a pass).
9. Restore the original values from step 2 and click `Save changes`. Assert `Saved.`.

### TC-04: Negative & edge cases
- Rapid switching: click `My Orders` then immediately `Products` before the order list loads. Assert the final content is `Product catalog` only, with no `New order` panel bleeding in and no console error.
- Offline: set DevTools to Offline, click `My Customers`. Assert the table shows `Couldn't load customers. Check console for details.` (or stays cached); no blank page.

## Assertions
- [ ] All 10 sections render with exact titles/sub-titles listed in TC-01.
- [ ] Only one nav item is active at a time.
- [ ] No `Loading…` remains after 5 s; no `Couldn't load` errors online.
- [ ] Dashboard and Performance counts agree.
- [ ] Profile save persists across reload and is restored.
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected.

## Screenshots required
- Page initial load (Dashboard)
- Each of the 10 sections
- Profile after `Saved.`
- Any `Couldn't load` error state

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
