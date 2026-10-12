# T072-crm-warehouse-dashboard-as-warehouse: Warehouse Operational Dashboard (tiles, urgency tags, stock alerts, pipeline counts)

| Field | Value |
|---|---|
| Route | `/crm/CRMwarehouse.html` (section `dashboard`) |
| Source | `crm/CRMwarehouse.html` (`WH_DASHBOARD_TILES`, `loadDashboardStats`, `paintDashboardTiles`, `loadSpareRequests`), `crm/ui.js` (greeting hero, count-up), `crm/live.js` (live toasts) |
| Flow | Dashboard reflects the spare-request pipeline, stock alerts and backlog counts; tiles drill through |
| Requires auth | yes |
| Required role | warehouse |
| Destructive | no |
| Estimated steps | 34 |

> **What the source actually renders (read before running).** The page's `dashboard` section renders **nine count tiles** (`.stat-card.dash-tile`) plus the `ui.js` greeting hero. The source has **no** dedicated urgency-sorted request queue, **no** stock-alert list widget and **no** charts. "Urgency" exists only as the `URGENT` / `NORMAL` priority tag on spare-request rows. "Stock alerts" are the `Low / Out of Stock` tile and section. The "pipeline" is the per-stage tile counts plus the stage tabs. TC-06 records the missing widgets as a spec gap. Do not mark it as a runner error.

## Preconditions
- App running at `http://localhost:8080`
- Signed in as `warehouse` at `/crm/login.html`. The runner resolves `QA_CRED_WAREHOUSE_USERNAME` / `QA_CRED_WAREHOUSE_PASSWORD`. Never type literal credentials.
- Run only against the Firebase emulator or a dedicated test project, never the live makwell-websiteandcrm data.
- Start from an **empty** emulator for the collections below so the tile values are exact. Then load the seed in `Test data` (Admin SDK / emulator REST).
- Seeded service-center account: role `servicecenter` (the account behind `QA_CRED_SERVICECENTER_USERNAME`). Call its uid `SC_UID`.

## Test data
Seed (fixture IDs are literal Firestore doc IDs):
- `spareParts/qa-part-thermo` = `{ name: "QA-AUTO Geyser Thermostat 15L", partCode: "SP-9001", category: "Thermostat", brandCompatibility: "MakWell", price: 450, reorderLevel: 5, createdAt: <now> }`
- `spareParts/qa-part-element` = `{ name: "QA-AUTO Heating Element 2kW", partCode: "SP-9002", category: "Heating Element", brandCompatibility: "All", price: 650, reorderLevel: 3, createdAt: <now> }`
- `spareParts/qa-part-valve` = `{ name: "QA-AUTO Safety Valve", partCode: "SP-9003", category: "Valve", brandCompatibility: "All", price: 120, reorderLevel: 2, createdAt: <now> }`
- `inventory/warehouse_qa-part-thermo` = `{ partId: "qa-part-thermo", location: "warehouse", quantity: 20 }`
- `inventory/warehouse_qa-part-element` = `{ partId: "qa-part-element", location: "warehouse", quantity: 2 }`
- (no inventory doc for `qa-part-valve`, so its stock is 0)
- `spareRequests/qa-sr-new-urgent` = `{ requestId: "PE-SR-20261011-9001-Warehouse", serviceCenter: "QA-AUTO Raichur Service Center", item: "QA-AUTO Geyser Thermostat 15L", quantity: 2, priority: "urgent", status: "new", notes: "QA-AUTO urgent", createdAt: <now> }`
- `spareRequests/qa-sr-new-normal` = `{ requestId: "PE-SR-20261011-9002-Warehouse", serviceCenter: "QA-AUTO Raichur Service Center", item: "QA-AUTO Safety Valve", quantity: 1, priority: "normal", status: "new", createdAt: <now − 1 h> }`
- `spareRequests/qa-sr-backorder` = `{ requestId: "PE-SR-20261011-9003-Warehouse", serviceCenter: "QA-AUTO Raichur Service Center", item: "QA-AUTO Safety Valve", quantity: 4, priority: "urgent", status: "backorder", createdAt: <now> }`
- `spareRequests/qa-sr-transit` = `{ requestId: "PE-SR-20261011-9004-Warehouse", serviceCenter: "QA-AUTO Raichur Service Center", item: "QA-AUTO Heating Element 2kW", quantity: 1, priority: "normal", status: "intransit", createdAt: <now> }`
- `centerRequests/qa-cr-open` = `{ requestId: "PE-CR-QA-0001", serviceCenterUid: SC_UID, customerName: "QA-AUTO Customer One", customerPhone: "9000000001", city: "Raichur", pincode: "584101", status: "new", createdAt: <now> }`
- `localPurchases/qa-lp-1` = `{ requestId: "PE-LP-QA-0001", item: "QA-AUTO Thermostat local", quantity: 1, estimatedAmount: 500, requestedBy: "QA-AUTO Tester", emergency: true, status: "requested", createdAt: <now> }`
- `claims/qa-cl-1` = `{ claimId: "PE-CL-QA-0001", claimantType: "technician", claimantName: "QA-AUTO Tech", description: "QA-AUTO travel", amount: 300, status: "submitted", createdAt: <now> }`
- `returns/qa-rt-req` = `{ returnId: "PE-RT-QA-0001", partId: "qa-part-valve", quantity: 1, source: "QA-AUTO Service Center - Raichur", reason: "QA-AUTO wrong part", status: "requested", createdAt: <now> }`
- `returns/qa-rt-def` = `{ returnId: "PE-RT-QA-0002", partId: "qa-part-thermo", quantity: 3, source: "QA-AUTO Service Center - Raichur", reason: "QA-AUTO damaged", status: "defective", createdAt: <now> }`

Expected tile values after seeding:

| Tile label | Hint text | Expected value | Drills to |
|---|---|---|---|
| New Requests | Spare requests awaiting approval | 2 | `requests-new` |
| Back Order | Stuck, needs attention | 1 | `requests-backorder` |
| In Transit | Currently dispatched | 1 | `requests-transit` |
| Low / Out of Stock | At or below reorder level | 2 (see TC-03) | `inv-lowstock` |
| Damaged / Defective Returns | Defective or disposed items | 1 | `inv-damaged` |
| Pending Local Purchase | Requested, not yet reimbursed | 1 | `lp-new` |
| Pending Claims | Submitted, awaiting verification | 1 | `claims-verification` |
| Pending Returns | Requested, not yet received | 1 | `returns-requests` |
| Service Tickets | Open jobs & center requests | 1 | `servicevis` |

## Steps

### TC-01: Happy path. The dashboard loads with the correct pipeline counts
1. Sign in as `warehouse`. Navigate to `/crm/CRMwarehouse.html`.
2. Assert: `#page-title` = `Dashboard` and `#page-sub` = `Welcome back`.
3. Assert: the `ui.js` hero is visible. It shows `Good morning|Good afternoon|Good evening` (based on local hour) followed by `Warehouse & Operations · Orders to pick, pack and dispatch.`, buttons `New Requests`, `Approved` and `Jump to… Ctrl K`, and today's weekday and date.
4. Assert: exactly 9 `.stat-card.dash-tile` in `.stat-grid`, in the order of the table above, each with the exact label and hint.
5. Wait 1 s for the count-up animation. Assert: each `.value` equals the Expected value column. No tile shows `—` (that means the stats query failed) and none is stuck at `…`.
6. Reload the page. Assert: the same values persist.

### TC-02: Urgency tagging in the request queue (New Requests)
1. Click the **New Requests** tile. Assert: `requests-new` is active, `#page-title` = `New Requests`, `#page-sub` = `Spare Requests & Dispatch`.
2. Assert: the table has 2 rows. Row `PE-SR-20261011-9001-Warehouse` shows Priority `URGENT` in `.priority-tag.urgent`, which is red (`color` = rgb(179, 38, 30) / `#B3261E`, or the restyled `--err` value). Row `PE-SR-20261011-9002-Warehouse` shows `NORMAL` in `.priority-tag.normal` (stone grey).
3. Assert: the rows are sorted by `createdAt` desc, so the urgent row (newer) is first. Note: the queue is **not** sorted by urgency. An older urgent request sits below a newer normal one. Record this as an observation.
4. Each row shows a `.status-pill.new` with text `New`, plus action buttons **`Approve`** (secondary) and **`Back Order`** (`.btn-danger`).
5. Click the link `PE-SR-20261011-9001-Warehouse`. Assert: `#sr-detail-overlay` opens with title `Spare Request — PE-SR-20261011-9001-Warehouse`, and the body shows `Item: QA-AUTO Geyser Thermostat 15L`, `Quantity: 2`, `Priority: URGENT`, `Notes: QA-AUTO urgent`. Click **`Close`**.
6. Go back to `dashboard`, click **Back Order**, and assert 1 row `PE-SR-20261011-9003-Warehouse`, tag `URGENT`, with the action **`Retry (back to New)`**.

### TC-03: Stock alerts (Low / Out of Stock tile vs section)
1. On `dashboard`, read the **Low / Out of Stock** tile value.
2. Click the tile. Assert: `inv-lowstock` is active, `h2` = `Low / out of stock`.
3. Assert: the section lists exactly 2 rows:
   - `SP-9002` `QA-AUTO Heating Element 2kW`, Qty (WH) `2`, Reorder Level `3`, pill `.status-pill.low` `Low`
   - `SP-9003` `QA-AUTO Safety Valve`, Qty (WH) `0`, Reorder Level `2`, pill `.status-pill.out` `Out of stock`
4. Assert: `SP-9001` (qty 20, reorder 5) is **not** listed.
5. Assert: the tile value from step 1 equals the row count from step 3, which is **2**.
   > **Known risk (from source):** the tile counts only `inventory` docs at `location == "warehouse"`, against the inventory doc's own `reorderLevel` (defaulting to 5). It ignores the part master's `reorderLevel`, and it skips parts that have no inventory doc. With this seed the tile shows **1** while the section shows **2**. If step 5 fails with tile = 1, log it as a defect: "Low / Out of Stock tile undercounts — misses parts with no warehouse inventory doc and uses the wrong reorder level".

### TC-04: Pipeline counts react to stage changes
1. Go to **New Requests**. Click **`Approve`** on `PE-SR-20261011-9002-Warehouse`.
2. Assert: the row disappears from New Requests and 1 row remains.
3. Click `dashboard`. Assert: the **New Requests** tile = 1 (was 2). All other tiles are unchanged.
4. Click the **Approved** nav item. Assert: `PE-SR-20261011-9002-Warehouse` is present with pill `Approved` and buttons **`Start Picking`** and **`Back Order`**.
5. Go to **In Transit**. Click **`Mark Received`** on `PE-SR-20261011-9004-Warehouse`. Assert: the row disappears.
6. Click `dashboard`. Assert: the **In Transit** tile = 0.
7. Click **Reports**. Assert: `Open spare requests:` = **4**. All 4 seeded requests are open, because the report only excludes `fulfilled`/`cancelled` and `received` counts as open. Record this as an observation: a received request still counts as "open" in Reports.

### TC-05: Live updates (live.js)
1. Stay on `dashboard`. From a second session (Admin SDK), add `spareRequests/qa-sr-live` = `{ requestId: "PE-SR-20261011-9005-Warehouse", serviceCenter: "QA-AUTO Raichur Service Center", item: "QA-AUTO Safety Valve", quantity: 1, priority: "urgent", status: "new", createdAt: <now> }`.
2. Assert: within 10 s, a toast in `.ui-toasts` shows a bold title `New spare request — PE-SR-20261011-9005-Warehouse` and the line `QA-AUTO Safety Valve`, with buttons **`View`** and `×`.
3. Assert: within 3 s after that (`refreshSoon` 1.5 s debounce), with no modal open and no input focused, the dashboard re-renders and the **New Requests** tile goes up by 1.
4. Click **`View`**. Assert: the `.ui-live-dialog` opens with a heading containing `PE-SR-20261011-9005-Warehouse` and a button **`Open in New Requests`**. Click it. Assert: `requests-new` is active.

### TC-06: Spec gap check. Operational widgets requested for this dashboard
These were requested for this dashboard but are not in the source:
1. On `dashboard`, look for: (a) a spare-request queue list sorted or flagged by urgency, (b) a stock-alert list naming the low/out parts, (c) any chart (`canvas`, `svg` chart, or element whose class contains `chart`) showing pipeline stages.
2. Expected per current source: none present. `#content` contains only `.ui-hero` + `.stat-grid`.
3. Report result: record `GAP — Operational dashboard widgets (urgency queue, stock-alert list, pipeline chart) not implemented on CRMwarehouse.html`. If any of them **are** present (newer build), screenshot each one and verify that it agrees with the seed: the urgency queue lists `PE-SR-20261011-9001-Warehouse` before `PE-SR-20261011-9002-Warehouse`, the stock alert lists SP-9002 and SP-9003, and the pipeline chart shows New 2 / Back Order 1 / In Transit 1.

### TC-07: Negative & edge cases
- **Stats query failure:** go offline, click another section, then click `dashboard`. Expected: all 9 tiles show `—`. The console has `Dashboard stats failed:`. No uncaught exception occurs and the tiles stay clickable.
- **Zero state:** on an empty emulator, every tile shows `0`. The count-up does not animate values below 2.
- **XSS in request fields:** seed a `spareRequests` doc with `item: "<img src=x onerror=alert(1)>"`, `status: "new"`. Open New Requests. Expected: the text renders literally and no alert dialog fires.
- **Keyboard drill:** tab to a tile and press Enter. Record whether tiles are keyboard-operable. They are `div`s with click handlers only. If they are not operable, log an accessibility finding.

## Assertions
- [ ] 9 tiles with exact labels, hints and seeded values.
- [ ] `URGENT` / `NORMAL` priority tags render with the correct classes.
- [ ] The Low / Out of Stock tile equals the section row count (2). Otherwise log the defect.
- [ ] Tiles update after stage transitions and after live inserts.
- [ ] Every tile drills to its section.
- [ ] TC-06 gap recorded, or the new widgets verified.
- [ ] No console errors in DevTools at any step, except the deliberate offline case.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected.

## Screenshots required
- Page initial load (hero + 9 tiles)
- New Requests queue with URGENT/NORMAL tags
- Spare request detail popup
- Low / out of stock section
- Live toast
- Dashboard after the TC-04 transitions

## Pass criteria
All TCs above pass AND no unexpected console/network errors. TC-03 step 5 and TC-06 are reported as defect/gap findings when they do not match.
