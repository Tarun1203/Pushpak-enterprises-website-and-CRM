# T067-crm-servicecenter-technicians-and-claims-forms: Center Technicians roster (add + details) and Center Claims submission

| Field | Value |
|---|---|
| Route | `/crm/CRMservicecenter.html` → sidebar `Center Technicians` and `Center Claims` |
| Source | `crm/CRMservicecenter.html` (`tech-form` submit, `populateTechLinkOptions`, `openTechDetailModal`, `tech-detail-form` submit, `td-pincode` blur lookup, `detectTimelineEvents`; `cclaim-form` submit, `uploadClaimBill`) |
| Flow | Add technician to roster → edit Technician details → Submit a claim |
| Requires auth | yes |
| Required role | servicecenter |
| Destructive | no |
| Estimated steps | 50 |

## Preconditions
- App running at `http://localhost:8080`
- Run only against the Firebase emulator or a dedicated test project — never the live makwell-websiteandcrm data.
- Signed in as `servicecenter` at `/crm/login.html` using `QA_CRED_SERVICECENTER_USERNAME` / `QA_CRED_SERVICECENTER_PASSWORD`.
- Firebase Functions + Storage emulators running (technician code `TC-NNNN` is issued server-side; the claim bill is uploaded to Storage).
- Seed data: `pincodes/584101` exists (area/city `Raichur`, district `Raichur`, state `Karnataka`); fixture files `QA-tests/fixtures/qa-auto-bill.pdf` (< 10 MB) and `QA-tests/fixtures/qa-auto-too-big.pdf` (> 10 MB). If the fixtures folder does not exist, the runner creates both before the run.

## Test data
Add technician (`#tech-form`):
- `Link to an existing Technician account` = `— Not linked, informal entry —`
- `Name` = `QA-AUTO Manjunath S`
- `Phone` = `9000000601`
- `Skills (optional)` = `QA-AUTO Geyser repair, installation`

Technician details (`#tech-detail-form`):
- `Gender` = `Male`; `Date of Birth` = `1995-06-15`
- `Alternate Mobile` = `9000000602`; `Email` = `qa-auto.manjunath@example.test`
- Emergency contact: `Name` = `QA-AUTO Shobha S`, `Number` = `9000000603`, `Relationship` = `Spouse`
- `Address Line 1` = `QA-AUTO 4 Gandhi Chowk`; `Address Line 2` = `Near Bus Stand`; `Pincode` = `584101` (City/District → `Raichur`, State → `Karnataka` from Pincode Master)
- `Employee Code` = `QA-AUTO-EMP-0001`; `Technician Type` = `Service Center`; `Employment Type` = `Full-time`; `Designation` = `Senior Technician`; `Department` = `Field Service`; `Joining Date` = `2026-01-05`; `Employment Status` = `Active`
- `+ Add technical skill` → `Skill` = `TV Installation`, `Skill Level` = `Advanced`
- Working hours: Monday–Saturday `Working` ticked, `08:00`–`20:00`; Sunday unticked
- `Maximum Jobs / Day` = `6`
- `Vehicle Type` = `Motorcycle`; `Vehicle Number` = `KA36 QA 0601`

Claim (`#cclaim-form`):
- `Description` = `QA-AUTO Travel to Sindhanur for installation`
- `Amount (₹)` = `350`
- `Claim type` = `Travel / conveyance`
- `Bill / receipt` = `QA-tests/fixtures/qa-auto-bill.pdf`
- `Notes (optional)` = `QA-AUTO 2 trips, bus fare`

Invalid: empty name/phone; `tooBigBill` = `qa-auto-too-big.pdf`; `Amount` = `-1`; `badEmail` = `not-an-email`; `pincode` = `1234567` (7 digits).

## Steps

### TC-01: Happy path — Add technician to roster
1. Click sidebar **`Center Technicians`**. Assert: title `Center Technicians`, sub `Your technician roster`, button `+ Add Technician`.
2. Click **`+ Add Technician`**. Assert: dialog `Add technician to roster`; link select starts `— Not linked, informal entry —` and lists only technician accounts not linked to another center; `Skills (optional)` visible.
3. Choose any linked account option (if one exists). Assert: `Name` (and `Phone`, if known) prefill and `Skills (optional)` hides. Switch back to `— Not linked, informal entry —`; Assert `Skills (optional)` shows again.
4. Fill Test data. Click **`Add technician`**.
5. Assert: `Saving…` then `Added.`; dialog closes; table row `QA-AUTO Manjunath S` / `9000000601` / `QA-AUTO Geyser repair, installation` / pill `Informal`.
6. Reload. Assert row persists. Dashboard `Technicians` count increased by 1.

### TC-02: Modal — Technician details (edit and save)
1. Click `QA-AUTO Manjunath S`. Assert: dialog titled `QA-AUTO Manjunath S`; `Technician Code` reads `Being assigned…` then `TC-NNNN` within ~8 s (record it); Login block says `No login account — this is an informal roster entry with no app access.`
2. Click **`Close`**. Assert: dialog closes, nothing changed.
3. Reopen. Fill every Technician details field from Test data. Tab out of `Pincode`. Assert: note `Filled from Pincode Master.` and City `Raichur`, State `Karnataka`.
4. Click **`Save changes`**. Assert: `Uploading documents…` → `Saving…` → `Saved.`; dialog closes.
5. Reopen. Assert: every saved value is present; `Technician Timeline` shows entries `Profile details updated`, `Employment status set to Active`, `Skill added — TV Installation` (newest first) plus `Technician profile created`.
6. Pincode not found: enter `999999`, tab out → note `Not found in Pincode Master — fill area/city/district/state in manually.`

### TC-03: Form validation — `tech-form` and `tech-detail-form`
| Form → Field | Empty value error | Pattern violation | Max-length overflow |
|---|---|---|---|
| Add → Name | native required on `Name` | n/a | n/a |
| Add → Phone | native required on `Phone` | `abc` → no client format check; saved. Record `DEF: technician phone not validated` | n/a |
| Details → Full Name | native required on `Full Name` | n/a | n/a |
| Details → Mobile Number | native required on `Mobile Number` | `abc` → saved (no check), record DEF | n/a |
| Details → Email | allowed empty | `not-an-email` → native `type=email` bubble, form blocked | n/a |
| Details → Pincode | allowed empty | `58410A` → no lookup, no note | typing `1234567` → field keeps only 6 characters (`maxlength=6`) |
| Details → Max Overtime / Max Jobs / km fields | allowed empty | `-1` → native `min=0` bubble | n/a |

### TC-04: Happy path — Submit a claim
1. Click **`Center Claims`**. Assert: title `Center Claims`, sub `Your reimbursement claims`, `h2` `My claims`, button `+ Submit Claim`.
2. Click **`+ Submit Claim`**. Assert dialog `Submit a claim`; `Claim type` options `Select…`, `Travel / conveyance`, `Local purchase`, `Tools / consumables`, `Other`.
3. Click **`Cancel`**; Assert no new row. Reopen.
4. Fill Test data. Click **`Submit claim`**.
5. Assert: `Submitting…` then `Submitted — PE-CL-YYYYMMDD-NNNN-ServiceCenter`; dialog closes; top row shows that ID, description, `₹350`, pill `Submitted`.
6. Reload. Assert row persists. **`Reports`** `claims submitted` count increased by 1.

### TC-05: Form validation — `cclaim-form`
| Field | Empty value error | Pattern violation | Over-limit |
|---|---|---|---|
| Description | native required on `Description` | n/a | n/a |
| Amount (₹) | native required on `Amount (₹)` | `-1` → native `min=0` bubble | n/a |
| Claim type | native required on `Claim type` (JS fallback `Choose the claim type.`) | n/a | n/a |
| Bill / receipt | native required on file input (JS fallback `Attach the bill or receipt.`) | n/a | `qa-auto-too-big.pdf` → red `The bill must be under 10 MB.` |
After every blocked case Assert: no new claim row.

### TC-06: Negative & edge cases
- Offline on **`Add technician`** → `Could not add this technician. Check console for details.`
- Offline on **`Save changes`** (details) → `Could not save. Check console for details.`
- Offline on **`Submit claim`** → `Could not submit this claim. Check console for details.`
- Storage emulator stopped on claim submit → generic error above; no Firestore claim doc created.

## Assertions
- [ ] Informal technician added and listed with pill `Informal`; server issues `TC-NNNN`.
- [ ] All Technician details values persist; pincode lookup fills Raichur/Karnataka; timeline events logged.
- [ ] Claim submitted with ID `PE-CL-…-ServiceCenter` and bill uploaded; validation and 10 MB limit enforced.
- [ ] No console errors in DevTools at any step (except deliberate offline cases).
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected.

## Screenshots required
- Center Technicians and Center Claims initial load
- `Add technician to roster`, `Technician details`, `Submit a claim` dialogs open
- Each validation error state
- Final roster row and claim row

## Pass criteria
All TCs above pass AND no unexpected console/network errors. `DEF:` findings are reported but do not fail the task.
