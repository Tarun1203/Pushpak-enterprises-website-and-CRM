# T102-crm-distributor-place-order-to-head-office: Place a priced trade order with Head Office, validate it, and cancel it

| Field | Value |
|---|---|
| Route | `/crm/CRMdistributor.html` → sidebar `My Orders` |
| Source | `crm/CRMdistributor.html` (`renderOrders` lines 614-629, `generateOrderId` 608-611); `crm/tradeOrders.js` (`renderOrderForm` 120-222, `renderMyOrders` 228-265); `crm/tradePricing.js` (`validateLines`, `MAX_LINES=50`, `MAX_QTY=400`, `MAX_UNITS=400`) |
| Flow | Place an order with Head Office (seller `company`, standard key `default-distributor`); buyer cancels while it is `Awaiting approval` |
| Requires auth | yes |
| Required role | distributor |
| Destructive | yes (writes `distributorOrders`, increments `counters/distributororder-YYYYMM`, cancels an order) |
| Estimated steps | 34 |

## Preconditions
- App running at `http://localhost:8080`
- **Run only against the Firebase emulator or a dedicated test project — never the live makwell-websiteandcrm data. Mark BLOCKED if traffic would reach the live project.** Before TC-01, confirm in DevTools > Network that requests target the emulator or test project and not `makwell-websiteandcrm`.
- Signed in as `distributor` at `/crm/login.html` with env vars `QA_CRED_DISTRIBUTOR_USERNAME` / `QA_CRED_DISTRIBUTOR_PASSWORD`.
- Seed data (emulator/test project):
  - `products/qa-auto-geyser` = `{ name: "QA-AUTO Geyser", brand: "MakWell", status: "active" }`
  - `productModels/qa-auto-gy15` = `{ productId: "qa-auto-geyser", modelNumber: "GY-15L", gstRate: 18, status: "active" }` → label `QA-AUTO Geyser — GY-15L`
  - `productModels/qa-auto-gy25` = `{ productId: "qa-auto-geyser", modelNumber: "GY-25L", gstRate: 18, status: "active" }` → label `QA-AUTO Geyser — GY-25L`
  - `productModels/qa-auto-noprice` = `{ productId: "qa-auto-geyser", modelNumber: "NP-1", gstRate: 18, status: "active" }` with no price docs
  - `priceLists/company_default-distributor_qa-auto-gy15` = `{ seller: "company", buyer: "default-distributor", modelId: "qa-auto-gy15", price: 5000 }`
  - `priceLists/company_default-distributor_qa-auto-gy25` = `{ ..., modelId: "qa-auto-gy25", price: 7000 }`
- The `priceOnCreate_*` Cloud Function must run in the emulator for TC-01 step 9 (priced totals). If it does not, TC-01 step 9 is BLOCKED; the other steps still apply.

## Test data
- `line1 = { product: "QA-AUTO Geyser — GY-15L", qty: 2 }` → estimate: unit `₹5,000.00`, line total incl. 18% GST `₹11,800.00`
- `line2 = { product: "QA-AUTO Geyser — GY-25L", qty: 1 }` → unit `₹7,000.00`, line total `₹8,260.00`
- `expectedEstimate = "₹20,060.00"`
- `notes = "QA-AUTO order — deliver to Raichur, Karnataka 584101; contact 9000000101"`
- `badQtyZero = 0`, `badQtyDecimal = 1.5`, `badQtyOver = 401`
- `unitsOverCap = two lines, qty 300 + 101` (401 units)
- `tooLongNotes = 1001 × "a"` (the textarea has `maxlength="1000"`)
- Expected order id pattern: `^PE-DO-\d{8}-\d{4}-Distributor$`

## Steps

### TC-01: Happy path, place a two-line order with Head Office
1. Navigate to `/crm/CRMdistributor.html` and click the **`My Orders`** nav item.
2. Assert: `#page-title` is `My Orders` and `#page-sub` is `Orders placed with Pushpak Enterprises`. The `New order` panel shows one line row with a `Select product…` dropdown and Qty `1`, and `Estimated total:` shows `—`.
3. In row 1, select `QA-AUTO Geyser — GY-15L` and set Qty = `2`. Assert: `Est. unit price` = `₹5,000.00` and `Est. total incl. GST` = `₹11,800.00`.
4. Click **`+ Add product`**. In row 2, select `QA-AUTO Geyser — GY-25L` with Qty `1`. Assert: row 2 shows `₹7,000.00` / `₹8,260.00`, and `Estimated total:` = `₹20,060.00`.
5. Fill `Notes` (`#to-notes`) with `notes`.
6. Click **`Place order`**.
7. Assert: the button shows `Placing…` and is disabled while saving. Then the green `#to-success` reads `Placed — <orderId>. It's being priced and sent for approval.`, where `<orderId>` matches the expected pattern.
8. Assert: the form resets to a single empty line, Notes is empty, and `Estimated total:` is `—`.
9. Assert: the `My orders` list (refreshed automatically) shows a card for `<orderId>` at the top with the status pill `Awaiting approval`, both lines, and `Notes: QA-AUTO order — …`. Within about 10 s (after a refresh), `Pricing… (refresh in a few seconds)` is replaced by a priced table whose `Total` is `₹20,060.00`.
10. Assert: the card shows a **`Cancel order`** button.
11. Reload, then open `My Orders` again. Assert: the `<orderId>` card persists with the same status.

### TC-02: Order-line validation (`validateLines` messages, shown in `#to-error`)
Before each row, reload `My Orders` so the form is fresh. Click **`Place order`** after setting up the row's input. Assert that the exact error appears and that no new card appears in `My orders`.

| Setup | Exact error text |
|---|---|
| Leave the single line on `Select product…` | `The order has no lines.` |
| Line 1 = GY-15L, Qty `0` | `Line 1 has an invalid quantity.` |
| Line 1 = GY-15L, Qty `1.5` | `Line 1 has an invalid quantity.` |
| Line 1 = GY-15L, Qty empty | `Line 1 has an invalid quantity.` |
| Line 1 = GY-15L, Qty `401` | `Line 1 has an invalid quantity.` |
| Line 1 = GY-15L qty 1, Line 2 = GY-15L qty 1 | `The same product appears on two lines.` |
| Line 1 = GY-15L qty `300`, Line 2 = GY-25L qty `101` | `An order can have at most 400 units in total — place the rest as another order.` |
| Line 1 = `Select product…`, Line 2 = GY-15L qty `0` | Expected per source: `Line 1 has an invalid quantity.` The empty row is dropped before numbering, so the message points at the wrong visible row. **Log as a defect** if confirmed. |

### TC-03: Estimate edge states
1. Select `QA-AUTO Geyser — NP-1`. Assert: `Est. unit price` = `No price yet` and `Estimated total:` = `incomplete — Head Office/your distributor will price the missing items`.
2. Click the row's **`✕`** (Remove). Assert: the row is removed and the estimate recalculates (it shows `—` when no rows remain).
3. Click `+ Add product` repeatedly until there are 50 rows, then click once more. Assert: the row count stays at 50. Record that no message tells the user why. This is a UX observation.
4. Paste `tooLongNotes` into Notes. Assert: the field holds 1000 characters.

### TC-04: Buyer cancel (destructive), cancel the confirm, then proceed
1. On the TC-01 `<orderId>` card, click **`Cancel order`**.
2. Assert: the native confirm `Cancel this order?` appears. Click **Cancel** (dismiss).
3. Assert: there is no state change. The pill is still `Awaiting approval` and the button is still present.
4. Click **`Cancel order`** again and accept the confirm.
5. Assert: the list re-renders. The card shows the pill `Cancelled` and `Reason: Cancelled by buyer`, and the `Cancel order` button is gone.
6. Reload and reopen `My Orders`. Assert: the status is still `Cancelled`.

### TC-05: Negative and edge cases
- Cancel after approval: seed or have Head Office approve a second QA-AUTO order (`status: "confirmed"`). Assert: its card shows no `Cancel order` button. If you force the update in the console, firestore.rules must reject it, and the alert `Could not cancel — it may already have been approved. Refresh and check.` appears.
- Double-click `Place order` quickly. Assert: exactly one new order card or document is created. The button disables on the first click.
- Catalogue load failure: block Firestore and open `My Orders`. Assert: `Couldn't load the product catalogue.` appears.
- Inactive product, active model: set `products/qa-auto-geyser.status = "inactive"`, keeping the models `active`, then reopen `My Orders` (hard reload, because `catalogCache` is module-level). Expected per source: the models are **still selectable**. `loadCatalog` filters only `model.status` and ignores `productStatus`. Record it; if orderable, **log as a defect**.
- XSS: a notes value of `<img src=x onerror=alert(1)>` must render as literal text in the `My orders` card, with no alert.

## Assertions
- [ ] The estimate matches `₹11,800.00`, `₹8,260.00`, and `₹20,060.00` for the seeded prices.
- [ ] The success message contains an id matching `PE-DO-YYYYMMDD-NNNN-Distributor`.
- [ ] The new order appears with `Awaiting approval` and persists after reload.
- [ ] Every `validateLines` message renders verbatim and blocks the write.
- [ ] Buyer cancel needs confirmation, then sets `Cancelled` and `Reason: Cancelled by buyer`.
- [ ] No console errors in DevTools at any step (except the expected ones in TC-05).
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected.

## Screenshots required
- `My Orders` initial load
- Filled two-line form with the estimate
- Success message plus the new card
- Each validation error state
- `Cancel this order?` confirm, and the final `Cancelled` card

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
