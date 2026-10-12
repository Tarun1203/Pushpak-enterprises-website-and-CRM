# T082-crm-technician-log-job: My Jobs — Log a new job (modal `job-overlay`) and its validation

| Field | Value |
|---|---|
| Route | `/crm/CRMtechnician.html` → sidebar `My Jobs` |
| Source | `crm/CRMtechnician.html` (`openJobModal`, `jobForm` submit handler, `generateJobId`, `populateCategorySelect`, `populateSizeBucketSelect`, `loadMyJobs`) |
| Flow | Fill and submit form "Log a new job"; open and close modal "Log a new job"; My Jobs tab filters |
| Requires auth | yes |
| Required role | technician |
| Destructive | no (creates `serviceJobs`, `counters/servicejob-YYYYMM`, `publicTicketStatus` docs) |
| Estimated steps | 40 |

## Preconditions
- App running at `http://localhost:8080`.
- **Run only against the Firebase emulator or a dedicated test project — never the live makwell-websiteandcrm data. Mark BLOCKED if traffic would reach the live project.** Confirm in DevTools > Network before clicking `Save job`.
- Sign in as `technician` at `/crm/login.html` (env `QA_CRED_TECHNICIAN_USERNAME` / `QA_CRED_TECHNICIAN_PASSWORD`).
- Seed (emulator) `productCategories`:
  - `{ name: "Geyser", status: "active", sizeBuckets: ["10L", "15L", "25L"] }`
  - `{ name: "Washing Machine", status: "active", sizeBuckets: [] }`
  - `{ name: "QA-AUTO Inactive", status: "inactive" }` (must NOT appear)

## Test data
- `customerName = "QA-AUTO Customer {runId}"`
- `customerPhone = "9000000201"`
- `address = "QA-AUTO Gandhi Chowk, Raichur, Karnataka"`
- `pincode = "584101"`
- `serviceType = "Warranty Repair"` (value `warranty`)
- `product = "QA-AUTO MakWell geyser 15L"`
- `category = "Geyser"`, `sizeBucket = "15L"`
- `serial = "QAAUTO0000000201"`
- `issue = "QA-AUTO Geyser not heating, tripping MCB"`
- `scheduledDate = 2026-10-20`, `start = 10:00`, `end = 11:30`
- Invalid: `emptyRequired = ""`, `whitespaceName = "   "`, `badPhone = "abc"`, `shortPhone = "12"`, `longPincode = "5841012"` (7 chars), `alphaPincode = "58A10B"`, `endBeforeStart = start 15:00 / end 09:00`

## Steps

### TC-01: Happy path — Log a warranty job with every field filled
1. Click sidebar `My Jobs`. Assert `<h1>` `My Jobs`, sub-title `Jobs assigned to you`, `Active` tab is selected.
2. Click **`+ Log Job`**. Assert: dialog titled `Log a new job` is visible; `Size / model` row is hidden; `Product category` options are `Geyser`, `Washing Machine`, `Other` (sorted, no `QA-AUTO Inactive`).
3. Fill `Customer name` = customerName, `Customer phone` = customerPhone, `Address` = address, `Pincode` = pincode.
4. Select `Service type` = `Warranty Repair`. Fill `Product / brand` = product.
5. Select `Product category` = `Geyser`. Assert: row `Size / model` appears with options `Select size / model`, `10L`, `15L`, `25L`. Select `15L`.
6. Fill `Serial number` = serial, `Issue description` = issue, `Scheduled date` = 2026-10-20, `Start time` = 10:00, `End time` = 11:30.
7. Click **`Save job`**.
8. Assert: button shows `Saving…` then green text `Saved — PE-JOB-<YYYYMMDD>-<NNNN>-Technician` (date = today); record the job ID as `newJobId`.
9. Assert: the modal closes ~1 s later.
10. Assert: the `Active` table has a new top row: Job ID `newJobId`, Customer customerName, Phone `9000000201`, Product product, Issue issue, Status pill `Assigned`, Actions `Accept Job` and `Request Reassignment` (red).
11. Reload, open `My Jobs`. Assert the row persists. In the emulator assert `serviceJobs` doc fields: `technicianUid` = signed-in uid, `type: "warranty"`, `category: "Geyser"`, `sizeBucket: "15L"`, `pincode: "584101"`, `serialNumber: "QAAUTO0000000201"`, `scheduledDate: "2026-10-20"`, `scheduledStartTime: "10:00"`, `scheduledEndTime: "11:30"`, `status: "assigned"`; and `publicTicketStatus/{newJobId}` exists with `status: "assigned"`, `requestType: "repair"`, `customerPhone: "9000000201"`.
12. Click sidebar `Schedule`. Assert a row: Date `2026-10-20`, Time `10:00–11:30`, Job ID `newJobId`, Customer customerName, Status `Assigned`.
13. Click sidebar `Dashboard`. Assert `Assigned` count increased by 1 vs. before step 7.

### TC-02: Happy path — minimal required fields only
1. Open **`+ Log Job`**; fill only `Customer name = "QA-AUTO Minimal {runId}"`, `Customer phone = "9000000202"`, `Issue description = "QA-AUTO Installation needed"`; set `Service type` = `Installation`; select `Product category` = `Washing Machine` (assert `Size / model` stays hidden).
2. Click **`Save job`**. Assert `Saved — PE-JOB-…-Technician`; the job ID sequence number = TC-01's + 1.
3. Assert the new row shows Product `—`. Assert it does NOT appear in `Schedule` (no date).

### TC-03: Form validation — `job-form`
Submit with the field set to the invalid value and all other fields valid. Required fields use native HTML `required` (browser bubble, no custom text); record the browser message.

| Field | Empty value error | Pattern violation | Max-length overflow |
|---|---|---|---|
| `Customer name` | Native "Please fill out this field." — no `serviceJobs` write | `"   "` (spaces) → expected: blocked. Source trims after the `required` check, so it saves `customerName: ""` → log as defect if saved | n/a |
| `Customer phone` | Native required bubble | `"abc"` / `"12"` → expected: rejected. `type="tel"` has no pattern and JS does no check → log as defect if saved | n/a |
| `Issue description` | Native required bubble | `"   "` → same as Customer name | n/a |
| `Pincode` | optional — saves `""` | `"58A10B"` → expected: rejected (6 digits). Source has no check → defect if saved | typing `5841012` stops at `584101` (maxlength 6) |
| `End time` | optional | end `09:00` < start `15:00` → expected: rejected. No check in source → defect if saved | n/a |

After each blocked case assert: the modal stays open, `#job-error` is hidden, and no new row appears.

### TC-04: Modal coverage — `job-overlay`
1. Click **`+ Log Job`**. Assert the dialog `Log a new job` is visible; record whether focus moves to `Customer name` (if not, log as an a11y note).
2. Type values, click **`Cancel`**. Assert: the dialog closes; no new row.
3. Reopen. Assert: every field is reset (blank; Service type back to `Repair`), `Size / model` hidden, no error/success text.
4. Reopen, click the dark backdrop outside the dialog. Assert: it closes.
5. Reopen, submit with empty required fields. Assert the native validation bubble on `Customer name` inside the modal.
6. Reopen, submit valid TC-02 data. Assert success + row added.

### TC-05: Job list tab filters
1. On `My Jobs`, click each tab and assert:
   - `Active` → statuses Assigned/Accepted/On the Way/At Customer/In Progress only (no Waiting for Spare).
   - `Waiting for Spare` → only `Waiting for Spare`.
   - `Completed` → only `Completed`.
   - `Closed` → only `Closed`.
   - `All` → every job, newest first.
2. An empty tab shows `No jobs here.`
3. Center-assigned tickets (seed one `centerRequests` doc with `technicianUid` = tech uid, `status: "assigned"`, `customerName: "QA-AUTO Center {runId}"`) show `(via center)` beside the ID and action `Start Work`.

### TC-06: Negative & edge cases
- Double submit: click **`Save job`** twice quickly after the success text appears (button is re-enabled during the 1 s close delay). Expected: one job. If two `serviceJobs` docs are created, log as a defect.
- Category default: open the modal and do not touch `Product category`. Expected: no category until chosen. Source preselects the first category (`Geyser`), so it gets saved silently — log as a defect if `category: "Geyser"` is stored for a job where nothing was chosen.
- Category with buckets but `Size / model` left at `Select size / model` → saves `sizeBucket: null`. Record; expected a required-size error.
- Firestore emulator stopped → click `Save job` → error `Could not save this job. Check console for details.`, button returns to `Save job`.
- XSS: `Customer name = "<img src=x onerror=alert(1)>"` → table shows the literal text, no alert.
- No categories seeded → options `No categories set up yet`, `Other`.

## Assertions
- [ ] `Saved — PE-JOB-<YYYYMMDD>-<NNNN>-Technician` shown; sequence increments by 1.
- [ ] New row appears with status `Assigned` and actions `Accept Job` / `Request Reassignment`.
- [ ] Scheduled job appears in `Schedule`; `publicTicketStatus` mirror created.
- [ ] Inactive categories hidden; size buckets appear only for categories that have them.
- [ ] Required fields block submit; Cancel/backdrop close without writing.
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected.

## Screenshots required
- My Jobs initial load
- `Log a new job` modal opened (with `Size / model` visible after Geyser)
- Each validation error state
- `Saved — …` success state and the new row in the table

## Pass criteria
All TCs above pass AND no unexpected console/network errors AND no traffic reached the live `makwell-websiteandcrm` project.
