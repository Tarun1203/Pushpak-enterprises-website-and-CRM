# T073-crm-warehouse-fulfil-spare-request-as-warehouse: Fulfil a spare request through the pipeline and verify the stock moves on dispatch

| Field | Value |
|---|---|
| Route | `/crm/CRMwarehouse.html` (sections `requests-*`, `inv-warehouse`, `inv-servicecenter`, `move-history`) |
| Source | `crm/CRMwarehouse.html` (`openTransferModal`, transfer submit, `STATUS_ACTIONS`, `advanceRequest`, `openWhDispatchPopup`, `resolveInventoryLocationForRequest`, `resolvePartForRequest`) |
| Flow | Transfer stock → Approved → Picking → Packing → Dispatch (stock moves) → In Transit → Received |
| Requires auth | yes |
| Required role | warehouse |
| Destructive | no (it writes stock, but along the normal business path) |
| Estimated steps | 46 |

## Preconditions
- App running at `http://localhost:8080`
- Signed in as `warehouse` at `/crm/login.html`. The runner resolves `QA_CRED_WAREHOUSE_USERNAME` / `QA_CRED_WAREHOUSE_PASSWORD`. Never type literal credentials.
- Run only against the Firebase emulator or a dedicated test project, never the live makwell-websiteandcrm data. This task writes to `spareRequests`, `counters`, `inventory` and `stockMovements`.
- Seeded `users/{SC_UID}` = `{ role: "servicecenter", name: "QA-AUTO Raichur Service Center", email: <servicecenter test account email>, phone: "9000000011", address: "QA-AUTO 1 Station Road, Raichur, Karnataka 584101", pincodesCovered: ["584101"], districtsCovered: ["Raichur"] }`
- `pincodes/584101` = `{ area: "Station Road", city: "Raichur", district: "Raichur", state: "Karnataka", active: true }`
- `spareParts/qa-part-thermo` = `{ name: "QA-AUTO Geyser Thermostat 15L", partCode: "SP-9001", category: "Thermostat", brandCompatibility: "MakWell", price: 450, reorderLevel: 5, createdAt: <now> }`
- `inventory/warehouse_qa-part-thermo` = `{ partId: "qa-part-thermo", location: "warehouse", quantity: 20 }`
- No `inventory/servicecenter_{SC_UID}_qa-part-thermo` doc exists before the run.

## Test data
- Transfer form:
  - `transfer-part` = option text `SP-9001 — QA-AUTO Geyser Thermostat 15L`
  - `transfer-destination` = option text `QA-AUTO Raichur Service Center — Service Center`
  - `transfer-qty` = `3`
  - `transfer-reason` = `QA-AUTO restock ahead of geyser season`
- Dispatch form:
  - `wh-disp-qty` = `3` (prefilled)
  - `wh-disp-transporter` = `QA-AUTO VRL Logistics`
  - `wh-disp-docket` = `QA-LR-584101-001`
  - `wh-disp-vehicle` = `KA36QA0001`
  - `wh-disp-date` = today (prefilled, `YYYY-MM-DD`)
  - `wh-disp-photo` = none
- Invalid values: `overQty = 4` (more than requested), `emptyTransporter = ""`, `emptyDocket = ""`
- Expected ID pattern: `^PE-SR-\d{8}-\d{4}-Warehouse$` (call the created value `{SR}`)

## Steps

### TC-01: Happy path. Create a transfer and take it through to Received
1. Sign in as `warehouse`. Click nav **New Requests** (`requests-new`).
2. Click **`+ New Transfer`**. Assert: `#transfer-overlay` is visible with heading `Transfer stock` and the note starting `Creates a request that goes through the same Approved → Picking → Packing → Dispatch → In Transit pipeline`.
3. Assert: `#transfer-part` lists `SP-9001 — QA-AUTO Geyser Thermostat 15L`. `#transfer-destination` lists `QA-AUTO Raichur Service Center — Service Center`. `#transfer-qty` = `1`.
4. Fill: Part → SP-9001 option. To → QA-AUTO Raichur Service Center option. Quantity → `3`. Reason → `QA-AUTO restock ahead of geyser season`.
5. Click **`Create transfer`**.
6. Assert: the button briefly reads `Creating…`, then `#transfer-success` shows `Created — {SR}. It now needs picking, packing & dispatch, same as any other request.`, where `{SR}` matches the ID pattern. The button reads `Done`. The modal closes within 1.5 s.
7. Assert: **New Requests** does not list `{SR}`. Transfers start at `approved`.
8. Click nav **Approved**. Assert: a row with link `{SR}`, Service Center `QA-AUTO Raichur Service Center` (resolved from `users/{SC_UID}`), Item `QA-AUTO Geyser Thermostat 15L`, Qty `3`, Priority `NORMAL`, pill `Approved`, buttons **`Start Picking`** and **`Back Order`**.
9. Click `{SR}`. Assert: the detail popup `Spare Request — {SR}` shows `Service Center: QA-AUTO Raichur Service Center`, `Address: QA-AUTO 1 Station Road, Raichur, Karnataka 584101`, `District: Raichur`, `State: Karnataka`, `Contact:` containing `9000000011`, and `Notes: QA-AUTO restock ahead of geyser season`. Click **`Close`**.
10. Click **`Start Picking`**. Assert: the row leaves Approved. In nav **Picking**, the row shows pill `Picking` and button **`Mark Packed`**.
11. Click **`Mark Packed`**. In nav **Packing**, the row shows pill `Packing` and button **`Dispatch`**.
12. Before dispatching, open **Warehouse Stock**. Assert: `SP-9001` Qty (WH) = `20`. The stock has not moved yet. Return to **Packing**.
13. Click **`Dispatch`**. Assert: the popup title is `Dispatch — {SR}`. The body shows `Item: QA-AUTO Geyser Thermostat 15L`, `Requested qty: 3`, `Warehouse stock of QA-AUTO Geyser Thermostat 15L: 20`, and a ship-to box `Ship to (Service Center)` with `QA-AUTO Raichur Service Center · 9000000011` and the address. Neither the "Couldn't match this item…" warning nor the "Couldn't identify which center…" warning is shown.
14. Assert: the transport form label reads `Quantity to dispatch (max 20 in stock)`, `#wh-disp-qty` = `3`, and `#wh-disp-date` = today.
15. Fill Transporter `QA-AUTO VRL Logistics`, Docket `QA-LR-584101-001`, Vehicle `KA36QA0001`. Click **`Transfer stock & dispatch`**.
16. Assert: the button shows `Processing…`, then the popup closes, and `{SR}` leaves the Packing list.
17. Click nav **Dispatch**. Assert: `{SR}` has pill `Dispatched` and button **`Mark In Transit`**. Open `{SR}`. Assert: the `Transport / dispatch details` block shows `Dispatched qty: 3`, `Transporter: QA-AUTO VRL Logistics`, `Docket/LR/AWB: QA-LR-584101-001`, `Vehicle No.: KA36QA0001`, and `Dispatch date:` today. The **`Fix inventory location`** button is **absent** (`destInventoryFixed: true`). Close the popup.
18. Click **`Mark In Transit`**. In **In Transit**, click **`Mark Received`**. Assert: the row leaves In Transit. No stage tab lists `{SR}`; `received` has no tab.

### TC-02: Stock effect of the dispatch
1. Open **Warehouse Stock**. Assert: `SP-9001` Qty (WH) = `17` (20 − 3), and the status pill is `OK`.
2. Open **Service Center Stock**. Assert: a row with Service Center link `QA-AUTO Raichur Service Center`, Code `SP-9001`, Part `QA-AUTO Geyser Thermostat 15L`, Qty `3`, Reorder Level `5`, pill `Low` (3 ≤ 5).
3. Click the `QA-AUTO Raichur Service Center` link. Assert: `#wh-center-profile-overlay` opens with title `QA-AUTO Raichur Service Center — full profile`. Click **`Close`**.
4. Open **Movement History**. Assert: the newest row has Type pill `Transfer`, Part `SP-9001 — QA-AUTO Geyser Thermostat 15L` and Qty `3`.
5. Data check (emulator): `inventory/servicecenter_{SC_UID}_qa-part-thermo` = `{ location: "servicecenter", serviceCenterUid: SC_UID, partId: "qa-part-thermo", quantity: 3 }`. Exactly one new `stockMovements` doc exists with `type: "transfer"`, `from: "warehouse"`, `to: "servicecenter_{SC_UID}"`, `sourceRequestId` = the request doc ID, and `transport.docket: "QA-LR-584101-001"`.
6. Reload the page and repeat steps 1–2. Assert: the values persist (17 and 3).

### TC-03: Dispatch validation (inside the dispatch popup)
Setup: create a second transfer for 3 units (as TC-01 steps 2–6) and advance it to Packing. Call it `{SR2}`.

| Input | Action | Expected inline error in `#wh-disp-error` (becomes visible) | Stock change |
|---|---|---|---|
| Transporter empty, Docket `QA-LR-584101-002` | Click **`Transfer stock & dispatch`** | `Quantity, transporter, docket number and dispatch date are required.` | none |
| Transporter `QA-AUTO VRL Logistics`, Docket empty | click | same message | none |
| Date cleared | click | same message | none |
| Quantity `0` | click | same message | none |
| Quantity `4` (`overQty`) | click | `This request is for 3 — you can't dispatch more than was asked for.` | none |

After each row, assert: the popup is still open, the request is still in Packing, and Warehouse Stock `SP-9001` is unchanged (17).

### TC-04: Insufficient stock blocks the dispatch
1. Set `inventory/warehouse_qa-part-thermo.quantity` = `2` in the emulator. Open `{SR2}` from Packing (it requests 3).
2. Assert: the label reads `(max 2 in stock)` and `#wh-disp-qty` is prefilled with `2`. Set the quantity to `3` and fill transporter/docket.
3. Click **`Transfer stock & dispatch`**. Assert: the error `Only 2 in warehouse stock — reduce the quantity.` appears and nothing changes.
4. Set the quantity to `2` and dispatch. Assert: success. Warehouse = 0. The service center qty goes 3 → 5. In Low / Out of Stock, `SP-9001` shows `Out of stock`.

### TC-05: Negative & edge cases
- **Double-dispatch guard:** open the dispatch popup for a Packing request in two tabs. Dispatch in tab A, then click **`Transfer stock & dispatch`** in tab B. Expected: `#wh-disp-error` = `This request has already been dispatched — refresh the list.`, and stock is debited only once.
- **Free-text request with no linked account:** use **`+ New Request`** with Requesting Service Center `QA-AUTO Unlinked Center Raichur`, Part / item `QA-AUTO Geyser Thermostat 15L`, Quantity `1`. Approve it, then Start Picking, Mark Packed, Dispatch. Expected: the popup shows `Ship to: QA-AUTO Unlinked Center Raichur (no linked account — address not on file)` and the warning `Couldn't identify which center/technician account this came from — stock won't be auto-credited to them…`. After dispatch, the status is `Dispatched` but **Warehouse stock is unchanged**. Record this as an observation: free-text requests never debit stock.
- **Back Order and Retry:** on an Approved request, click **`Back Order`**. Expected: it moves to Back Order immediately (no confirmation). Click **`Retry (back to New)`**. Expected: it appears in New Requests with **`Approve`**.
- **Cancel dispatch:** in the dispatch popup, click **`Cancel`** (`#wh-disp-cancel`). Expected: the popup closes and nothing is written.

## Assertions
- [ ] A transfer is created with an ID matching `PE-SR-YYYYMMDD-NNNN-Warehouse` and starts in Approved.
- [ ] Every stage button moves the request exactly one stage.
- [ ] Stock moves only on Dispatch: warehouse −3, service center +3, one `transfer` movement.
- [ ] The dispatch validation messages match the source exactly.
- [ ] The double-dispatch and insufficient-stock guards hold.
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected.

## Screenshots required
- Transfer modal filled, and its success message
- Each stage list (Approved, Picking, Packing, Dispatch, In Transit) showing `{SR}`
- Dispatch popup before submit
- Each dispatch validation error
- Warehouse Stock and Service Center Stock after dispatch
- Movement History with the Transfer row

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
