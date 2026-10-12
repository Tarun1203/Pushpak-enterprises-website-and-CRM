# T052-crm-superadmin-create-account-center-technician: Create Service Center and Technician logins (admin stays signed in)

| Field | Value |
|---|---|
| Route | `/crm/CRMsuperadmin.html` → nav **Users & Access** |
| Source | `crm/CRMsuperadmin.html` (`#add-user-form` markup ~lines 214-318; `openAddUserModal` / role toggles / submit handler ~lines 1982-2114; `renderCentersOverview` ~4101; `renderTechniciansOverview` ~5334) |
| Flow | **+ Create account** → `Create CRM account` modal → role Service Center / Technician → secondary-app Auth user + `users/{uid}` doc. The Super Admin session is not replaced. |
| Requires auth | yes |
| Required role | superadmin |
| Destructive | no |
| Estimated steps | 45 |

> Note for the orchestrator: this page has **no** separate "Add Service Center" or "Add Technician" modal. The Service Centers and Technicians pages are list views with no add button. Every CRM login, of every role, is created in the single `Create CRM account` modal (`#add-user-overlay`) under **Users & Access**. Bulk CSV creation also exists under **Master Data → Service Centers / Technicians**. This task covers the single-modal path.

## Preconditions
- App running at `http://localhost:8080`
- Signed in as `superadmin` (env `QA_CRED_SUPERADMIN_USERNAME` / `QA_CRED_SUPERADMIN_PASSWORD`).
- **Run only against the Firebase emulator or a dedicated test project — never the live makwell-websiteandcrm data.** This task creates real Firebase Auth users and `users`, `auditLogs` docs. The page hard-codes `projectId: "makwell-websiteandcrm"`, so do the T050 environment check first and stop with `BLOCKED` if traffic would reach the live project.
- Pincode Master contains `584101` with District `Raichur`. Create it with T056 TC-01 or seed it.
- At least one active product category exists, named `QA-AUTO Geyser {runId}`. Create it with T057 TC-01 or seed it. This feeds the `Category…` dropdowns.
- `{runId}` = a unique run token (e.g. `20261011T1030`). Use the same value in every field below.

## Test data
Service Center account (happy path 1):
- `scName = "QA-AUTO Service Center {runId}"`
- `scEmail = "qa-auto+sc-{runId}@example.test"`
- `scPassword` = value of env `QA_TEMP_ACCOUNT_PASSWORD` (≥ 6 chars). Never hard-code it here.
- `scRole = "Service Center"` (value `servicecenter`)
- `scAccountType = "Permanent"`
- `scDistrict = "Raichur"` (select in **Cities / districts covered**, then **Add**)
- `scPincode = "584101"` (auto-added as a chip when the district is added; verify, add manually if missing)
- `scBrands = MakWell ✓, Flyvision ✓, Skevia ☐`
- `scCategory = "QA-AUTO Geyser {runId}"` (select in **Categories handled**, then **Add**)

Technician account (happy path 2):
- `techName = "QA-AUTO Technician {runId}"`
- `techEmail = "qa-auto+tech-{runId}@example.test"`
- `techPassword` = env `QA_TEMP_ACCOUNT_PASSWORD`
- `techRole = "Technician"` (value `technician`)
- `techAccountType = "Temporary / Contractor"`, `techContractEnd = <today + 90 days, YYYY-MM-DD>`
- `techBrands = MakWell ✓`
- `techSkill = "QA-AUTO Geyser {runId}"` at level `Expert`

Invalid values:
- `emptyRequired = ""`
- `badEmail = "not-an-email"`
- `shortPassword = "12345"` (5 chars)
- `dupEmail = scEmail` (reused after happy path 1)

## Steps

### TC-01: Happy path — create a Service Center login
1. Navigate to `http://localhost:8080/crm/CRMsuperadmin.html`, click nav **Users & Access**.
2. Assert: `#page-title` = `Users & Access`, `#page-sub` = `Manage CRM accounts and roles`. Panel `CRM accounts` has table headers `Name | Email | Role | UID | Actions`.
3. Record the number of rows in `#users-tbody` as `N0`.
4. Click **+ Create account**. Assert: dialog `Create CRM account` is visible. Fields `Full name`, `Email`, `Temporary password (min 6 characters)`, `Role` (default `Select a role…`) are shown. The rows `Account type`, `Cities / districts covered`, `Pincodes covered`, `Brand authorization`, `Categories handled`, `Skills`, `Distribution` are hidden.
5. Fill **Full name** = `scName`, **Email** = `scEmail`, **Temporary password** = `scPassword`.
6. Select **Role** = `Service Center`. Assert: these rows become visible: `Account type`, `Cities / districts covered`, `Pincodes covered`, `Brand authorization`, `Categories handled`. `Skills` and `Distribution` stay hidden.
7. Leave **Account type** = `Permanent`. Assert: `Contract end date` stays hidden.
8. In **Cities / districts covered**, select `Raichur` and click **Add**. Assert: chip `Raichur ×` appears, and chip `584101 ×` is auto-added under **Pincodes covered**. The pincode list narrows to Raichur-district pincodes only.
9. Tick **MakWell** and **Flyvision** under **Brand authorization**.
10. In **Categories handled**, select `scCategory` and click **Add**. Assert: chip `QA-AUTO Geyser {runId} ×` appears.
11. Click **Create account**. Assert: the button shows `Creating…` and is disabled while saving.
12. Assert: the green message `Account created for qa-auto+sc-{runId}@example.test.` appears in the modal. The modal closes by itself within ~1.5 s.
13. Assert: `#users-tbody` now has `N0 + 1` rows. One row shows Name `scName`, Email `scEmail`, role pill `servicecenter`, and a non-empty UID.
14. **Admin stays signed in:** Assert `#user-email` still equals `QA_CRED_SUPERADMIN_USERNAME`, the sidebar still reads `Super Admin`, and no redirect to `login.html` happened. Reload the page. Assert: it lands on `Dashboard` as superadmin, and the `CRM Users` tile count is the previous count + 1.
15. Click nav **Service Centers**. Assert: a row shows Name `scName`, Type pill `Permanent`, Brands `MakWell, Flyvision`, Categories `QA-AUTO Geyser {runId}`, Coverage `1 district(s), 1 pincode(s)` (or more pincodes if the master has more Raichur PINs), Requests `0`, Technicians `0`.
16. Click nav **Administration**. Assert: the audit log's top rows include Type `User`, Action `Created`, By = superadmin email, and Details `Created account for qa-auto+sc-{runId}@example.test with role "servicecenter"`.
17. **Persistence / login check:** In a separate incognito context, sign in at `/crm/login.html` with `scEmail` / `scPassword`. Assert: login succeeds and routes to the Service Center portal (`CRMservicecenter.html`), not to Super Admin.

### TC-02: Happy path — create a Technician login (temporary contractor)
1. Back in the superadmin context, on **Users & Access**, click **+ Create account**.
2. Assert: the form is reset. All fields are empty, Role = `Select a role…`, no chips from TC-01 remain, and no brand checkboxes are ticked.
3. Fill **Full name** = `techName`, **Email** = `techEmail`, **Temporary password** = `techPassword`, **Role** = `Technician`.
4. Assert: `Account type`, `Brand authorization`, `Skills` are visible. `Cities / districts covered`, `Pincodes covered`, `Categories handled`, `Distribution` are hidden.
5. Select **Account type** = `Temporary / Contractor`. Assert: `Contract end date (after this date, excluded from new assignments)` appears. Fill `techContractEnd`.
6. Tick **MakWell**.
7. In **Skills**, select category `QA-AUTO Geyser {runId}`, level `Expert`, and click **Add**. Assert: chip `QA-AUTO Geyser {runId} — Expert ×`. Click **Add** again with the same category. Assert: no duplicate chip.
8. Click **Create account**. Assert: `Account created for qa-auto+tech-{runId}@example.test.`, the modal closes, and the row with role pill `technician` appears.
9. Assert: `#user-email` is still the superadmin email (admin session intact).
10. Click nav **Technicians**. Assert: a row shows Name `techName`, Type pill `Temporary — ends {techContractEnd}` (amber, not `(expired)`), Brands `MakWell`, Skills `QA-AUTO Geyser {runId} (expert)`, Jobs `0`, and buttons **Suspend** and **Full profile**.
11. Click **Full profile** on that row. Assert: dialog `QA-AUTO Technician {runId} — full profile` shows `Not on any Service Center's roster yet — nothing to show until a Service Center adds/links this technician under Center Technicians.` Click **Close**.

### TC-03: Form validation — `add-user-form`
Open **+ Create account** fresh for each row. Fill every other field with valid TC-01 data (use a new email `qa-auto+val{n}-{runId}@example.test` per row). Change only the field under test, click **Create account**, and assert the result. The modal must stay open, and no row may be added to `#users-tbody`.

| Field | Empty value error | Pattern violation | Min/Max-length |
|---|---|---|---|
| Full name | Native `required` tooltip on `#new-user-name` ("Please fill out this field."); no network call | n/a | n/a (no maxlength in source; see TC-05) |
| Email | Native `required` tooltip on `#new-user-email` | `not-an-email` → native email-type tooltip (type=email); no Auth call | n/a |
| Temporary password | Native `required` tooltip | n/a | `12345` → native `minlength=6` tooltip ("Please lengthen this text to 6 characters or more…") |
| Role | Native `required` tooltip on `#new-user-role` (empty option value). The JS fallback text `Select a role.` (`#add-user-error`) shows only if native validation is bypassed. If the runner submits via `form.requestSubmit()` with `novalidate`, assert `Select a role.` | n/a | n/a |
| Email (server) | — | Reuse `scEmail` → red `That email is already registered.`, and the button returns to `Create account` (enabled) | — |

Also assert for every row: `#user-email` is still the superadmin email after the failed attempt.

### TC-04: Modal coverage — `add-user-overlay`
1. Click **+ Create account**. Assert: title `Create CRM account` is visible.
2. Type `QA-AUTO Discard {runId}` in **Full name**, then click **Cancel**. Assert: the dialog closes and no row is added.
3. Reopen. Assert: **Full name** is empty (the form resets on open).
4. Reopen and click the dark overlay outside the dialog card. Assert: the dialog closes.
5. Reopen, select Role `Dealer`. Assert: `Distribution` is visible with `Direct (buys straight from Pushpak Enterprises)` selected. Switch to `Under a Distributor`. Assert: the `Distributor` select appears (options load from distributor accounts). Click **Cancel** without saving.

### TC-05: Negative & edge cases
- **Chip removal:** In the Service Center flow, add district `Raichur` and then remove the `584101 ×` chip. Assert: the chip is removed and the saved account (if submitted) shows `1 district(s), 0 pincode(s)`. Cancel instead of saving if you do not want an extra account.
- **Temporary with no end date:** Create a Technician with `Temporary / Contractor` and leave **Contract end date** blank. The source does not validate this. Record the actual result. Expected product behaviour: blocked with an error. If the account is created with Type `Temporary` and no end date, log a defect `Temporary account accepted without contract end date`.
- **Very long name:** Full name = 300 × `A` prefixed `QA-AUTO `. Record whether it is accepted (no maxlength exists). Assert: the Users table row does not break the layout (the text wraps or is truncated).
- **HTML in name:** Full name = `QA-AUTO <b>bold</b> {runId}`. Assert: the Users table, Service Centers table, and Technicians table render the literal text `<b>bold</b>`, not bold text.
- **Network failure:** Toggle DevTools offline, then submit valid data. Assert: red `Something went wrong. Please try again.` and the button is re-enabled. Toggle online.

## Assertions
- [ ] `Account created for <email>.` is shown for both Service Center and Technician.
- [ ] New rows appear in Users & Access, Service Centers, and Technicians with the exact values above.
- [ ] Superadmin `#user-email` is unchanged after every create, both success and failure. Reload keeps the superadmin session.
- [ ] New Service Center login can sign in and lands on the Service Center portal.
- [ ] Audit log entry `Created account for … with role "servicecenter"` exists.
- [ ] Role-conditional rows show and hide exactly as listed in TC-01 step 6 and TC-02 step 4.
- [ ] Validation table outcomes hold, and duplicate email shows `That email is already registered.`
- [ ] No console errors in DevTools at any step. Expected exception: `Create user failed:` during TC-03 duplicate and TC-05 offline.
- [ ] No failed network requests (no 4xx/5xx) except the expected Auth 400 `EMAIL_EXISTS` in TC-03.

## Screenshots required
- Users & Access initial load
- `Create CRM account` modal with Role = Service Center (all conditional rows visible)
- `Create CRM account` modal with Role = Technician + Temporary (contract end visible)
- Each validation error state (native tooltip and `That email is already registered.`)
- Success message `Account created for …`
- Final Service Centers row and Technicians row

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
