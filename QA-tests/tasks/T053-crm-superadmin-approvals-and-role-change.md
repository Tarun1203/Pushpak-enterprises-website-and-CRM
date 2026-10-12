# T053-crm-superadmin-approvals-and-role-change: Approve / reject pending requests and change a user's role

| Field | Value |
|---|---|
| Route | `/crm/CRMsuperadmin.html` → nav **Approvals**, **Users & Access** |
| Source | `crm/CRMsuperadmin.html` (`renderApprovalsOverview` ~7747, `approveChangeRequest` ~7903, `rejectChangeRequest` ~7921; `openEditUserModal` / edit submit / `reset-password-btn` ~2137-2302) |
| Flow | Approve and reject items in **Needs your decision** (`changeRequests`); edit a CRM account's role, which writes the `role_changed` audit entry |
| Requires auth | yes |
| Required role | superadmin |
| Destructive | yes (approve applies a change on the server; reject is final) |
| Estimated steps | 40 |

> **Scope gap, read first.** The brief asked for "Users & Roles approve/reject a pending signup (Pending / Active / Rejected tabs)". That UI **does not exist** in `CRMsuperadmin.html`. **Users & Access** is one flat `CRM accounts` table (Name / Email / Role / UID / Actions → **Edit**). It has no status tabs and no signup queue. Accounts are created only by an admin (T052), and there is no self-signup on `login.html`. The only approve/reject queue on this page is **Approvals → Needs your decision** (Firestore `changeRequests`). This task tests that queue plus role change. TC-06 records the missing signup feature as `BLOCKED — feature not present`, so the gap stays visible in the run report.

## Preconditions
- App running at `http://localhost:8080`
- Signed in as `superadmin` (env `QA_CRED_SUPERADMIN_USERNAME` / `QA_CRED_SUPERADMIN_PASSWORD`).
- **Run only against the Firebase emulator or a dedicated test project — never the live makwell-websiteandcrm data.** Approve and reject update `changeRequests`, and approval triggers the `applyChangeRequest` Cloud Function, which writes to the target doc. The page hard-codes the live `makwell-websiteandcrm` config with no emulator switch. If traffic would reach the live project, **mark this task BLOCKED** and stop.
- Cloud Functions are running in the emulator. Without them, TC-01 step 6 cannot show the applied change: mark that step `BLOCKED`.
- Seed **three** `changeRequests` docs, raised by a **different** user (role `warehouse`, not the signed-in superadmin):
  - `CR-A`: `{ status: "pending", kind: "spare_price", summary: "QA-AUTO {runId} price change A", requestedByEmail: <warehouse email>, requestedByUid: <warehouse uid>, createdAt: <now-2h> }`, targeting a QA-AUTO spare part.
  - `CR-B`: same shape, summary `QA-AUTO {runId} price change B`, `createdAt: <now-1h>`.
  - `CR-C`: `{ status: "pending", kind: "center_rate", summary: "QA-AUTO {runId} own request", requestedByUid: <superadmin uid>, requestedByEmail: <superadmin email> }`.
  - Preferred: create CR-A and CR-B by signing in as `warehouse` and editing a spare part price in the Warehouse portal. Otherwise write them straight to the emulator.
- The T052 account `qa-auto+tech-{runId}@example.test` exists (role `technician`).

## Test data
- `runId` = same run token as T052
- `rejectReason = "QA-AUTO {runId} rejected — price not justified"`
- `editName = "QA-AUTO Technician {runId} (edited)"`
- `newRole = "Service Center"` (value `servicecenter`)

## Steps

### TC-01: Approve a pending change request (confirm → cancel, then proceed)
1. Click nav **Approvals**. Assert: `#page-title` = `Approvals`, `#page-sub` = `Everything awaiting a decision`.
2. Assert: the **Needs your decision** table (`Submitted | Type | Request | Requested by | Action`) lists CR-A above CR-B (oldest first). Both show Type `Spare part price` and buttons **Approve** and **Reject**.
3. Assert: the CR-C row shows the text `Your own request — another Super Admin decides it` and has **no** Approve/Reject buttons.
4. Click **Approve** on CR-A. Assert: a browser confirm dialog shows `Approve and apply this change?` followed by `QA-AUTO {runId} price change A`. Click **Cancel**. Assert: CR-A is still listed and unchanged in Firestore (`status: "pending"`).
5. Click **Approve** on CR-A again and accept the confirm. Assert: within ~1.5 s the Approvals view re-renders and CR-A is no longer in **Needs your decision**.
6. Assert in Firestore: `changeRequests/CR-A` has `status: "approved"`, `reviewedBy` = superadmin email, `reviewedByUid` = superadmin uid, and `reviewedAt` set. Then check the target spare part via nav **Spare Parts**: its Price shows the new value after the function runs (allow up to 10 s, then reload).
7. Assert: the Dashboard `Pending Approvals` tile drops by 1 compared with before step 5 (navigate to Dashboard and reload).

### TC-02: Reject a pending change request (prompt → cancel, then proceed)
1. On **Approvals**, click **Reject** on CR-B. Assert: a prompt dialog shows `Reason for rejecting (shown to the person who asked):`.
2. Click **Cancel** in the prompt. Assert: nothing changes and CR-B is still listed.
3. Click **Reject** again, type `rejectReason`, and click OK.
4. Assert: CR-B disappears from **Needs your decision**. In Firestore, `status: "rejected"` and `reviewNote` = `rejectReason`.
5. Click nav **Administration**. Assert: the audit log has Action `Status Changed`, By = superadmin email, and Details containing `Rejected change request from <warehouse email>: QA-AUTO {runId} price change B — QA-AUTO {runId} rejected — price not justified`.
6. Assert: the spare part targeted by CR-B keeps its old price.

### TC-03: Waiting elsewhere panel
1. On **Approvals**, assert that **Waiting elsewhere** shows five lines with numbers: `verified claim(s) to pay`, `claim(s) to verify`, `dealer / distributor order(s) to approve`, `center / technician stock-add request(s)`, `RMA(s) to approve`. Each line has its location hint (e.g. `— Warehouse → Claims Verification`).

### TC-04: Change a user's role (Edit CRM account)
1. Click nav **Users & Access**, find row `qa-auto+tech-{runId}@example.test`, and click **Edit**.
2. Assert: dialog `Edit CRM account`. **Email** is disabled and shows the email, with the hint `Email can't be changed here — it's tied to the login account.` **Role** = `Technician`. `Skills` and `Brand authorization` rows are visible.
3. Change **Full name** to `editName` and **Role** to `Service Center`. Assert: `Skills` is hidden, and `Cities / districts covered`, `Pincodes covered`, `Categories handled` are now visible.
4. Click **Save changes**. Assert: the button shows `Saving…`, then the green `Saved.` appears and the modal closes within ~1 s.
5. Assert: the row shows Name `editName` and role pill `servicecenter`. Nav **Technicians** no longer lists it, and nav **Service Centers** does.
6. Click nav **Administration**. Assert: an audit row with Action `Role Changed` and Details `Changed role for qa-auto+tech-{runId}@example.test from "technician" to "servicecenter"`.
7. Revert: Edit again, set Role = `Technician`, and save. Assert: `Saved.`, and an audit row `Role Changed … from "servicecenter" to "technician"`.

### TC-05: Edit modal — Cancel, overlay click, password reset
1. Open **Edit** on the same row, change Full name to `QA-AUTO discard`, and click **Cancel**. Assert: the dialog closes and the name in the table is unchanged.
2. Reopen **Edit** and click **Send password reset**. Assert: the button shows `Sending…`, then the green `Password reset email sent to qa-auto+tech-{runId}@example.test.` In the emulator, the Auth emulator logs an out-of-band (OOB) email action.
3. Click the overlay outside the card. Assert: the dialog closes.

### TC-06: Pending signup queue (requested scope) — record as BLOCKED
1. On **Users & Access**, look for tabs `Pending`, `Active`, `Rejected` or any approve/reject control per account.
2. Expected (per brief): these tabs exist. Actual (per source): they are absent.
3. Record the result as `BLOCKED — feature not present in crm/CRMsuperadmin.html` with a screenshot of the Users & Access panel. Do not fail the other TCs because of this.

## Assertions
- [ ] Approve confirm text is `Approve and apply this change?` + summary. Cancel leaves the request pending.
- [ ] Approve proceed sets `status: approved` and removes the row from the queue.
- [ ] Reject prompt Cancel changes nothing. Reject with a reason sets `status: rejected` + `reviewNote`, and writes an audit entry.
- [ ] Own request shows `Your own request — another Super Admin decides it` with no buttons.
- [ ] Role change shows `Saved.`, moves the account between the Technicians and Service Centers lists, and writes a `Role Changed` audit entry.
- [ ] Password reset shows `Password reset email sent to …`.
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected.

## Screenshots required
- Approvals page initial load showing CR-A, CR-B, CR-C
- Approve confirm dialog; reject prompt dialog
- Approvals after approve and after reject
- Edit CRM account modal before and after the role switch
- `Saved.` and `Password reset email sent to …` states
- Users & Access panel for TC-06 (missing tabs)

## Pass criteria
TC-01 to TC-05 pass AND no unexpected console/network errors. TC-06 is reported as BLOCKED (feature gap), not as a pass.
