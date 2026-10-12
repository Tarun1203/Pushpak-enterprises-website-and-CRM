# T063-crm-servicecenter-spare-requests-head-office: Request a spare from Head Office against a job, track it, mark it received and resume the job

| Field | Value |
|---|---|
| Route | `/crm/CRMservicecenter.html` → sidebar `Center Requests` and `Spare Requests (Head Office)` |
| Source | `crm/CRMservicecenter.html` (`openSpareReqModal`, `spare-req-form` submit, `renderMySpareRequests`, `markSpareRequestReceived`) |
| Flow | Request Spare (modal) → job moves to Waiting for Spare → Warehouse dispatches → Mark Received (confirm) → Resume linked job (confirm) |
| Requires auth | yes |
| Required role | servicecenter |
| Destructive | no |
| Estimated steps | 38 |

## Preconditions
- App running at `http://localhost:8080`
- Run only against the Firebase emulator or a dedicated test project — never the live makwell-websiteandcrm data.
- Signed in as `servicecenter` at `/crm/login.html` using `QA_CRED_SERVICECENTER_USERNAME` / `QA_CRED_SERVICECENTER_PASSWORD`.
- Seed data:
  - ≥ 1 `spareParts` doc; record the first one's `partCode` and `name` as `{partCode}` / `{partName}`.
  - One open request of this center in status `New` or `Assigned`, created via the UI with customer `QA-AUTO Suresh Patil`, phone `9000000201`, product `QA-AUTO 25 L storage geyser`, issue `QA-AUTO Leaking from inlet valve.` (create it with `+ New Request` at the start of TC-01 if missing). Record its ID as `{jobId}`.
  - For TC-03: ability to move the created `spareRequests` doc to status `dispatched` — either sign in as `warehouse` (`QA_CRED_WAREHOUSE_USERNAME` / `QA_CRED_WAREHOUSE_PASSWORD`) and dispatch it from CRMwarehouse.html with transporter `QA-AUTO Raichur Transport`, docket `QA-AUTO-DKT-001`, or set it directly in the emulator: `status = "dispatched"`, `transport = { transporter: "QA-AUTO Raichur Transport", docket: "QA-AUTO-DKT-001", vehicle: "KA36 QA 0001", dispatchDate: "<today>" }`.

## Test data
- `part` = `{partCode} — {partName}` (first real option in `Part`)
- `qty` = `2`
- Invalid: `qtyZero = 0`, `qtyNegative = -1`, `qtyEmpty = ""`, part left at `Select part…`
- Confirm texts:
  - receive: `Mark this spare as received? Center Inventory already reflects this stock from when it was dispatched.`
  - resume: `Resume the linked job now (move it back to In Progress)?`

## Steps

### TC-01: Happy path — Request a spare against a job
1. Navigate to `/crm/CRMservicecenter.html`; click **`Center Requests`**. Locate row `{jobId}` (status `New` or `Assigned`).
2. Click **`Request Spare`** on that row.
3. Assert: dialog `Request a spare part`; label `{jobId} — QA-AUTO Suresh Patil (QA-AUTO 25 L storage geyser)`; `Part` starts with `Select part…` followed by `{partCode} — {partName}` style options; `Quantity` = `1`.
4. Select `part`; set `Quantity` = `2`. Click **`Request Spare`**.
5. Assert: button `Requesting…`, then green `Requested — PE-SR-YYYYMMDD-NNNN-ServiceCenter`; record as `{srId}`; button reads `Requested`; dialog closes ~0.9 s later.
6. Assert: row `{jobId}` status pill = `Waiting for Spare`; Actions = `Resume Work`, `Assign/Reassign Technician`, `Schedule/Reschedule`.
7. Click sidebar **`Spare Requests (Head Office)`**.
8. Assert: top row Request ID `{srId}`, Item `{partName}`, Qty `2`, Status pill `New`, Dispatch details `Not dispatched yet`, Actions empty.
9. Reload; reopen the section. Assert: row still present with the same values.

### TC-02: Modal — `spare-req-overlay` cancel and validation
1. On another open job (or create `QA-AUTO Meena Rao`, `9000000202`, issue `QA-AUTO No power.`), click **`Request Spare`**.
2. Click **`Cancel`**. Assert: dialog closes; that job's status unchanged; no new row in `Spare Requests (Head Office)`.
3. Reopen. Leave `Part` = `Select part…`; click **`Request Spare`**. Assert: native required bubble on `Part` (form not submitted). (If native validation is bypassed, the in-modal error is `Select a part first.`)
4. Validation matrix for `Quantity` (part selected):

| Field | Empty value error | Pattern violation | Max-length overflow |
|---|---|---|---|
| Part | Native required on `Part` / `Select a part first.` | n/a | n/a |
| Quantity | Native required on `Quantity` | `0` or `-1` → native `min=1` bubble (`Value must be greater than or equal to 1`) | n/a |

5. After each blocked case Assert: job status unchanged and no new spare-request row.
6. Click the overlay backdrop. Assert: dialog closes.

### TC-03: Mark Received with confirm — cancel and proceed
1. Move `{srId}` to `dispatched` (Preconditions).
2. Open **`Spare Requests (Head Office)`**. Assert: `{srId}` pill `Dispatched`; Dispatch details `QA-AUTO Raichur Transport · Docket: QA-AUTO-DKT-001 · Veh: KA36 QA 0001 · <date>`; button `Mark Received`.
3. Click **`Mark Received`** → first confirm shows the receive text → click **Cancel**. Assert: status still `Dispatched`, no write.
4. Click **`Mark Received`** → **OK** on the first confirm → second confirm shows the resume text → click **Cancel**.
5. Assert: `{srId}` pill `Received`, Actions text `Received`. Open **`Center Requests`**: `{jobId}` is still `Waiting for Spare`.
6. On `{jobId}` click **`Resume Work`**. Assert: status `In Progress`.

### TC-04: Mark Received → resume linked job (proceed path)
1. Repeat TC-01 on a fresh job (`QA-AUTO Kavitha N`, `9000000203`, issue `QA-AUTO Element burnt.`) → `{srId2}`; dispatch it as in Preconditions.
2. Click **`Mark Received`** → OK → resume confirm → **OK**.
3. Assert: `{srId2}` = `Received`; in **`Center Requests`** that job is now `In Progress`.
4. Open that job's detail → Mark Complete flow is available (button `Mark Complete` present).

### TC-05: Negative & edge cases
- Back-order: set a request to `backorder` → pill `Back Order`, Dispatch details `Not dispatched yet`, no action button.
- Permission rules not published: if `Mark Received` hits a permission error, alert text begins `Could not mark this as received: the updated Firestore security rules` — record as an environment failure, not an app pass.
- Offline when clicking **`Request Spare`** → `Could not request this part. Check console for details.`; button back to `Request Spare`; job status unchanged after reload.
- XSS guard: a job whose customer name is `QA-AUTO <b>bold</b>` shows the literal tags in the modal label (no bold rendering).

## Assertions
- [ ] Spare request created with ID `PE-SR-YYYYMMDD-NNNN-ServiceCenter`, linked job moved to `Waiting for Spare`.
- [ ] Spare Requests (Head Office) lists the request with item, qty, status and dispatch details.
- [ ] Both confirm dialogs honour Cancel (no state change) and OK (state change).
- [ ] Resume via confirm moves the linked job to `In Progress`.
- [ ] No console errors in DevTools at any step (except deliberate offline cases).
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected.

## Screenshots required
- `Request a spare part` dialog open
- Validation state (Part required)
- Spare Requests (Head Office) with `New`, `Dispatched`, `Received` rows
- Center Requests row in `Waiting for Spare`

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
