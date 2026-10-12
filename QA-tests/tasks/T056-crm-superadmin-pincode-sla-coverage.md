# T056-crm-superadmin-pincode-sla-coverage: Pincode Master, Bulk import, SLA rules, coverage timeline

| Field | Value |
|---|---|
| Route | `/crm/CRMsuperadmin.html` → nav **Pincode Master**, **SLA & Escalation**, **Coverage Analysis**, **Service Centers** |
| Source | `crm/CRMsuperadmin.html` (`pincode-form` submit ~3095, `pincode-bulk-form` ~3152, `loadCoverageAnalysis` ~3229, `sla-rule-form` ~8646, `logScTimelineEvent` ~4395, edit-user coverage diff ~2251) |
| Flow | Add / edit a pincode with validation, bulk import, add an SLA rule with validation, check coverage gaps, check the Service Center coverage timeline |
| Requires auth | yes |
| Required role | superadmin |
| Destructive | no |
| Estimated steps | 40 |

## Preconditions
- App running at `http://localhost:8080`
- Signed in as `superadmin` (env `QA_CRED_SUPERADMIN_USERNAME` / `QA_CRED_SUPERADMIN_PASSWORD`).
- **Run only against the Firebase emulator or a dedicated test project — never the live makwell-websiteandcrm data.** The page hard-codes the live config with no emulator switch. If traffic would reach the live project, **mark this task BLOCKED** and stop.
- Writes `pincodes`, `slaRules`, `serviceCenterTimeline`, `users`.
- For TC-05: `QA-AUTO Service Center {runId}` from T052.
- PINs `584101` and `584102` belong to Raichur. On a shared test project they may already exist: `setDoc` merge overwrites area/city, so use the values below exactly.

## Test data
- Add pincode: `pin = "584101"`, `area = "QA-AUTO Raichur Town"`, `city = "Raichur"`, `taluk = "Raichur"`, `district = "Raichur"`, `state = "Karnataka"`, `status = "Active"`
- Bulk lines:
  ```
  584102, QA-AUTO Yeragera, Raichur, Raichur, Raichur, Karnataka
  58410X, QA-AUTO Bad, Raichur, Raichur, Raichur, Karnataka
  584103, QA-AUTO Short
  ```
- SLA rule: `name = "QA-AUTO Raichur {runId}"`, `appliesTo = "A district"`, `value = "Raichur"`, `dueSoon = 12`, `breached = 36`
- Invalid: `badPin5 = "58410"`, `badPinAlpha = "58A101"`, `emptyBulk = ""`, `dueSoon = 48 / breached = 24`, `dueSoon = 24 / breached = 24`, `dueSoon = 0`

## Steps

### TC-01: Happy path — add a pincode
1. Click nav **Pincode Master**. Assert the title is `Pincode Master`, the subtitle is `PIN → City / Taluk / District / State — the territory hierarchy everything else resolves against`, and buttons **Bulk import** and **+ Add Pincode** are shown.
2. Click **+ Add Pincode**. Assert: dialog `Add pincode` and submit label `Save pincode`.
3. Fill every field with the Test data and click **Save pincode**.
4. Assert: green `Saved.`, the modal closes in ~0.8 s, and the table row `584101 | QA-AUTO Raichur Town | Raichur | Raichur | Raichur | Karnataka | active`.
5. Type `QA-AUTO` and then `584101` in the search box. Assert: the row is found. Type `zzz-none`. Assert: `No matches.`
6. Click **Edit** on 584101. Assert: title `Edit 584101`, the **PIN** field is disabled, and the button reads `Save changes`. Set Status `Inactive` and save. Assert: the pill shows `inactive`. Set it back to `Active` and save.
7. Reload the page and reopen Pincode Master. Assert: the row persists.

### TC-02: Form validation — `pincode-form`
| Field | Empty value error | Pattern violation | Max-length overflow |
|---|---|---|---|
| PIN | Native `required` tooltip | `58410` → `Enter a valid 6-digit PIN.`; `58A101` → `Enter a valid 6-digit PIN.` | Typing 7 digits keeps only 6 (`maxlength=6`) |
| Area / City / Taluk / District / State | optional — saves blank, table shows `—` | n/a | n/a |

### TC-03: Modal — Bulk import pincodes
1. Click **Bulk import**. Assert: dialog `Bulk import pincodes` with hint `One per line: PIN, Area, City, Taluk, District, State …`.
2. Click **Import** with an empty textarea. Assert: `Paste at least one line.`
3. Paste the 3 bulk lines and click **Import**. Assert: `Imported 2 pincode(s), skipped 1 invalid line(s).` Rows 584102 (area `QA-AUTO Yeragera`) and 584103 (area `QA-AUTO Short`, other columns `—`) appear.
4. Reopen and click **Cancel**. Assert: it closes with no change.

### TC-04: Modal — Add SLA rule
1. Click nav **SLA & Escalation**, then **+ Add rule**. Assert: dialog `Add SLA rule`, with defaults Due soon `24` and Breached `48`.
2. Validation:
   | Input | Expected |
   |---|---|
   | Rule name empty | native `required` tooltip |
   | Value empty | native `required` tooltip |
   | Due soon `48`, Breached `24` | `Breached hours must be greater than Due Soon hours.` |
   | Due soon `24`, Breached `24` | `Breached hours must be greater than Due Soon hours.` |
   | Due soon `0` | native `min=1` tooltip |
3. Enter the valid SLA data and click **Save rule**. Assert: `Saved.`, and a rule row `QA-AUTO Raichur {runId} | District: Raichur | 12h | 36h`.
4. Assert: any open Raichur-pincode ticket in **Open requests by age** shows Rule Applied `QA-AUTO Raichur {runId}`.
5. Click **Edit** on the rule. Assert: title `Edit SLA rule` with the values prefilled. Click **Cancel**.

### TC-05: Coverage analysis and the Service Center coverage timeline
1. Click nav **Coverage Analysis**. Assert: the **Coverage gaps by district** row `Raichur` shows Total ≥ 3. Covered includes 584101 (from T052), and Uncovered counts 584102 and 584103. Click **View** and assert the list contains `584102 (Raichur)` and `584103`.
2. Click nav **Users & Access**, **Edit** `QA-AUTO Service Center {runId}`, add the pincode chip `584102`, and click **Save changes**. Assert: `Saved.`
3. Click nav **Service Centers**, then **Full profile** on that center. Assert: the **Audit / History** block contains `Coverage added — 584102`, and on first open `Service Center profile created`.
   - **Likely defect:** `logScTimelineEvent` references an undefined `currentUser`, which throws a ReferenceError that is caught and only logged as the console warning `Timeline log failed (non-blocking): currentUser is not defined`. If the timeline shows `No activity recorded yet.` and that warning appears, record the defect and fail this step.
4. Assert: `Service Center Code` shows `SC-` followed by 4 digits within ~8 s (server-issued), or `Being assigned…` if functions are not running (in that case mark the step BLOCKED). Click **Close**.

## Assertions
- [ ] Pincode add/edit/search work. `Enter a valid 6-digit PIN.` appears for invalid PINs.
- [ ] Bulk import message is `Imported 2 pincode(s), skipped 1 invalid line(s).`
- [ ] SLA validation message and the 12h/36h rule row appear as specified.
- [ ] Coverage gaps reflect the new pincodes. The coverage timeline logs `Coverage added — 584102`.
- [ ] No console errors in DevTools at any step. The `currentUser is not defined` warning counts as a defect.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected.

## Screenshots required
- Pincode Master initial load, Add pincode modal, each validation error
- Bulk import result message
- SLA rule modal with the breached ≤ due-soon error; the saved rule row
- Coverage gaps expanded; Service Center full profile Audit / History block

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
