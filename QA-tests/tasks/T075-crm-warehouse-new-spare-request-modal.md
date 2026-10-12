# T075-crm-warehouse-new-spare-request-modal: Modals — New spare request, Transfer stock, and Add/Edit spare part

| Field | Value |
|---|---|
| Route | `/crm/CRMwarehouse.html` (sections `requests-new`, `spareparts`) |
| Source | `crm/CRMwarehouse.html` (`#new-request-overlay`, `newRequestForm` submit, `generateRequestId`, `#transfer-form` submit, `#part-overlay`, `openPartModal`, `partForm` submit, `generatePartCode`) |
| Flow | Fill and submit "New spare request"; validate "Transfer stock"; fill and submit "Add spare part", edit it, and send a price change to Super Admin |
| Requires auth | yes |
| Required role | warehouse |
| Destructive | no |
| Estimated steps | 60 |

## Preconditions
- App running at `http://localhost:8080`
- Signed in as `warehouse` at `/crm/login.html`. The runner resolves `QA_CRED_WAREHOUSE_USERNAME` / `QA_CRED_WAREHOUSE_PASSWORD`. Never type literal credentials.
- Run only against the Firebase emulator or a dedicated test project, never the live makwell-websiteandcrm data. This task writes to `spareRequests` and `counters/sparerequest-YYYYMM`.
- `spareParts/qa-part-thermo` (SP-9001 `QA-AUTO Geyser Thermostat 15L`) and one `servicecenter` user `QA-AUTO Raichur Service Center` are seeded (as in T073).

## Test data
- `req-center` = `QA-AUTO Raichur Service Center 584101`
- `req-item` = `QA-AUTO Geyser Thermostat 15L`
- `req-qty` = `2`
- `req-priority` = `Urgent` (value `urgent`)
- `req-notes` = `QA-AUTO customer 9000000021, Raichur, Karnataka`
- Second valid record: `req-center` = `QA-AUTO Raichur Service Center 584101`, `req-item` = `QA-AUTO Safety Valve`, `req-qty` = `1`, `req-priority` = `Normal`, `req-notes` = `""`
- Invalid: `emptyRequired = ""`, `zeroQty = 0`, `negQty = -1`, `spacesOnly = "   "`, `longItem = 500 × "a"`, `xssItem = "<script>alert('qa')</script>"`

## Steps

### TC-01: Happy path. Create an urgent spare request
1. Sign in as `warehouse`. Click nav **New Requests** (`requests-new`).
2. Click **`+ New Request`**. Assert: `#new-request-overlay` is visible with heading `New spare request`, and the fields are labelled `Requesting Service Center`, `Part / item`, `Quantity` (default `1`), `Priority` (default `Normal`), `Notes (optional)`. Placeholders: `e.g. Hubli Service Center`, `e.g. Geyser thermostat, 15L`, `Any additional context…`.
3. Fill every field with the first valid Test data set.
4. Click **`Create request`**.
5. Assert: the button reads `Creating…`, then `#new-request-success` shows `Created — PE-SR-<YYYYMMDD today>-<NNNN>-Warehouse`, and the modal closes within 1.5 s.
6. Assert: the New Requests table refreshes and its top row shows that Request ID, Service Center `QA-AUTO Raichur Service Center 584101`, Item `QA-AUTO Geyser Thermostat 15L`, Qty `2`, Priority `URGENT` (`.priority-tag.urgent`), pill `New`, and buttons **`Approve`** / **`Back Order`**.
7. Open the row's ID link. Assert: `Notes: QA-AUTO customer 9000000021, Raichur, Karnataka` and `Address: Not on file yet` (free text, no linked account).
8. Reload. Assert: the row is still present.
9. Create the second valid record. Assert: the serial `NNNN` is exactly one more than the first, and the new row shows `NORMAL`.

### TC-02: Form validation. `new-request-form`
Native `required` / `min` apply (no `novalidate`). The JS handler itself does **no** validation.

| Field | Empty value | Pattern / range violation | Max-length overflow |
|---|---|---|---|
| Requesting Service Center | `""` → native block, `#req-center:invalid` | `"   "` → **passes** and saves with an empty `serviceCenter` (no trim check). Log a defect if it saves | `longItem` → accepted (no `maxlength`). Record it |
| Part / item | `""` → native block | `"   "` → passes and saves with an empty `item`. Log a defect | `longItem` → accepted; the table cell wraps without breaking the layout |
| Quantity | `""` → native block | `0`, `-1` → native block (`min=1`); `1.5` → native step block | n/a |
| Priority | n/a (select) | n/a | n/a |
| Notes (optional) | `""` → allowed | n/a | n/a |

For each blocked case assert: the button never shows `Creating…`, no success text appears and the row count is unchanged. Delete any row created by the defect cases afterwards (Admin SDK).

### TC-03: Modal coverage. Cancel, backdrop and reset
1. Open **`+ New Request`**. Type Requesting Service Center `QA-AUTO discard`. Click **`Cancel`** (`#cancel-new-request`). Assert: the modal closes and no row is added.
2. Reopen. Assert: all fields were reset (Quantity `1`, Priority `Normal`).
3. Click the backdrop. Assert: the modal closes.

### TC-04: Transfer stock modal validation (`transfer-form`)
1. Click **`+ New Transfer`**. Assert: heading `Transfer stock`.

| Case | Expected |
|---|---|
| Part `Select part…`, To selected, Qty `1` | Native block (`required` on select) |
| Part selected, To `Select destination…` | Native block |
| Qty `""` | Native block |
| Qty `0` | Native block (`min=1`) |
| All valid, Reason empty | Saves. The detail popup later shows `Notes: Warehouse-initiated transfer` |

2. Click **`Cancel`** (`#cancel-transfer`). Assert: the modal closes and no row is added to **Approved**.

### TC-05: Negative & edge cases
- **XSS:** Part / item = `xssItem`. Expected: saves, and the table and detail popup show the literal text. No alert fires.
- **Offline submit:** go offline and submit valid data. Expected: `#new-request-error` = `Could not create request. Check console for details.` and the button returns to `Create request`.
- **Double click:** double-click **`Create request`** quickly. Expected: exactly one request is created (the button is disabled during the save).
- **Live toast suppression:** after TC-01, expect **no** `New spare request` toast for your own write (`hasPendingWrites` is skipped).

---
### Part B — `part-overlay` (Add / Edit spare part)
Extra precondition: note the current `counters/sparepart-master.value` (call it `N`, which is 0 if absent). The new part's code is `SP-` + pad4(N+1); call it `{CODE}`. This part also writes `spareParts`, `counters/sparepart-master` and `changeRequests`.

Part B test data:
- `part-name` = `QA-AUTO Geyser Thermostat 25L`
- `part-category` = `Thermostat`
- `part-brand` = `MakWell`
- `part-price` = `525.50`
- `part-reorder` = `6`
- Non-price edit: Category → `Thermostat Assembly`, Reorder level → `8`
- Price edit: Price → `560`

### TC-06: Happy path. Add a spare part
1. Click nav **Spare Parts**. Assert: `h2` `Spare parts master list`, button **`+ Add part`**, columns Code / Name / Category / Brand / Price / Reorder Level / Actions.
2. Click **`+ Add part`**. Assert: `#part-modal-title` = `Add spare part`, Brand compatibility = `All brands`, Reorder level = `5`, and the button reads **`Save part`**.
3. Fill every field with the Part B data. Click **`Save part`**.
4. Assert: `Saving…`, then `#part-success` = `Saved.`, and the modal closes within 1.2 s.
5. Assert: the top row shows Code `{CODE}`, Name `QA-AUTO Geyser Thermostat 25L`, Category `Thermostat`, Brand `MakWell`, Price `₹525.5`, Reorder Level `6`, and the button **`Edit`**.
6. Assert: **Warehouse Stock** and **Low / Out of Stock** both list `{CODE}` with Qty `0` and pill `Out of stock`. Reload, then confirm the Spare Parts row persists.

### TC-07: Edit without a price change (applies immediately)
1. Click **`Edit`** on `{CODE}`. Assert: the title is `Edit {CODE}`, the fields are prefilled, and the button reads **`Save changes`**.
2. Set Category `Thermostat Assembly` and Reorder level `8`. Click **`Save changes`**. Assert: `Saved.` The row updates, Price stays `₹525.5`, and no `changeRequests` doc is created.

### TC-08: Edit with a price change (goes to Super Admin)
1. Click **`Edit`**. Set Price `560`. Click **`Save changes`**.
2. Assert: `#part-success` = `Saved. The price change was sent to Super Admin for approval and will apply once approved.` The row Price is still `₹525.5`.
3. Assert: **My Change Requests** shows `Spare part price change — {CODE} (QA-AUTO Geyser Thermostat 25L): ₹525.5 → ₹560`, `Waiting for Super Admin`.

### TC-09: Form validation. `part-form`

| Field | Empty value | Pattern / range violation | Max-length overflow |
|---|---|---|---|
| Part name | `""` → native block, `#part-name:invalid` | `"   "` → passes and saves a part with an empty name. Log a defect if it saves | none enforced (300 chars accepted) |
| Category | allowed (shows `—`) | n/a | n/a |
| Price (₹) | allowed (shows `—`) | `-1` blocked (`min=0`); `1.234` blocked (`step=0.01`) | n/a |
| Reorder level | allowed, saved as `0` | `-2` blocked (`min=0`); `2.5` blocked (step) | n/a |

For blocked cases, assert: no `Saving…`, no new row, and the counter is unchanged.

### TC-10: Modal coverage. Cancel, backdrop and reset
1. Open **`+ Add part`**, type a name, then click **`Cancel`** (`#cancel-part`). Assert: no row is added and the counter does not increment.
2. Open **`Edit`**, then click the backdrop. Assert: it closes and nothing changes.
3. After an Edit, open **`+ Add part`**. Assert: the title is `Add spare part`, the fields are empty, Reorder is `5`, and `#part-editing-id` is empty.

### TC-11: Part B edge cases
- **Duplicate name:** saves a second part with the next code (no uniqueness check). Record this as an observation.
- **Offline save:** `#part-error` = `Could not save this part. Check console for details.`
- **XSS name** `<img src=x onerror=alert(1)>`: renders as literal text in Spare Parts, Warehouse Stock and the Transfer part dropdown.

## Assertions
- [ ] A new part gets a sequential `SP-NNNN` code. A non-price edit applies at once. A price edit creates a pending `spare_price` change request and does not change the price.
- [ ] The success text matches `Created — PE-SR-YYYYMMDD-NNNN-Warehouse`.
- [ ] The new row shows the exact values and the URGENT tag.
- [ ] Required/min validation blocks submission. Whitespace-only defects are logged if present.
- [ ] Cancel and backdrop do not write.
- [ ] No console errors in DevTools at any step, except the deliberate offline case.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected.

## Screenshots required
- Modal opened (empty)
- Modal filled before submit
- Success message
- Each validation error state
- Final New Requests list with the new row
- Add part modal filled; `Saved.`; the price-change success message; final Spare Parts list

## Pass criteria
All TCs above pass AND no unexpected console/network errors. Whitespace-acceptance results are reported as defects, not runner failures.
