# T076-crm-warehouse-destructive-withdraw-and-reassign: Destructive — Withdraw change request and Reassign ticket (confirm cancel/proceed)

| Field | Value |
|---|---|
| Route | `/crm/CRMwarehouse.html` (sections `my-change-requests`, `routing`, `returns-*`, `requests-*`) |
| Source | `crm/CRMwarehouse.html` (`renderMyChangeRequests` → `confirm('Withdraw this request?')` → `deleteDoc`; `loadWhRerouteQueue` → `confirm('Reassign … ?')` → `whReassignToCenter`; `advanceReturn`; `STATUS_ACTIONS.backorder`) |
| Flow | Destructive actions behind a native `confirm()`: cancel path and proceed path |
| Requires auth | yes |
| Required role | warehouse |
| Destructive | yes |
| Estimated steps | 36 |

## Preconditions
- App running at `http://localhost:8080`
- Signed in as `warehouse` at `/crm/login.html`. The runner resolves `QA_CRED_WAREHOUSE_USERNAME` / `QA_CRED_WAREHOUSE_PASSWORD`. Never type literal credentials.
- Run only against the Firebase emulator or a dedicated test project, never the live makwell-websiteandcrm data. This task **deletes** `changeRequests` docs and **cancels** `centerRequests` docs.
- Seed (or run T074 TC-03 first) two pending `changeRequests` owned by the warehouse test user's uid (`WH_UID`):
  - `changeRequests/qa-cr-1` = `{ kind: "stock_reduction", payload: { partId: "qa-part-element", qty: 1, reason: "QA-AUTO count correction", mode: "adjustment" }, summary: "Write off / correct 1 × QA-AUTO Heating Element 2kW — QA-AUTO count correction", requestedByUid: WH_UID, requestedByEmail: <warehouse email>, status: "pending", createdAt: <now − 1 h> }`
  - `changeRequests/qa-cr-2` = same shape, `qty: 2`, `mode: "issue"`, `summary: "Issue out 2 × QA-AUTO Heating Element 2kW — QA-AUTO issued to SC-Raichur"`, `createdAt: <now>`
- Two `servicecenter` users: `SC_A` = `QA-AUTO Raichur Service Center A`, `SC_B` = `QA-AUTO Raichur Service Center B` (each with `pincodesCovered: ["584101"]`).
- `centerRequests/qa-cr-assigned` = `{ requestId: "PE-CR-QA-0101", serviceCenterUid: SC_A, serviceCenterName: "QA-AUTO Raichur Service Center A", customerName: "QA-AUTO Customer Reroute", customerPhone: "9000000031", address: "QA-AUTO 5 Gunj Road", city: "Raichur", pincode: "584101", product: "MakWell Geyser 15L", status: "assigned", createdAt: <now> }`
- Before you start, set the runner's dialog handler to **record the dialog message** and to dismiss or accept as each step says.

## Test data
- `withdrawConfirmText = "Withdraw this request?"`
- `reassignConfirmText = "Reassign PE-CR-QA-0101 to QA-AUTO Raichur Service Center B? The current center's assignment will be cancelled."`

## Steps

### TC-01: Withdraw change request. Confirm CANCEL keeps the request
1. Click nav **My Change Requests**. Assert: 2 rows, newest first: `Issue out 2 × …` then `Write off / correct 1 × …`. Each shows `Waiting for Super Admin` and a **`Withdraw`** button.
2. Arm the dialog handler to **dismiss**. Click **`Withdraw`** on the `Issue out 2 × …` row.
3. Assert: the dialog type is `confirm` and its message is exactly `withdrawConfirmText`.
4. Assert: both rows are still listed after 2 s, and `changeRequests/qa-cr-2` still exists in the emulator.

### TC-02: Withdraw change request. Confirm PROCEED deletes it
1. Arm the dialog handler to **accept**. Click **`Withdraw`** on the `Issue out 2 × …` row.
2. Assert: the confirm message equals `withdrawConfirmText`.
3. Assert: the list re-renders within 3 s with exactly 1 row (`Write off / correct 1 × …`).
4. Assert: `changeRequests/qa-cr-2` no longer exists. `qa-cr-1` is untouched.
5. Assert: Warehouse Stock for SP-9002 is unchanged by the withdrawal.
6. Reload and reopen My Change Requests. Assert: 1 row is still shown.

### TC-03: Withdraw is offered only for pending requests
1. In the emulator, set `qa-cr-1.status = "rejected"` and `reviewNote = "QA-AUTO not needed"`. Reopen the section.
2. Assert: the row shows `Rejected — QA-AUTO not needed` and **no** **`Withdraw`** button.
3. Set `status = "approved"` with no `appliedAt`. Assert: `Approved — applying…` and no Withdraw.

### TC-04: Reassign ticket to another center. Confirm CANCEL
1. Click nav **Service Request Routing**. Under `Already assigned — reroute`, find the row `PE-CR-QA-0101` with Customer `QA-AUTO Customer Reroute`, Status pill `Assigned` and Currently at `QA-AUTO Raichur Service Center A`.
2. Assert: the `Select service center…` dropdown lists `QA-AUTO Raichur Service Center B` and does **not** list Center A (the current center is excluded).
3. Click the first **`Reassign`** (`.reroute-center-btn`) with no selection. Assert: an `alert` with text `Select a service center first.` appears. Accept it. Nothing changes.
4. Select `QA-AUTO Raichur Service Center B`. Arm the handler to **dismiss**. Click **`Reassign`**.
5. Assert: the confirm message equals `reassignConfirmText`.
6. Assert: the row is unchanged. `centerRequests/qa-cr-assigned.status` is still `assigned`, and no new `centerRequests` doc exists for SC_B.

### TC-05: Reassign ticket. Confirm PROCEED
1. Select Center B again. Arm the handler to **accept**. Click **`Reassign`**.
2. Assert: within 5 s the reroute list refreshes, and `PE-CR-QA-0101` no longer appears under `Already assigned — reroute` (the new doc is `new`).
3. Assert (emulator): `centerRequests/qa-cr-assigned.status = "cancelled"`. A new `centerRequests` doc has `requestId: "PE-CR-QA-0101"`, `serviceCenterUid: SC_B`, `serviceCenterName: "QA-AUTO Raichur Service Center B"`, `status: "new"` and `customerPhone: "9000000031"`. A `statusLog` entry `cancelled` with note `Reassigned to QA-AUTO Raichur Service Center B` exists on the old doc. A `notifications` doc exists with `recipientValue: SC_B` and title `Service request reassigned to you`.
4. Open nav **Service**. Assert: exactly **one** row for `PE-CR-QA-0101` (deduped), with Status `New`.

### TC-06: Destructive actions with NO confirmation (record as findings)
Run each action once. Assert the actual behaviour and log a UX defect: "destructive action without confirmation".

| Button (section) | Action taken | Expected per current source |
|---|---|---|
| **`Back Order`** (`.btn-danger`, New Requests) | click | Moves the request to Back Order immediately. No dialog |
| **`Dispose`** (`.btn-danger`, Defective Parts; needs a `returns` doc with `status: "defective"`, `returnId: "PE-RT-QA-0201"`) | click | Status becomes `Disposed` immediately. No dialog. The row appears under **Disposal** and is counted in the **Damaged / Defective Returns** tile |
| **`Reject`** (`.btn-danger`, Returns intake; needs a `returns` doc with `status: "received"`) | click | Status becomes `Rejected` immediately. No dialog |
| **`Reject`** (Claims Verification, `.claim-reject-btn`) | click → prompt dismissed | No change (prompt returned null) |
| **`Reject`** (Claims Verification) | click → prompt `ab` | alert `Please give a reason.`, no change |
| **`Reject`** (Claims Verification) | click → prompt `QA-AUTO duplicate claim` | Pill `Rejected`; the actions cell shows `QA-AUTO duplicate claim` |

### TC-07: Negative & edge cases
- **Withdraw race:** while TC-02 is in progress, have Super Admin (Admin SDK) set `status: "approved"` before you accept. Expected: either the delete succeeds or the alert `Could not withdraw — it may have just been decided.` appears. The list re-renders either way and no stale **`Withdraw`** button remains on a decided row.
- **Offline withdraw:** go offline, click **`Withdraw`**, then accept. Expected: the alert `Could not withdraw — it may have just been decided.`, and the row remains after going back online.

## Assertions
- [ ] The confirm text matches the source exactly for Withdraw and Reassign.
- [ ] Dismissing confirm writes nothing.
- [ ] Accepting Withdraw deletes only the targeted change request.
- [ ] Accepting Reassign cancels the old ticket, creates a new one for Center B, logs status and notifies.
- [ ] The no-confirmation destructive buttons are recorded as findings.
- [ ] No console errors in DevTools at any step, except the deliberate offline/race cases.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected.

## Screenshots required
- My Change Requests before, and after the withdraw
- Each native confirm dialog (if the runner can capture it; otherwise log the message text)
- Routing reroute row before, and after the reassign
- Service list showing the single deduped PE-CR-QA-0101 row
- The Disposal tab after the un-confirmed Dispose

## Pass criteria
All TCs above pass AND no unexpected console/network errors. TC-06 findings are reported, not failed.
