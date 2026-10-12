# T065-crm-servicecenter-destructive-cancel-and-defect-batch: Destructive — Cancel a request, and send a defective-parts batch to Head Office

| Field | Value |
|---|---|
| Route | `/crm/CRMservicecenter.html` → sidebar `Center Requests` and `Send Back to Head Office` |
| Source | `crm/CRMservicecenter.html` (`buildRequestActionsHtml` red `Cancel` → `advanceRequest(id,'cancelled')`; `loadTechReturns`, `sendDefectBatch` with `confirm()`; `sc-closure-form` part lines → `runStockOpOrThrow({type:'consume'})`) |
| Flow | Destructive — `Cancel` (request) and `Send selected to Head Office` (defect batch, confirm cancel + confirm proceed) |
| Requires auth | yes |
| Required role | servicecenter |
| Destructive | yes |
| Estimated steps | 34 |

## Preconditions
- App running at `http://localhost:8080`
- Run only against the Firebase emulator or a dedicated test project — never the live makwell-websiteandcrm data.
- Signed in as `servicecenter` at `/crm/login.html` using `QA_CRED_SERVICECENTER_USERNAME` / `QA_CRED_SERVICECENTER_PASSWORD`.
- Firebase Functions emulator running (stock ops `consume` are applied server-side and open the defective return).
- Seed data:
  - A `New` request created through `+ New Request`: customer `QA-AUTO Cancel Me`, phone `9000000401`, issue `QA-AUTO Duplicate booking, customer called to cancel.` → `{cancelJob}`.
  - A second `New` request: `QA-AUTO Keep Me`, `9000000402`, issue `QA-AUTO Remote not pairing.` → `{keepJob}` (control row).
  - Center Inventory of this center holds ≥ 2 units of one part `{partCode} — {partName}` (approved stock).
  - One `In Progress` request `QA-AUTO Defect Source`, `9000000403`, issue `QA-AUTO Thermostat failed.` → `{defectJob}`.

## Test data
- Closure for `{defectJob}`: `Closure code` = `Part(s) Replaced`; `Action taken` = `QA-AUTO Replaced thermostat.`; parts-used text = `QA-AUTO 1 x {partName}`; part line 1 = `{partCode} — {partName}`, Qty `1`.
- Batch: `Courier / transporter` = `QA-AUTO Raichur Transport`; `Docket no.` = `QA-AUTO-DKT-RT-001`.
- Batch confirm text pattern: `Send <n> defective part(s) to Head Office in one shipment?`
- Invalid: courier empty; no rows selected.

## Steps

### TC-01: Happy path — Cancel a request
1. Navigate to `/crm/CRMservicecenter.html`; click **`Center Requests`**.
2. Assert: `{cancelJob}` and `{keepJob}` both show pill `New` and a red **`Cancel`** button (class `btn-danger`). Only `New` rows have this button.
3. Click the red **`Cancel`** on `{cancelJob}`.
4. Expected per destructive-action convention: a confirmation dialog appears. Record the actual behaviour:
   - If no confirm appears (current source calls `advanceRequest(..., 'cancelled')` directly) → record finding `DEF: Cancel request has no confirmation step — one click irreversibly cancels a customer ticket.` and continue with step 6.
   - If a confirm appears → do TC-02 first, then OK it.
5. (confirm present only) Click **Cancel** on the confirm. Assert: status still `New`.
6. Assert: `{cancelJob}` pill = `Cancelled`; Actions = `—`; no `Assign Technician`/`Schedule` buttons.
7. Assert: `{keepJob}` unchanged (`New`).
8. Open `{cancelJob}` detail. Assert `Status: Cancelled`; actions area empty.
9. Reload. Assert status persists. Open **`Performance`**: `Cancelled` count increased by 1 versus before step 3.
10. Open **`Scheduling`**: `{cancelJob}` is not listed. Open **`Spare Dispatch` → `+ Dispatch Spare`**: `{cancelJob}` is not in `Open ticket`.

### TC-02: Cancel via the detail dialog
1. Create another `New` request `QA-AUTO Cancel From Detail`, `9000000404`, issue `QA-AUTO Wrong address.`
2. Click its Request ID → `Request details` dialog → red **`Cancel`**.
3. Assert: dialog closes and the row becomes `Cancelled` (same no-confirm finding applies).

### TC-03: Generate a defective return via closure parts
1. On `{defectJob}` click **`Mark Complete`**. Fill with Test data, including part line 1 and Qty `1`. Click **`Mark Complete`**.
2. Assert: `Completed.`; `{defectJob}` = `Completed`.
3. Click **`Center Inventory`**. Assert: `{partName}` quantity decreased by 1.
4. Click **`Send Back to Head Office`**. Assert: panel `Defective parts to send to Head Office` lists a row Part `{partName}`, Qty `1`, From `Your center`, Due by = last day of next month, checkbox pre-ticked; batch area shows `Courier / transporter`, `Docket no.` and button `Send selected to Head Office`.

### TC-04: Destructive — `Send selected to Head Office` (confirm cancel + proceed)
| Button | Action taken | Expected result |
|---|---|---|
| `Send selected to Head Office` | courier empty → click | red error `Enter the courier / transporter.`; no confirm shown |
| `Send selected to Head Office` | untick all rows (header checkbox) → click | red error `Select the parts in this shipment.` |
| `Send selected to Head Office` | tick row, courier `QA-AUTO Raichur Transport`, docket `QA-AUTO-DKT-RT-001` → click → **Cancel** on confirm `Send 1 defective part(s) to Head Office in one shipment?` | no change; row still listed; button text `Send selected to Head Office` |
| `Send selected to Head Office` | same → click → **OK** on confirm | button `Sending…`; alert `Sent — batch DB-YYYYMMDD-XXXX. Head Office will mark each part received when the shipment arrives.`; row disappears; empty state `No defective parts waiting to be sent.`; batch area hidden |

After the proceed path: reload and reopen the section. Assert the row does not return (its `returns` doc now has `status = "requested"` and the batch details).

### TC-05: Negative & edge cases
- Cancelled request cannot be resumed: no action buttons in row or detail.
- Offline when clicking red `Cancel` → alert `Could not update this request. Check the console for details.`; after reconnect + reload status is still `New`.
- Partial batch failure (deny `returns` updates in emulator rules for one doc) → error `1 of <n> could not be updated — refresh and try again.`
- Closure part line with a quantity greater than stock → red server message mentioning `Center Inventory`; request stays `In Progress`.

## Assertions
- [ ] Red `Cancel` exists only on `New` requests and moves the ticket to `Cancelled` with no further actions.
- [ ] Missing confirmation on request cancel is reported as a `DEF:` finding.
- [ ] Control row `{keepJob}` is unaffected.
- [ ] Closure with a part line deducts center stock and opens a defective return.
- [ ] Defect batch: both validation messages, confirm Cancel = no change, confirm OK = batch sent and row removed.
- [ ] No console errors in DevTools at any step (except deliberate offline cases).
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected.

## Screenshots required
- Center Requests before cancel (red button visible) and after (`Cancelled`)
- Send Back panel with the defective row
- Each validation error state of the batch
- Confirm dialog, success alert, empty state afterwards

## Pass criteria
All TCs above pass AND no unexpected console/network errors. The `DEF:` finding on missing cancel confirmation is reported to the user as a defect.
