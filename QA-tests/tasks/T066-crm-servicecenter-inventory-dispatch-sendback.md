# T066-crm-servicecenter-inventory-dispatch-sendback: Center Inventory, Spare Dispatch and Send Back forms

| Field | Value |
|---|---|
| Route | `/crm/CRMservicecenter.html` → sidebar `Center Inventory`, `Spare Dispatch`, `Send Back to Head Office` |
| Source | `crm/CRMservicecenter.html` (`cinv-add-form`, `cinv-form`, `dispatch-form`, `sendback-form`); `crm/stockOps.js` (`runStockOp`, `runStockOpOrThrow`) |
| Flow | Add part to center inventory (Warehouse approval) → Adjust stock (add request / remove) → Dispatch spare to technician against a ticket → Send back to Head Office |
| Requires auth | yes |
| Required role | servicecenter |
| Destructive | no |
| Estimated steps | 48 |

## Preconditions
- App running at `http://localhost:8080`
- Run only against the Firebase emulator or a dedicated test project — never the live makwell-websiteandcrm data.
- Signed in as `servicecenter` at `/crm/login.html` using `QA_CRED_SERVICECENTER_USERNAME` / `QA_CRED_SERVICECENTER_PASSWORD`.
- Firebase Functions emulator running (`applySparesOp` applies/refuses every stock op; adds wait for Warehouse approval).
- Seed data:
  - ≥ 2 `spareParts`: `{partA}` (already in this center's inventory with quantity ≥ 5) and `{partB}` (not yet in this center's inventory). Record `partCode — name` labels.
  - One open request assigned to the linked roster technician `QA-AUTO Tech Linked` (has `technicianUid`): customer `QA-AUTO Dispatch Job`, phone `9000000501`, status `In Progress` → `{dispatchJob}`.
  - Optional for approval: warehouse account `QA_CRED_WAREHOUSE_USERNAME` / `QA_CRED_WAREHOUSE_PASSWORD`.

## Test data
- Add part: `Part` = `{partB}`, `Starting quantity` = `3`
- Adjust (remove): `Action` = `Used / removed`, `Quantity` = `1`, `Notes (optional)` = `QA-AUTO used on bench test`
- Adjust (add): `Action` = `Received from Head Office`, `Quantity` = `2`, `Notes (optional)` = `QA-AUTO bill no 584101-01`
- Dispatch: `Open ticket` = option starting `{dispatchJob} — QA-AUTO Dispatch Job (QA-AUTO Tech Linked)`, `Part` = `{partA}`, `Quantity` = `1`
- Send back: `Part` = `{partA}`, `Quantity` = `1`, `Reason` = `QA-AUTO Defective on arrival`
- Invalid: quantity `0`, `-1`, empty; notes `"ab"` (2 chars); quantity larger than stock `9999`

## Steps

### TC-01: Happy path — Add part to center inventory
1. Click sidebar **`Center Inventory`**. Assert: title `Center Inventory`, sub `Parts held at this center`, `{partA}` row with quantity and an `Adjust` button.
2. Click **`+ Add Part`**. Assert: dialog `Add part to center inventory`; `Part` starts `Select a part…`; `Starting quantity` = `0`.
3. Select `{partB}`, quantity `3`. Click **`Add part`**.
4. Assert: green `Sent to Warehouse for approval — it will show in your stock once approved.`; dialog closes; `{partB}` is NOT yet in the table.
5. (Optional) Approve as warehouse; reload Center Inventory. Assert `{partB}` quantity `3`.
6. Reopen, select `{partB}`, leave quantity `0`, click **`Add part`**. Assert: green `Nothing to add — enter a quantity.`; nothing written.

### TC-02: Modal — Adjust center stock
1. Note `{partA}` quantity as `q0`. Click its **`Adjust`**.
2. Assert: dialog `Adjust center stock`, label `{partA code} — {partA name}`, `Action` options `Received from Head Office`, `Used / removed`; `Quantity` = `1`.
3. Click **`Cancel`**. Assert: closed, quantity `q0`.
4. Reopen; fill remove data; click **`Save`**. Assert: `Stock updated.`; after reload `{partA}` = `q0 − 1`.
5. Reopen; fill add data; click **`Save`**. Assert: `Sent to Warehouse for approval — it will show in your stock once approved.`; quantity unchanged until approval.

### TC-03: Happy path — Dispatch spare to technician
1. Click **`Spare Dispatch`**. Assert: panels `Dispatch to technician` (button `+ Dispatch Spare`) and `Recent dispatches`.
2. Click **`+ Dispatch Spare`**. Assert: dialog `Dispatch spare to technician`, note `Only tied to a real open ticket assigned to that technician — this isn't a free-standing stock transfer.`; `Open ticket` lists only open tickets that have a linked technician (unassigned or informal-tech tickets absent); if none, text `No open tickets assigned to a technician right now`.
3. Fill Dispatch data. Click **`Dispatch`**. Assert: `Dispatching…` then `Dispatched.`; dialog closes.
4. Assert: `Recent dispatches` top row Date today, Part `{partA name}`, Qty `1`.
5. Center Inventory: `{partA}` decreased by 1.
6. If `{dispatchJob}` was `Waiting for Spare` before dispatch, Assert it is now `In Progress`.

### TC-04: Happy path — Send back to Head Office
1. Click **`Send Back to Head Office`** → **`+ Send Back`**. Assert dialog `Send back to Head Office`.
2. Fill Send back data. Click **`Send back`**. Assert: `Sending…` then `Sent — <returnId>`; dialog closes.
3. Center Inventory: `{partA}` decreased by 1.

### TC-05: Form validation — inventory forms
| Form → Field | Empty value error | Pattern violation | Over-limit |
|---|---|---|---|
| Add part → Part | native required on `Part` / `Select a part.` | n/a | n/a |
| Add part → Starting quantity | native required | `-1` → native `min=0` bubble | n/a |
| Adjust → Quantity | native required | `0` → native `min=1` bubble (JS fallback `Enter a quantity greater than 0.`) | `9999` with `Used / removed` → red server refusal reason (stock insufficient) |
| Adjust → Notes (optional) | empty → red `Give a reason (e.g. bought locally, bill no.).` (label says optional but ≥ 3 chars required — record `DEF: label says optional`) | `ab` → same message | n/a |
| Dispatch → Open ticket | native required / `Select an open ticket and a part.` | n/a | n/a |
| Dispatch → Part | native required / `Select an open ticket and a part.` | n/a | n/a |
| Dispatch → Quantity | native required | `0` → `min=1` bubble / `Enter a quantity greater than 0.` | `9999` → red message containing `Center Inventory` |
| Send back → Part | native required / `Select a part.` | n/a | n/a |
| Send back → Quantity | native required | `0` → `min=1` bubble / `Enter a quantity greater than 0.` | `9999` → red server refusal reason |
| Send back → Reason | native required on `Reason` | n/a | n/a |

After every blocked case Assert: inventory quantities unchanged after reload.

### TC-06: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| `+ Add Part` | click | `Add part to center inventory` opens, reset |
| `Adjust` | click | `Adjust center stock` opens for that part |
| `+ Dispatch Spare` | click | dispatch dialog opens, tickets reloaded |
| `+ Send Back` | click | send-back dialog opens |
| each `Cancel` (`cancel-cinv-add`, `cancel-cinv`, `cancel-dispatch`, `cancel-sendback`) | click | its dialog closes, no write |
| backdrop of each dialog | click | dialog closes |

### TC-07: Negative & edge cases
- Functions emulator stopped → any stock op ends after ~30 s with `Still being processed — check again in a minute.` (or the generic `Could not … Check console for details.`); record exact text; quantities unchanged.
- Offline when opening Center Inventory → `Couldn't load inventory. Check console for details.`

## Assertions
- [ ] Adds go to Warehouse approval with the exact pending message; removes apply immediately.
- [ ] Dispatch only offers tickets with a linked technician and deducts center stock.
- [ ] Send back deducts stock and returns a return ID.
- [ ] Every validation case in TC-05 blocks the write.
- [ ] No console errors in DevTools at any step (except deliberate failure cases).
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected.

## Screenshots required
- Center Inventory initial load
- Each of the four dialogs open
- Each validation error state
- Recent dispatches after TC-03; inventory after TC-04

## Pass criteria
All TCs above pass AND no unexpected console/network errors. `DEF:` findings are reported but do not fail the task.
