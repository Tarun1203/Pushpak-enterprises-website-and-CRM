# T074-crm-warehouse-stock-adjustments-as-warehouse: Stock adjustments (Adjustment screen and Warehouse Stock "Adjust") with full validation

| Field | Value |
|---|---|
| Route | `/crm/CRMwarehouse.html` (sections `move-adjust`, `inv-warehouse`, `move-receive`, `my-change-requests`) |
| Source | `crm/CRMwarehouse.html` (`renderAdjustment`, `openWhAdjustModal`, `wh-adjust-form` submit, `openAdjustModal`, `adjust-form` submit, `fileStockReduction`) |
| Flow | Increase stock immediately; decreases are filed as Super Admin change requests |
| Requires auth | yes |
| Required role | warehouse |
| Destructive | no |
| Estimated steps | 44 |

## Preconditions
- App running at `http://localhost:8080`
- Signed in as `warehouse` at `/crm/login.html`. The runner resolves `QA_CRED_WAREHOUSE_USERNAME` / `QA_CRED_WAREHOUSE_PASSWORD`. Never type literal credentials.
- Run only against the Firebase emulator or a dedicated test project, never the live makwell-websiteandcrm data. This task writes to `inventory`, `stockMovements` and `changeRequests`.
- `spareParts/qa-part-element` = `{ name: "QA-AUTO Heating Element 2kW", partCode: "SP-9002", category: "Heating Element", brandCompatibility: "All", price: 650, reorderLevel: 3, createdAt: <now> }`
- `inventory/warehouse_qa-part-element` = `{ partId: "qa-part-element", location: "warehouse", quantity: 2 }`
- The `changeRequests` collection is empty for this user.

## Test data
**Adjust stock** modal (`#wh-adjust-form`, Adjustment screen):
- `wh-adjust-part` = `SP-9002 — QA-AUTO Heating Element 2kW`
- `wh-adjust-delta` (positive) = `5`
- `wh-adjust-delta` (negative) = `-1`
- `wh-adjust-reason` = `QA-AUTO physical count correction 584101`
- `zeroDelta = 0`, `blankReason = "   "` (3 spaces)

**Adjust Warehouse stock** modal (`#adjust-form`, Warehouse Stock → Adjust):
- `adjust-type` = `Add stock (received)` (value `add`)
- `adjust-qty` = `4`
- `adjust-reason` = `QA-AUTO purchased from supplier Raichur`
- Remove case: `adjust-type` = `Remove stock (issued/used)`, `adjust-qty` = `2`, `adjust-reason` = `QA-AUTO issued to SC-Raichur`
- Invalid: `adjust-qty = 0`, `adjust-qty = ""`, `shortReason = "ab"`

## Steps

### TC-01: Happy path. Increase stock from the Adjustment screen
1. Sign in as `warehouse`. Click nav **Adjustment** (`move-adjust`).
2. Assert: `#page-title` = `Adjustment`, `h2` `Stock adjustment` with the button **`+ New Adjustment`**, text `For corrections — physical counts, write-offs found outside the Returns process.`, and `h2` `Adjustment history`.
3. Click **`+ New Adjustment`**. Assert: `#wh-adjust-overlay` is visible with heading `Adjust stock`. `#wh-adjust-part` has the placeholder `Select part…` plus the option `SP-9002 — QA-AUTO Heating Element 2kW`. Delta and reason are empty.
4. Fill Part = SP-9002, Change = `5`, Reason = `QA-AUTO physical count correction 584101`.
5. Click **`Save adjustment`**.
6. Assert: the button shows `Saving…`, then `#wh-adjust-success` shows `Saved.` and the button reads `Saved`. The modal closes within 1.2 s.
7. Assert: the top row of `Adjustment history` shows today's date, Part `QA-AUTO Heating Element 2kW`, Change pill `.status-pill.ok` `+5`, Reason `QA-AUTO physical count correction 584101`.
8. Open **Warehouse Stock**. Assert: `SP-9002` Qty (WH) = `7` (2 + 5) and the pill changed from `Low` to `OK`.
9. Reload and reopen **Adjustment**. Assert: the `+5` row is still present.

### TC-02: Happy path. Receive stock from Warehouse Stock → Adjust
1. Open **Warehouse Stock**. On row `SP-9002`, click **`Adjust`**.
2. Assert: `#adjust-overlay` is visible with heading `Adjust Warehouse stock`, and `#adjust-part-label` = `SP-9002 — QA-AUTO Heating Element 2kW`. Action defaults to `Add stock (received)` and Quantity = `1`.
3. Set Quantity = `4`, Reason = `QA-AUTO purchased from supplier Raichur`. Click **`Save`**.
4. Assert: `#adjust-success` = `Stock updated.`, the modal closes within 1.2 s, and the table refreshes in place with `SP-9002` Qty (WH) = `11`.
5. Open **Receive** (`move-receive`). Assert: the newest row has Type pill `Receive`, Part `SP-9002 — QA-AUTO Heating Element 2kW`, Qty `4`, Location `Warehouse`, Reason `QA-AUTO purchased from supplier Raichur`.

### TC-03: Reductions are routed to Super Admin, with no immediate stock change
1. **Adjustment screen, negative delta:** open **`+ New Adjustment`**. Set Part SP-9002, Change `-1`, Reason `QA-AUTO physical count correction 584101`. Click **`Save adjustment`**.
2. Assert: `#wh-adjust-success` = `Sent to Super Admin for approval — stock changes once approved.`, the button reads `Sent`, and the modal closes within 2 s.
3. Assert: **Warehouse Stock** `SP-9002` is still `11`, and no `-1` row appears in Adjustment history.
4. **Warehouse Stock, Remove:** click **`Adjust`** on SP-9002. Set Action `Remove stock (issued/used)`, Quantity `2`, Reason `QA-AUTO issued to SC-Raichur`. Click **`Save`**.
5. Assert: `#adjust-success` = `Sent to Super Admin for approval — stock changes once approved.` and Qty (WH) is still `11`.
6. Open **My Change Requests**. Assert: 2 rows, newest first, each showing status `Waiting for Super Admin` and the button **`Withdraw`**:
   - `Issue out 2 × QA-AUTO Heating Element 2kW — QA-AUTO issued to SC-Raichur`
   - `Write off / correct 1 × QA-AUTO Heating Element 2kW — QA-AUTO physical count correction 584101`
   (T076 withdraws these.)

### TC-04: Form validation. `wh-adjust-form` (Adjust stock)
The form uses native `required` (no `novalidate`), so empty required fields are blocked by the browser before the JS runs. Assert the field matches `:invalid` and that no write happens. The JS message appears only for values that pass the native check.

| Field | Empty value | Value that passes native check but fails JS | Expected |
|---|---|---|---|
| Part (`#wh-adjust-part`) | `Select part…` | n/a | Native block: `#wh-adjust-part:invalid`, browser tooltip, no `Saving…` |
| Change (`#wh-adjust-delta`) | `""` | `0` | Empty: native block. `0`: `#wh-adjust-error` = `Select a part, a non-zero change, and a reason.` |
| Change | n/a | `abc` (type is number, so input rejects it and it stays empty) | Native block |
| Reason (`#wh-adjust-reason`) | `""` | `"   "` (spaces) | Empty: native block. Spaces: `Select a part, a non-zero change, and a reason.` |

After each case, assert: the modal is still open, the history is unchanged and Warehouse qty is unchanged.

### TC-05: Form validation. `adjust-form` (Adjust Warehouse stock)

| Field | Case | Expected |
|---|---|---|
| Quantity (`#adjust-qty`) | `""` | Native block (`required`) |
| Quantity | `0` | Native block (`min="1"` → `rangeUnderflow`) |
| Quantity | `-3` | Native block (`rangeUnderflow`) |
| Quantity | `1.5` | Native block (`step` mismatch; default step 1) |
| Reason, Action = Remove | `ab` (`shortReason`) | `#adjust-error` = `Give a reason.`, button back to `Save`, no change request filed |
| Reason, Action = Remove | `""` | `Give a reason.` |
| Reason, Action = Add | `""` | Allowed. Saves with an empty reason (Reason is optional for Add). Use Quantity `1`, then verify Qty goes up by 1 |

### TC-06: Modal coverage. Cancel and backdrop close
1. Open **`+ New Adjustment`**, type Change `9`, then click **`Cancel`** (`#cancel-wh-adjust`). Assert: the modal closes and nothing is written.
2. Reopen. Assert: the fields were reset (Change is empty). Click the dark backdrop outside `.modal`. Assert: it closes.
3. Repeat steps 1–2 for **`Adjust`** → **`Cancel`** (`#cancel-adjust`). Assert: on reopen, Quantity is back to `1` and Action is `Add stock (received)`.

### TC-07: Negative & edge cases
- **Very large increase:** Change `100000`. Expected: saves, and Qty shows `100011`. No overflow formatting issue.
- **Decimal delta:** Change `2.5` on `#wh-adjust-delta` (no `step` attribute, default 1). Expected: native step mismatch blocks it. If the build accepts it, log a defect: fractional stock possible.
- **Part with no inventory doc:** seed `spareParts/qa-part-valve` (SP-9003, no inventory). Adjust +2. Expected: `inventory/warehouse_qa-part-valve` is created with quantity 2, and the Warehouse Stock pill changes from `Out of stock` to `Low` (2 ≤ reorder 2).
- **Offline save:** go offline and submit +1. Expected: `#wh-adjust-error` shows a Firestore error message (or `Could not save this adjustment. Check console for details.`), and the button returns to `Save adjustment`.

## Assertions
- [ ] Positive adjustments apply immediately and log `adjustment`/`receive` movements.
- [ ] Negative/remove adjustments create `changeRequests` (kind `stock_reduction`, status `pending`) and do **not** change stock.
- [ ] All validation messages match the source text exactly.
- [ ] Cancel and backdrop close without writing.
- [ ] No console errors in DevTools at any step, except the deliberate offline case.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected.

## Screenshots required
- Adjustment screen initial load
- Adjust stock modal filled; `Saved.` state
- Adjust Warehouse stock modal; `Stock updated.` state
- "Sent to Super Admin for approval" state
- Each validation error state (native tooltip and JS error)
- My Change Requests with 2 pending rows

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
