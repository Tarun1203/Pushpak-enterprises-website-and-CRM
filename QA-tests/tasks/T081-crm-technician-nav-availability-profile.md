# T081-crm-technician-nav-availability-profile: Sidebar nav sweep, notifications, Availability and Profile

| Field | Value |
|---|---|
| Route | `/crm/CRMtechnician.html` |
| Source | `crm/CRMtechnician.html` (`NAV`, `selectSection`, `renderAvailability`, `renderProfile`, `loadFullProfile`, notifications) |
| Flow | Navigate to every sidebar section; set availability; edit profile; notification bell |
| Requires auth | yes |
| Required role | technician |
| Destructive | no (writes `technicianAvailability`, `users/{uid}`, `centerTechnicians`, `notifications.read`) |
| Estimated steps | 45 |

## Preconditions
- App running at `http://localhost:8080`.
- **Run only against the Firebase emulator or a dedicated test project — never the live makwell-websiteandcrm data. Mark BLOCKED if traffic would reach the live project.** Confirm in DevTools > Network before the first write.
- Sign in as `technician` at `/crm/login.html` (env `QA_CRED_TECHNICIAN_USERNAME` / `QA_CRED_TECHNICIAN_PASSWORD`).
- Seed (emulator):
  - `centerTechnicians` doc linked to the technician (`technicianUid == techUid`, `employmentStatus: "ACTIVE"`) — needed for the Full profile panel.
  - `pincodes/584101` with `area: "Raichur"`, `city: "Raichur"`, `taluk: "Raichur"`, `district: "Raichur"`, `state: "Karnataka"`.
  - ≥ 2 `notifications` docs with `recipientType: "uid"`, `recipientValue: techUid`, `read: false`, titles `QA-AUTO notif 1`, `QA-AUTO notif 2`.
  - `technicianAvailability/{techUid}` absent (or `suspended` false) at start.

## Test data
- Profile: `name = "QA-AUTO Technician {runId}"`, `phone = "9000000101"`, `address = "QA-AUTO Station Road, Raichur, Karnataka 584101"`, `skills = "QA-AUTO Geyser repair, electrical wiring"`, `brands = "MakWell"`
- Full profile: `gender = Male`, `dob = 1995-06-15`, `altPhone = "9000000102"`, `ecName = "QA-AUTO Contact"`, `ecPhone = "9000000103"`, `ecRelation = "Brother"`, `addr1 = "QA-AUTO 12 Station Road"`, `addr2 = "Near Bus Stand"`, `pincode = "584101"`, `vehicleType = Motorcycle`, `vehicleNumber = "KA36QA0001"`, `license = "KA36-QA-AUTO-0001"`, `licenseExpiry = 2030-12-31`
- Leave: `type = Casual`, `start = 2026-11-02`, `end = 2026-11-03`, `reason = "QA-AUTO leave"`; invalid: `start = 2026-11-05`, `end = 2026-11-01`
- Availability values: `Available`, `On the Way`, `At Customer`, `In Progress`, `On a Break`, `On Leave`, `Holiday`, `Offline`

## Steps

### TC-01: Nav sweep — every section renders with the correct title/sub-title
For each row, click the sidebar item and assert the topbar `<h1>`, the sub-title, the item gets class `active`, and the listed content renders (no `isn't built yet` panel anywhere, no red `Couldn't load …` row).

| Sidebar group → item | `<h1>` | Sub-title | Content that must render |
|---|---|---|---|
| Overview → `Dashboard` | `Dashboard` | `Welcome back` | 4 stat cards `Assigned`/`In Progress`/`Completed`/`Alerts`; panel `Getting started` |
| My Work → `My Jobs` | `My Jobs` | `Jobs assigned to you` | button `+ Log Job`; tabs `Active`,`Waiting for Spare`,`Completed`,`Closed`,`All`; table headers `Job ID, Customer, Phone, Product, Issue, Status, Actions` |
| My Work → `Schedule` | `Schedule` | `Upcoming scheduled jobs` | panel `Upcoming schedule`; headers `Date, Time, Job ID, Customer, Address, Status` (or empty row `No scheduled jobs yet — set a date and time when logging a job.`) |
| My Work → `Availability` | `Availability` | `Let dispatch know your status` | panel `Your availability`; 8 buttons (see Test data) |
| My Work → `Diagnosis` | `Diagnosis` | `Diagnosis notes on active jobs` | job cards or `No active jobs to diagnose right now.` |
| Inventory → `Spare Bag` | `Spare Bag` | `Parts you're currently carrying` | panel `My spare bag`; button `+ Update Spare Bag`; headers `Code, Part, Quantity carried` |
| Finance → `Claims` | `Claims` | `Your reimbursement claims` | panel `My wallet — unclaimed: ₹…`; button `Submit selected as claim` (disabled); panel `My claims`; button `+ Submit Claim` |
| Finance → `Earnings` | `Earnings` | `Reimbursements received` | stat `Reimbursements Received` = `₹<n>`; `Job Commission` = `—` / `Not set up yet`; panel `Settled claims` |
| Operations → `Performance` | `Performance` | `Your job completion stats` | stats `Completed`, `Cancelled`, `Completion Rate` (`<n>%` or `—`), `Total Jobs` — all leave `…` |
| Operations → `Profile` | `Profile` | `Your account details` | panel `Your profile` (Email field disabled, prefilled with signed-in email); panel `Full profile` |

Then click `Dashboard` again. Assert only one nav item has `active`.

### TC-02: Notification bell
1. Assert: bell badge `#notif-badge` shows `2` (or the seeded unread count; `9+` above 9). Note: source only loads notifications on bell click or after a 60 s poll — if the badge is hidden on first load and only appears after clicking/60 s, log as a defect.
2. Click the bell. Assert: panel `Notifications` opens listing `QA-AUTO notif 2` and `QA-AUTO notif 1` (newest first), unread items highlighted.
3. Click `QA-AUTO notif 1`. Assert: it loses the unread highlight and the badge decrements by 1.
4. Click **`Mark all read`**. Assert: badge hides; all items lose unread style; panel stays open.
5. Click outside the panel. Assert: panel closes.

### TC-03: Availability — set each status
1. Click `Availability`. Assert: text `You haven't set your availability yet.` (fresh seed).
2. Click **`Available`**. Assert: `Current status:` pill reads `Available`; the `Available` button has class `active`.
3. Repeat for `On the Way`, `At Customer`, `In Progress`, `On a Break`, `On Leave`, `Holiday`, `Offline`; after each click assert the pill label equals the clicked label and exactly one button is `active`.
4. Hover each button. Assert its tooltip (title) matches, e.g. `Available` → `Free to take on new jobs right now.`, `Offline` → `Outside working hours / day off.`
5. Reload the page, click `Availability`. Assert: `Offline` persisted.
6. Click **`Available`** to leave the account available.

### TC-04: Availability — suspended technician cannot change status
1. In the emulator set `technicianAvailability/{techUid}.suspended = true`.
2. Reopen `Availability`. Assert: text `Suspended — contact your Service Center or Warehouse. You can't change your own status while suspended.`; all 8 buttons are disabled (opacity 0.5, cursor not-allowed).
3. Force-click `Available` via DevTools (`button.disabled=false; button.click()`). Assert: alert `Your account is suspended — you can't change your own status. Contact your Service Center or Warehouse.` and the stored status is unchanged.
4. Revert `suspended` to `false`.

### TC-05: Profile — happy path save
1. Click `Profile`. Fill `Name`, `Phone`, `Address`, `Skills (your notes)`, `Brand authorization` with Test data.
2. Click **`Save changes`** (in `Your profile`). Assert: green text `Saved.`
3. Reload, open `Profile`. Assert: all 5 values persisted; `Email` still disabled.

### TC-06: Full profile — save, pincode lookup, leave request, document validation
1. In `Full profile`, set Gender, Date of Birth, Alternate Mobile, Emergency Contact (Name/Number/Relationship), Address Line 1/2 with Test data.
2. Type `584101` in `Pincode` and tab out. Assert: Area/City/Taluk/District = `Raichur`, State = `Karnataka`; note `Filled from Pincode Master.`
3. Type `999999` and tab out. Assert: note `Not found in Pincode Master — fill in manually.` Re-enter `584101`.
4. Set Vehicle Type `Motorcycle`, Vehicle Number, Driving License Number, License Expiry. Click the Full profile **`Save changes`**. Assert: `Saved.`; Timeline gains `Profile details updated (by technician)`.
5. Leave: click **`Request leave`** with all fields blank. Assert error `Leave type, start date and end date are required.`
6. Fill valid leave Test data and click **`Request leave`**. Assert: leave list shows `CASUAL · 2026-11-02–2026-11-03 · PENDING`.
7. Fill invalid leave (end before start) and submit. Expected: rejected. Source has no ordering check — if it is accepted, log as a defect.
8. Documents: click **`Upload document`** with nothing chosen. Assert error `Pick a document type and a file.`
9. Assert read-only sections render: `Employment Details`, `Brand Authorization`, `Product Capability`, `Technical Skills`, `Working Hours` (7 days), `Capacity`, `Tools & Equipment`, `Customer Feedback`.

### TC-07: Negative & edge cases
- Technician with no linked `centerTechnicians` doc → Full profile shows `Not yet linked to a Service Center roster — ask your Service Center to add/link you under Center Technicians before this fills in.`
- Put `<img src=x onerror=alert(1)>` in Profile `Name`, save, reload → it renders as text, no alert.
- Seed a `centerTechnicians.technicalSkills` entry with `level: "<b>QA</b>"` → Technical Skills must show the literal text, not bold. Source does not escape `level`/`yearsExperience` here — bold rendering is an XSS defect.

## Assertions
- [ ] All 10 sidebar sections render with the exact titles/sub-titles above.
- [ ] Notification badge, per-item mark-read and `Mark all read` work.
- [ ] Each availability value persists and shows the right pill; suspended blocks changes.
- [ ] Profile and Full profile saves persist; pincode lookup fills from `pincodes/584101`.
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected.

## Screenshots required
- Each of the 10 sections after load
- Notification panel open
- Availability with `Available` active, and suspended state
- Profile saved state; Full profile after pincode autofill; leave validation error

## Pass criteria
All TCs above pass AND no unexpected console/network errors AND no traffic reached the live `makwell-websiteandcrm` project.
