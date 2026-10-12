# T062-crm-servicecenter-request-lifecycle: Center Requests — log, assign technician, schedule, progress and complete a service request

| Field | Value |
|---|---|
| Route | `/crm/CRMservicecenter.html` → sidebar `Center Requests` |
| Source | `crm/CRMservicecenter.html` (`renderCenterRequests`, `buildRequestActionsHtml`, `req-form` submit, `req-assign-tech-form`, `req-schedule-form`, `sc-closure-form`, `openRequestDetailModal`); `crm/appointment.js` (`validateSlot` messages) |
| Flow | Log a new request → Assign technician → Schedule appointment → Start Progress → Mark Complete (closure) |
| Requires auth | yes |
| Required role | servicecenter |
| Destructive | no |
| Estimated steps | 60 |

## Preconditions
- App running at `http://localhost:8080`
- Run only against the Firebase emulator or a dedicated test project — never the live makwell-websiteandcrm data.
- Signed in as `servicecenter` at `/crm/login.html` using `QA_CRED_SERVICECENTER_USERNAME` / `QA_CRED_SERVICECENTER_PASSWORD`.
- Firebase Functions emulator running (the appointment re-check writes `scheduleRejected`; without it TC-04 still passes on the client checks).
- Seed data:
  - ≥ 1 active `productCategories` doc (otherwise the category select only offers `No categories set up yet` + `Other`; then use `Other`).
  - ≥ 1 roster technician for this center in `centerTechnicians` linked to a technician account (`technicianUid` set), named `QA-AUTO Tech Linked`, employment status Active, no approved leave on the appointment date, no `workingHours` restrictions (or working Mon–Sun 08:00–20:00).
  - ≥ 1 `spareParts` doc (for the optional closure part line in TC-05).

## Test data
Happy-path request (`Log a new request` modal, `#req-form`):
- `Request type` (`#req-type`) = `Repair`
- `Product category` (`#req-category`) = first real category in the list (record its name as `{category}`); if none exist, `Other`
- `Size / model` (`#req-size-bucket`) = first bucket option if the row becomes visible, else leave hidden
- `Customer name` (`#req-customer-name`) = `QA-AUTO Ramesh Kumar`
- `Customer phone` (`#req-customer-phone`) = `9000000101`
- `Address` (`#req-address`) = `QA-AUTO 12 Station Road, Raichur, Karnataka 584101`
- `Brand` (`#req-brand`) = `Other (not our brand)` → `Model number (type it in)` (`#req-model-text`) = `QA-AUTO-GY-15L`
- `Product (free text, optional)` (`#req-product`) = `QA-AUTO 15 L electric geyser`
- `Serial number (optional)` (`#req-serial`) = `QA-AUTO-SN-{runId}` (e.g. `QA-AUTO-SN-20261011A`)
- `Purchase date (optional)` (`#req-purchase-date`) = today − 120 days (e.g. `2026-06-13` for a run on 2026-10-11)
- `Purchased from (optional)` (`#req-purchased-from`) = `QA-AUTO Chittam Enterprises, Raichur`
- `Attach invoice (optional)` / `Attach product photo (optional)` = `QA-tests/fixtures/qa-auto-invoice.pdf` / `QA-tests/fixtures/qa-auto-photo.jpg` if those files exist; otherwise leave empty
- `Issue / details` (`#req-issue`) = `QA-AUTO Geyser not heating; indicator light off.`
- `Assign to technician (optional)` (`#req-technician`) = `Unassigned` (assignment is tested via the modal in TC-02)
- Appointment fields left empty at creation.

Assign / schedule / closure:
- Technician to assign = option whose text starts with `QA-AUTO Tech Linked` (may be prefixed `★ ` and suffixed ` ✓ — …`)
- `scheduleDate` = tomorrow (IST), `scheduleStart` = `10:00`, `scheduleEnd` = `11:00`
- `Closure code` = `Repaired`; `Action taken` = `QA-AUTO Replaced thermostat fuse and tested heating cycle.`; parts-used text = `None`

Invalid values:
- `emptyRequired = ""`, `whitespaceName = "   "`, `badPhone = "abc-not-a-phone"`
- Slot cases (new-request form and Schedule modal): past date `2020-01-01`; start `21:00`/end `22:00`; start `10:00`/end `09:00`; start `10:00`/end `10:15`; start `08:00`/end `17:00`; date with no times plus only a start time.

## Steps

### TC-01: Happy path — Log a new request
1. Navigate to `/crm/CRMservicecenter.html`; click sidebar **`Center Requests`**.
2. Assert: title `Center Requests`, sub `All requests at this center`, button `+ New Request`.
3. Click **`+ New Request`**. Assert: dialog `Log a new request` is visible; `Product category` changes from `Loading…` to real options ending with `Other`; `Model number` select shows `Select a brand first…`; `Assign to technician (optional)` starts with `Unassigned`.
4. Fill every field with its Test data value. When `Brand` = `Other (not our brand)` is chosen, Assert: `Model number` select row hides and `Model number (type it in)` text input appears.
5. Tab out of `Serial number (optional)`. Assert: no `Previous tickets for this serial number:` block (serial is new).
6. Click **`Save request`**.
7. Assert: button shows `Saving…` then the green message `Saved — PE-CR-YYYYMMDD-NNNN-ServiceCenter` (today's date, 4-digit serial) appears; record it as `{requestId}`.
8. Assert: dialog closes about 1 s later; top row of the table shows `{requestId}`, Type `repair`, Customer `QA-AUTO Ramesh Kumar`, Phone `9000000101`, Technician `—`, Status pill `New`.
9. Assert: Actions cell shows `Mark Assigned`, `Request Spare`, `Cancel`, `Assign Technician`, `Schedule`.
10. Reload the page, return to `Center Requests`. Assert: the row is still present with the same values.
11. Click `{requestId}`. Assert: dialog titled `{requestId}` lists `Type: Repair`, `Customer`, `Phone`, `Address`, `Category`, `Product`, `Serial Number`, `Purchase Date`, `Purchased From`, `Issue`, `Status: New`, `Created`. Within a few seconds after creation, `Warranty at intake` = `In warranty until …` (server-computed; absent if the function has not run — record which). Click **`Close`**.
12. Open the request form again, enter the same serial and tab out. Assert: `Previous tickets for this serial number:` lists `{requestId}` with status `new`. Click **`Cancel`**; Assert the table row count is unchanged.

### TC-02: Modal — Assign technician
1. On the `{requestId}` row click **`Assign Technician`**.
2. Assert: dialog `Assign technician` with label `{requestId} — QA-AUTO Ramesh Kumar`; select starts with `Unassigned`; ineligible technicians appear disabled with a reason after `—`.
3. Click **`Cancel`**. Assert: dialog closes; row still `New`, Technician `—`.
4. Reopen, choose `QA-AUTO Tech Linked`, click **`Save`**.
5. Assert: `Saved.` appears, button text `Saved`, dialog closes; row Technician = `QA-AUTO Tech Linked`, Status pill `Assigned`.
6. Assert: Actions now `Start Progress`, `Request Spare`, `Reassign Technician`, `Schedule`.
7. Reopen via **`Reassign Technician`**. Assert: `QA-AUTO Tech Linked` is pre-selected. Click **`Cancel`**.

### TC-03: Mark Assigned without a technician (secondary path)
1. Create a second request with only required fields: name `QA-AUTO Lakshmi Devi`, phone `9000000102`, issue `QA-AUTO TV wall mount loose.`, type `Installation`.
2. Assert: success `Saved — PE-CR-…`; row Type `installation`, Status `New`.
3. Click **`Mark Assigned`**. Assert: status pill becomes `Assigned`, Technician stays `—`, button `Assign Technician` (not `Reassign`).
4. Click sidebar **`Installation`**. Assert: this request is listed; `{requestId}` (repair) is not.

### TC-04: Modal — Schedule appointment (valid and invalid)
1. On `{requestId}` click **`Schedule`**. Assert: dialog `Schedule appointment`, label `{requestId} — QA-AUTO Ramesh Kumar — Technician: QA-AUTO Tech Linked`; date input `min` = today (IST).
2. Click **`Cancel`**. Assert: no change.
3. Reopen. Leave all three empty, click **`Save appointment`**. Assert: browser blocks submit on `Date` (native required).
4. Set date = tomorrow. Assert: suggestion line `QA-AUTO Tech Linked is free (1 h):` with up to 5 slot buttons (first is `08:00` unless booked). Click the `10:00` suggestion; Assert start = `10:00`, end = `11:00`.
5. Invalid slots — for each, fill, click **`Save appointment`**, assert the red `#req-schedule-error` text:

| Date | Start | End | Error text |
|---|---|---|---|
| tomorrow | 21:00 | 22:00 | `Appointments must fall between 08:00 and 20:00.` |
| tomorrow | 10:00 | 09:00 | `End time must be after start time.` |
| tomorrow | 10:00 | 10:15 | `An appointment must be at least 30 minutes.` |
| tomorrow | 08:00 | 17:00 | `An appointment can be at most 8 hours.` |

6. Valid: tomorrow, `10:00`–`11:00`. Click **`Save appointment`**. Assert: button `Checking…`, then `Appointment saved.` within ~6 s; dialog closes; row action now reads `Reschedule`.
7. If instead the error shows a server reason (e.g. `The technician doesn't work on …`, `The service center is closed on that date …`), record it and fix the seed — the test fails.
8. Open `{requestId}` detail. Assert row `Appointment` = `<tomorrow> 10:00–11:00`.
9. Click sidebar **`Scheduling`**. Assert: a row with Date `<tomorrow>` / `10:00–11:00`, Request ID `{requestId}`, Technician `QA-AUTO Tech Linked`, Status `Assigned`.
10. Double booking: open **`Schedule`** on the TC-03 request after assigning it to `QA-AUTO Tech Linked`; choose tomorrow `10:30`–`11:30`. Assert error `QA-AUTO Tech Linked is already booked 10:00–11:00 that day (QA-AUTO Ramesh Kumar).`

### TC-05: Start Progress and Mark Complete (closure modal)
1. On `{requestId}` click **`Start Progress`**. Assert: pill `In Progress`; actions `Mark Complete`, `Request Spare`, `Reassign Technician`, `Reschedule`.
2. Click **`Mark Complete`**. Assert: dialog `Complete request`, label `{requestId} — QA-AUTO Ramesh Kumar`, line `No spare parts were requested through the system for this job.`; three part selects populated from Spare Parts (`— Select part —` first).
3. Click **`Cancel`**. Assert: dialog closes, status still `In Progress`.
4. Reopen. Select `Closure code` = `Repaired`, fill `Action taken`, leave the parts-used text empty. Click **`Mark Complete`**. Assert error: `Closure code, action taken, and parts used are all required — type "None" if no parts were used.`
5. Enter parts-used text `None`. Leave the part lines blank. Click **`Mark Complete`**.
6. Assert: `Completed.`, button `Done`, dialog closes; row status `Completed`, Actions `—`.
7. Open detail. Assert `Status: Completed` and a `Completed` timestamp row.
8. Click **`Service Billing`**. Assert `{requestId}` is listed under `Needs billing` (handled further in T064).

### TC-06: Form validation — `req-form`
Open `+ New Request` each time; fill all other required fields with valid data.

| Field | Empty value | Pattern violation | Max-length overflow |
|---|---|---|---|
| Customer name | Native required bubble on `Customer name`; nothing saved | n/a | n/a (no maxlength) |
| Customer phone | Native required bubble on `Customer phone` | `abc-not-a-phone`: no client format check exists in source — request **is saved**. Record as finding `DEF: Customer phone accepts non-numeric text` | n/a |
| Issue / details | Native required bubble on `Issue / details` | n/a | n/a |
| Customer name = `   ` | Passes native required; saved with blank Customer `—`. Record as finding `DEF: whitespace-only name accepted` | n/a | n/a |

Appointment fields in the new-request form (`#req-error`):

| Date | Start | End | Error |
|---|---|---|---|
| (empty) | 10:00 | (empty) | `Pick a date for this appointment.` |
| 2020-01-01 | (empty) | (empty) | `The appointment date is in the past.` |
| tomorrow | 10:00 | (empty) | `Enter both a start and end time.` |
| tomorrow | 21:00 | 22:00 | `Appointments must fall between 08:00 and 20:00.` |

After each blocked case Assert: no new row was added.

### TC-07: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| `+ New Request` | click | `Log a new request` dialog opens, form reset |
| `Cancel` (req form) | click | dialog closes, no row added |
| Overlay backdrop (any modal) | click outside the white panel | that dialog closes |
| `{requestId}` link | click | `Request details` dialog with action buttons matching the row |
| Action button inside detail dialog (e.g. `Start Progress`) | click | detail dialog closes and the status changes exactly as the row button would |
| `Close` (detail) | click | dialog closes |

### TC-08: Negative & edge cases
- Network offline while clicking **`Save request`** → `Could not save this request. Check console for details.`; button returns to `Save request`.
- Network offline while clicking **`Start Progress`** → browser alert `Could not update this request. Check the console for details.`; status unchanged after going online and reloading.
- Category with size buckets: choose it → `Size / model` row appears with `Select size / model`; choose a flat category → row hides.
- Brand `MakWell` → model select shows `Loading…` then `Select…` + catalog models + `Other / not listed`; choosing `Other / not listed` swaps to the text input.

## Assertions
- [ ] Request saved with ID `PE-CR-YYYYMMDD-NNNN-ServiceCenter` and all entered fields visible in the detail dialog.
- [ ] Status transitions New → Assigned → In Progress → Completed render the correct pills and action buttons at each step.
- [ ] Assign Technician on a `New` request moves it to `Assigned`.
- [ ] Appointment saved, shown in detail (`Appointment`) and on `Scheduling`.
- [ ] All `validateSlot` messages render verbatim.
- [ ] Closure refused without parts-used text; completes with `None`.
- [ ] No console errors in DevTools at any step (except deliberate offline cases).
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected.

## Screenshots required
- Center Requests initial load
- `Log a new request`, `Assign technician`, `Schedule appointment`, `Complete request`, `Request details` dialogs open
- Each validation error state (TC-04 table, TC-05 step 4, TC-06)
- Final state: row `Completed`; Scheduling row

## Pass criteria
All TCs above pass AND no unexpected console/network errors. Findings flagged `DEF:` are reported but do not fail the task.
