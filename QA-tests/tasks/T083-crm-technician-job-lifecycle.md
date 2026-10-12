# T083-crm-technician-job-lifecycle: My Jobs lifecycle — accept, start, diagnosis, spare request, parts used, complete

| Field | Value |
|---|---|
| Route | `/crm/CRMtechnician.html` → sidebar `My Jobs` / `Diagnosis` |
| Source | `crm/CRMtechnician.html` (`JOB_NEXT_ACTIONS`, `CR_JOB_NEXT_ACTIONS`, `advanceJob`, `lifecycleRejectionFor`, `openJobDetailModal`, `jd-spare-request-btn` handler, `renderDiagnosis`/`buildDiagnosisCard`, `openClosureModal`, `closureForm` submit); `crm/stockOps.js` (`runStockOp`, `runStockOpOrThrow`) |
| Flow | Advance a job through the state machine; Job details modal; Diagnosis notes + photos + spare request; Complete job modal with parts consumption |
| Requires auth | yes |
| Required role | technician |
| Destructive | yes (status transitions, Spare Bag consumption, defective-return creation, Request Reassignment) |
| Estimated steps | 70 |

## Preconditions
- App running at `http://localhost:8080`.
- **Run only against the Firebase emulator or a dedicated test project — never the live makwell-websiteandcrm data. Mark BLOCKED if traffic would reach the live project.** Confirm in DevTools > Network before the first status change.
- Cloud Functions emulator running (`applySparesOp` for `stockOps`, the lifecycle checker that writes `lifecycleRejected`, `billOnClose_*`). If functions are not emulated, `stockOps` stay `pending` and parts steps end in `Still being processed — check again in a minute.` — mark those steps BLOCKED rather than FAIL.
- Sign in as `technician` at `/crm/login.html` (env `QA_CRED_TECHNICIAN_USERNAME` / `QA_CRED_TECHNICIAN_PASSWORD`).
- Seed (emulator):
  - `spareParts`: `qa-part-thermostat` `{ partCode: "QA-TH-01", name: "QA-AUTO Thermostat" }`, `qa-part-element` `{ partCode: "QA-EL-02", name: "QA-AUTO Heating Element 2kW" }`.
  - `inventory/technician_{techUid}_qa-part-thermostat` `{ location: "technician", technicianUid: techUid, partId: "qa-part-thermostat", quantity: 5 }`.
  - Job A: `serviceJobs` `{ jobId: "PE-JOB-QA-0001", technicianUid: techUid, customerName: "QA-AUTO Lifecycle A", customerPhone: "9000000301", address: "QA-AUTO Raichur, Karnataka 584101", pincode: "584101", product: "QA-AUTO MakWell geyser 15L", serialNumber: "QAAUTO0000000301", issue: "QA-AUTO No hot water", type: "warranty", category: "Geyser", status: "assigned" }` (or create it via T082).
  - Job B (reassignment): same shape, `jobId: "PE-JOB-QA-0002"`, `customerName: "QA-AUTO Lifecycle B"`, `customerPhone: "9000000302"`, `status: "assigned"`.
  - Job C (center ticket): `centerRequests` `{ requestId: "PE-CR-QA-0003", technicianUid: techUid, customerName: "QA-AUTO Center C", customerPhone: "9000000303", status: "assigned", issue: "QA-AUTO Leak" }`.
  - Optional history: a completed `serviceJobs` doc with the same `serialNumber: "QAAUTO0000000301"`, `closureCode: "repaired"`.

## Test data
- `diagnosisNotes = "QA-AUTO Thermostat open circuit; element OK (insulation 50MΩ)"`
- `beforePhoto = fixtures/qa-before.jpg` (< 1 MB image), `afterPhoto = fixtures/qa-after.jpg`, `serialPhoto = fixtures/qa-serial.jpg`
- `bigPhoto` = any image > 10 MB; `notImage = fixtures/qa-note.pdf`
- Spare request: part `QA-TH-01 — QA-AUTO Thermostat`, qty `1`
- Closure: `closureCode = "Part(s) Replaced"` (value `replaced`), `actionTaken = "QA-AUTO Replaced thermostat, tested 45 min, heating OK"`, `partsNotes = "None"`, part line 1 = `QA-TH-01 — QA-AUTO Thermostat` qty `1`
- Invalid closure: `closureCode = ""`, `actionTaken = ""`, `partsNotes = ""`, part line qty `""` or `-1`, qty `99` (more than the bag holds)

## Steps

### TC-01: Happy path — serviceJobs state machine Assigned → In Progress
1. Click sidebar `My Jobs`. Record Dashboard counts first (Assigned / In Progress / Completed).
2. Locate Job A (`PE-JOB-QA-0001`). Assert: status `Assigned`; actions `Accept Job` (primary) and `Request Reassignment` (red).
3. Click **`Accept Job`**. Assert (≤ 5 s): status `Accepted`; action `I'm On the Way`. No alert.
4. Click **`I'm On the Way`**. Assert: `On the Way`; action `Arrived at Customer`.
5. Click **`Arrived at Customer`**. Assert: `At Customer`; action `Start Work`.
6. Click **`Start Work`**. Assert: `In Progress`; actions `Waiting for Spare` (secondary) and `Mark Complete`.
7. In the emulator assert `serviceJobs/{A}/statusLog` has 4 entries (`accepted`, `on_the_way`, `at_customer`, `in_progress`) with `changedByEmail` = tech email, and `publicTicketStatus/PE-JOB-QA-0001.status = "in_progress"`.

### TC-02: Job details modal — `job-detail-overlay`
1. Click Job A's row (not a button). Assert: dialog title `PE-JOB-QA-0001`; body rows Customer, Phone, Address, Product, Serial No., Issue; `Status: In Progress`.
2. Assert `jd-actions` shows `Waiting for Spare` and `Mark Complete`.
3. If the history seed exists: assert section `Service history — same serial number` lists the earlier job with `Closure: repaired`.
4. Photos: upload `serialPhoto` to `Serial number`, `beforePhoto` to `Before`. Assert `Uploading…` placeholders become 56 px thumbnails; the doc gets `serialNumberPhoto` and `beforePhotos[]`.
5. Upload `bigPhoto` to `Before`. Assert error `"<file name>" is over 10MB and was skipped.`
6. Upload `notImage` to `Serial number`. Assert error `Please choose an image file.`
7. Click the `×` on the before thumbnail → confirm dialog `Remove this photo?` → **Cancel**. Assert the thumbnail stays. Repeat → **OK**. Assert it is removed and `beforePhotos` no longer contains the URL.
8. Click **`Request Spare`** without choosing a part. Assert error `Select a part first.`
9. Click **`Close`**. Assert the dialog closes. Reopen, click the backdrop. Assert it closes.

### TC-03: Diagnosis — notes, photos, spare request → Waiting for Spare → Resume
1. Click sidebar `Diagnosis`. Assert a card `PE-JOB-QA-0001 — QA-AUTO Lifecycle A` with issue text, `Diagnosis notes` textarea, Before/After photo pickers, `Save`, and `Request a spare part`.
2. Type `diagnosisNotes`; click **`Save`**. Assert the button text goes `Saving…` → `Saved` → `Save`. Reload; assert the notes persisted.
3. Upload `afterPhoto` to `After photos`. Assert a thumbnail appears; the doc's `afterPhotos[]` gains the URL.
4. Select part `QA-TH-01 — QA-AUTO Thermostat`, qty `1`; click **`Request Spare`**. Assert the button shows `Requested`; the card re-renders and lists `QA-AUTO Thermostat × 1 — Requested`.
5. Click `My Jobs` → `Waiting for Spare` tab. Assert Job A is there with action `Resume Work`. Emulator: a `spareRequests` doc with `requestId` `PE-SR-<YYYYMMDD>-<NNNN>-Technician`, `sourceJobId` = A, `status: "new"`, `partId: "qa-part-thermostat"`.
6. Open Job A details. Assert linked request `QA-AUTO Thermostat × 1 — Requested`.
7. In the emulator set that spareRequest `status: "dispatched"`. Reopen Job A details. Assert button `Mark Received`. Click it → confirm `Mark this spare as received? Your Spare Bag already reflects this stock from when it was dispatched.` → OK. Assert the request pill is `Received`, Job A becomes `In Progress` (auto-resume), and a `Consume (mark installed)` button appears.
   - Fallback if the dispatch step can't be seeded: click **`Resume Work`** on the Waiting for Spare tab. Assert Job A returns to `Active` as `In Progress`.

### TC-04: Complete job modal — `closure-overlay` validation
1. On `Active`, click Job A's **`Mark Complete`**. Assert: dialog `Complete job`; label `PE-JOB-QA-0001 — QA-AUTO Lifecycle A`; `Parts used` text reads `Requested through the system: QA-AUTO Thermostat (received)` (or `No spare parts were requested through the system for this job.` when none); three part selects listing `QA-TH-01 — QA-AUTO Thermostat` and `QA-EL-02 — QA-AUTO Heating Element 2kW`.
2. Click **`Cancel`**. Assert: closes; Job A still `In Progress`.
3. Validation matrix (reopen each time):

| Field | Empty value error | Pattern violation | Max-length overflow |
|---|---|---|---|
| `Closure code` | Native required bubble on the select (form not submitted) | n/a | n/a |
| `Action taken` | Native required bubble | `"   "` (spaces) → red `Closure code, action taken, and parts used are all required — type "None" if no parts were used.` | n/a |
| `Parts used` text (`closure-parts-notes`) | red `Closure code, action taken, and parts used are all required — type "None" if no parts were used.` (JS-only; no HTML `required`) | n/a | n/a |
| Part line qty | part chosen + qty blank → expected: error. Source silently drops the line and completes without consuming stock → defect if no error | `-1` → browser `min=1` bubble | qty `99` > bag → server-refused message shown in `#closure-error` (exact text from `applySparesOp`), job NOT completed |

### TC-05: Happy path — Complete Job A with a part consumed
1. Reopen **`Mark Complete`** for Job A. Select `Closure code` = `Part(s) Replaced`; fill `Action taken` = actionTaken; `Parts used` text = `None`; part line 1 = `QA-TH-01 — QA-AUTO Thermostat`, qty `1`.
2. Click **`Mark Complete`**. Assert: button `Saving…` → green `Completed.`, button `Done`; dialog closes ~0.8 s later.
3. Assert: Job A is gone from `Active`; on the `Completed` tab its status is `Completed` with actions `—`.
4. Open Job A details. Assert `No further action from here.` and the note `This job is already closed — no further spare requests against it.`; the Request Spare form is hidden.
5. Sidebar `Spare Bag`: assert `QA-TH-01 / QA-AUTO Thermostat` quantity dropped from 5 to 4.
6. Emulator: `serviceJobs/{A}` has `status: "completed"`, `closureCode: "replaced"`, `actionTaken`, `partsUsedNotes: "None"`, `closedByUid` = tech uid; `stockOps` has a `consume` op `status: "done"`; `publicTicketStatus/PE-JOB-QA-0001.status = "completed"`; no `lifecycleRejected`.
7. Dashboard `Completed` +1; Performance `Completed` +1 and `Total Jobs` unchanged.

### TC-06: Center ticket (Job C) lifecycle
1. On `Active`, Job C shows `PE-CR-QA-0003 (via center)` with only `Start Work`.
2. Click **`Start Work`** → `In Progress`. Click **`Mark Complete`** → closure modal → `Closure code` = `Repaired`, `Action taken` = `"QA-AUTO Tightened inlet union"`, `Parts used` = `None`, no part lines → **`Mark Complete`**. Assert `Completed.`; `centerRequests/{C}.status = "completed"`.

### TC-07: Destructive — `Request Reassignment` (Job B)
1. Job B shows `Request Reassignment` (red). There is no confirm dialog in source — record this. Expected: a confirmation before an irreversible hand-back; log as a UX defect if none.
2. Click **`Request Reassignment`**. Assert: Job B leaves `Active`; on `All` it shows `Reassignment Requested` with no actions.
3. Emulator: `statusLog` entry `reassignment_required`.

### TC-08: Negative & edge cases
- Lifecycle rejection: in the emulator set Job B-like job to `assigned`, then use DevTools to call the transition `assigned → completed` (e.g. force a `Mark Complete` button). Assert an alert with the server's `lifecycleRejected.reason` and the status reverting; the details modal shows `Last change rejected`.
- Double click `Accept Job` rapidly → expected one `accepted` statusLog entry. Buttons are not disabled during the up-to-3.6 s rejection poll; log duplicate entries as a defect.
- Closure where `consume` succeeds but the status update fails (stop Firestore after the `stockOps` op is `done`): expected no stock loss or an automatic rollback. Source consumes first and then updates; a retry consumes again — record the bag quantity after retry; a double decrement is a defect.
- Request Spare from Job details for a technician linked to a service center (`users/{uid}.linkedServiceCenterUid` set) with center stock → button text `Issued from center stock`, request `status: "fulfilled_by_center"`, and the job does NOT move to `Waiting for Spare`.
- Item name with `&` (seed part `name: "QA-AUTO Valve & Seal"`, request it, open closure) → `Parts used` text must read `QA-AUTO Valve & Seal`, not `&amp;` (source escapes and then assigns to `textContent`, so double-escaping is a defect).
- A `centerRequests` ticket in status `new` assigned to the tech → appears in `Active` with Actions `—` (no `Start Work`; `CR_JOB_NEXT_ACTIONS` has no `new`). Record it; a stuck ticket is a defect.

## Assertions
- [ ] Each transition button produces the exact next status and next action listed above.
- [ ] Each transition writes a `statusLog` entry and updates `publicTicketStatus`.
- [ ] Diagnosis notes persist; a spare request moves the job to `Waiting for Spare`.
- [ ] Closure requires code + action taken + parts text; the error text matches exactly.
- [ ] Completing with a part line decrements the Spare Bag by exactly the qty.
- [ ] Closed jobs hide the spare request form.
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected.

## Screenshots required
- My Jobs with Job A at each status
- Job details modal (with photos and linked request)
- Diagnosis card after save
- Each closure validation error state
- Closure `Completed.` state and Spare Bag after consumption

## Pass criteria
All TCs above pass AND no unexpected console/network errors AND no traffic reached the live `makwell-websiteandcrm` project.
