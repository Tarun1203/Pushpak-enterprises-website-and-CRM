# T092-crm-crmdealer-place-trade-order-as-dealer: Place a priced trade order, validate lines, cancel it

| Field | Value |
|---|---|
| Route | `/crm/CRMdealer.html` (sidebar `My Orders`) |
| Source | `crm/CRMdealer.html` → `crm/tradeOrders.js` (`renderOrderForm`, `renderMyOrders`), `crm/tradePricing.js` (`validateLines`), `crm/finance.js` (`creditCheck`) |
| Flow | Place a new order (pricing estimate, server pricing, credit limit / overdue context, buyer cancel) |
| Requires auth | yes |
| Required role | dealer |
| Destructive | yes (Cancel order) |
| Estimated steps | 40 |

## Preconditions
- App running at `http://localhost:8080`
- **Run only against the Firebase emulator or a dedicated test project — never the live makwell-websiteandcrm data. Mark BLOCKED if traffic would reach the live project.** Orders write to `dealerOrders` and increment `counters/dealerorder-<YYYYMM>`; Cloud Functions (`priceOnCreate_*`) must run in the emulator for TC-01 step 9 — if Functions are not emulated, mark that step BLOCKED rather than running against live.
- Signed in as `dealer` (Direct dealer, i.e. `distributionType` not `underDistributor`) via env `QA_CRED_DEALER_USERNAME` / `QA_CRED_DEALER_PASSWORD`.
- Seed (emulator):
  - Product `QA-AUTO Geyser` (`products`) with model `QA-GZ-15L` (`productModels`, `status: active`, `gstRate: 18`) → label `QA-AUTO Geyser — QA-GZ-15L`.
  - Product `QA-AUTO Wall Mount` with model `QA-WM-43` (`status: active`, `gstRate: 18`).
  - Model `QA-AUTO Remote — QA-RM-1` with **no** price for this dealer (no `priceLists` doc).
  - `priceLists/company_default-dealer_<QA-GZ-15L id>` = `{ seller: "company", buyer: "default-dealer", price: 5000 }`.
  - `priceLists/company_<dealerUid>_<QA-WM-43 id>` = `{ seller: "company", buyer: "<dealerUid>", price: 800 }`.
  - `tradeAccounts/<dealerUid>` = `{ creditLimit: 100000, outstanding: 0, paymentTermsDays: 30 }` for TC-01; TC-05 changes it.

## Test data
- Line A: product `QA-AUTO Geyser — QA-GZ-15L`, qty `2` → est. unit `₹5,000.00`, est. total incl. GST `₹11,800.00`
- Line B: product `QA-AUTO Wall Mount — QA-WM-43`, qty `3` → est. unit `₹800.00`, est. total `₹2,832.00`
- Expected estimated total: `₹14,632.00`
- `notes = "QA-AUTO order — Raichur 584101"`
- Invalid: `qtyZero = 0`, `qtyFraction = 1.5`, `qtyOver = 401`, `unitsOver = 2 lines × 201`, `notesTooLong = 1001 × "a"` (field `maxlength=1000`)

## Steps

### TC-01: Happy path — place a two-line priced order
1. Sign in as `dealer`. Navigate to `/crm/CRMdealer.html`. Click `My Orders`.
2. Assert: `#page-sub` = `Orders placed with Pushpak Enterprises`; panel `New order` shows one line with `Select product…`, qty `1`, `Estimated total: —`, helper text `Estimate from your price list. The final price is set when the order is placed.`
3. Select Line A product, set qty `2`. Assert: `Est. unit price` = `₹5,000.00`, `Est. total incl. GST` = `₹11,800.00` (standard price applies).
4. Click **`+ Add product`**. Select Line B product, set qty `3`. Assert: unit `₹800.00`, total `₹2,832.00` (account price overrides standard).
5. Assert: `Estimated total:` = `₹14,632.00`.
6. Fill `Notes` = `QA-AUTO order — Raichur 584101`.
7. Click **`Place order`**.
8. Assert: button shows `Placing…` then `Place order`; green text `Placed — PE-DO-<YYYYMMDD>-<NNNN>-Dealer. It's being priced and sent for approval.` (today's date, 4-digit serial); form resets to one empty line, notes cleared, `Estimated total: —`.
9. Assert: `My orders` list shows the new order first with pill `Awaiting approval`, the two lines, and `Notes: QA-AUTO order — Raichur 584101`. Within ~10 s (reload `My Orders`) the card shows Unit price / GST `18%` / Line total and a bold total `₹14,632.00`; `Pricing… (refresh in a few seconds)` is gone.
10. Reload the page, return to `My Orders`. Assert the order persists. Assert `Dashboard` > `Orders Placed` increased by 1.

### TC-02: Form validation — `New order` lines (client messages from `TradePricing.validateLines`)
Reload `My Orders` before each row. Error renders in red `#to-error` above `Place order`; no order is created (list count unchanged).

| Case | Input | Expected error text |
|---|---|---|
| No product selected | leave `Select product…`, click `Place order` | `The order has no lines.` |
| Quantity 0 | Line A, qty `0` | `Line 1 has an invalid quantity.` |
| Fractional qty | Line A, qty `1.5` | `Line 1 has an invalid quantity.` |
| Qty above 400 | Line A, qty `401` | `Line 1 has an invalid quantity.` |
| Empty qty | Line A, qty cleared | `Line 1 has an invalid quantity.` |
| Duplicate product | Line A qty 1 + second line also Line A qty 1 | `The same product appears on two lines.` |
| Units over 400 | Line A qty `201` + Line B qty `201` | `An order can have at most 400 units in total — place the rest as another order.` |
| Max lines | click `+ Add product` until 50 lines; click once more | line count stays 50, no error, no crash |
| Notes max length | paste 1001 chars | textarea holds exactly 1000 chars |

### TC-03: Pricing estimate edge cases
1. Select `QA-AUTO Remote — QA-RM-1`. Assert: unit cell `No price yet`; `Estimated total:` = `incomplete — Head Office/your distributor will price the missing items`.
2. Place the order with that line only. Assert success text appears; within ~10 s the card shows `Price incomplete:` with `…: no price set`, no total; record that the order is still `Awaiting approval`.
3. Remove a line with **`✕`**. Assert the estimate recalculates immediately.

### TC-04: Destructive — `Cancel order`
1. On the order from TC-01 (status `Awaiting approval`), click **`Cancel order`**.
2. In the browser confirm `Cancel this order?` click **Cancel**. Assert: no change, pill still `Awaiting approval`.
3. Click **`Cancel order`** again, confirm **OK**.
4. Assert: list re-renders; pill `Cancelled`; text `Reason: Cancelled by buyer`; no `Cancel order` button on that card.
5. Assert: orders in status `Approved`/`Dispatched`/`Delivered` never show `Cancel order`.

### TC-05: Credit limit / overdue context (dealer view)
1. Emulator: set `tradeAccounts/<dealerUid>` = `{ creditLimit: 10000, outstanding: 9000 }`. Place an order with Line A qty 1 (`₹5,900.00`).
2. Assert: order is accepted with the normal success text (credit is checked at approval, not placement). Record whether ANY credit/over-limit warning is shown to the dealer on the `New order` panel (source shows none — log as UX gap if business expects a warning).
3. Open `Account & Invoices`. Assert: `Credit limit ₹10,000.00`, `Outstanding ₹9,000.00`, `Available ₹1,000.00`.
4. Emulator: set `oldestUnpaidDue` to yesterday. Reload `Account & Invoices`. Assert red text `You have an overdue invoice (due <dd/mm/yyyy>). New orders can't be approved until it is paid.`
5. (Optional, Head Office session) Attempt approval in Super Admin/Warehouse queue → expect `Over credit limit: owes 9000.00, this order makes it 14900.00, limit 10000.00` and overdue reason. Restore account seed afterwards.

### TC-06: Negative & edge cases
- Offline after filling Line A → `Place order`: Assert `Could not place this order. Check console for details.` and the button re-enables.
- Catalogue load failure (block `productModels` read): Assert `Couldn't load the product catalogue.`
- Legacy modal: Assert there is NO visible button that opens the `Place a new order` modal (`#order-overlay`, free-text `Product / model`). If any path opens it, submit `QA-AUTO legacy` qty 1 and log that it creates an unpriced free-text order (defect).
- Under-distributor dealer (if a second seeded dealer exists): `#page-sub` = `Orders placed with <distributorName>`; estimates use the distributor's `default` list; card shows `· via <distributorName>`.

## Assertions
- [ ] Estimate figures match the Test data exactly (₹ en-IN format, 2 decimals).
- [ ] Success text format `Placed — PE-DO-YYYYMMDD-NNNN-Dealer. It's being priced and sent for approval.`
- [ ] Every validation row shows its exact message and creates no order.
- [ ] Cancel requires confirm and results in `Cancelled` + `Reason: Cancelled by buyer`.
- [ ] Account figures and overdue banner match seed.
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected (offline case).

## Screenshots required
- `My Orders` initial load
- Estimate with two lines
- Success message + new card
- Priced card after server pricing
- Each validation error state
- `Price incomplete` card
- Cancel confirm dialog and `Cancelled` card
- Account page with overdue banner

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
