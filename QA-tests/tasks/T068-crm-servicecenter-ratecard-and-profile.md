# T068-crm-servicecenter-ratecard-and-profile: Service Charge Rates override request and Center profile save

| Field | Value |
|---|---|
| Route | `/crm/CRMservicecenter.html` → sidebar `Service Charge Rates` and `Profile` |
| Source | `crm/CRMservicecenter.html` (`renderRateCard`, `#save-rate-card` handler → `changeRequests` kind `center_rate`; `renderProfile`, `#save-profile` handler → `users/{uid}` merge) |
| Flow | Request a rate override for Super Admin approval; edit and save center name/phone/address |
| Requires auth | yes |
| Required role | servicecenter |
| Destructive | no |
| Estimated steps | 28 |

## Preconditions
- App running at `http://localhost:8080`
- Run only against the Firebase emulator or a dedicated test project — never the live makwell-websiteandcrm data.
- Signed in as `servicecenter` at `/crm/login.html` using `QA_CRED_SERVICECENTER_USERNAME` / `QA_CRED_SERVICECENTER_PASSWORD`.
- Seed data: ≥ 1 active `productCategories` doc; record the first row's category as `{cat}`. No pending `changeRequests` for this center at the start (or record the starting count).
- Record the current Profile values (`Center name`, `Phone`, `Address`) before TC-03 so they can be restored at the end.

## Test data
- Rate override: `{cat}` row → `Repair — Your Rate` = `275`
- Profile: `Center name` = `QA-AUTO Raichur Service Center`, `Phone` = `9000000701`, `Address` = `QA-AUTO 7 Station Road, Raichur, Karnataka 584101`
- Invalid: rate `-50`; rate unchanged (no edits)

## Steps

### TC-01: Rate card renders
1. Click sidebar **`Service Charge Rates`**. Assert: title `Service Charge Rates`, sub `Your technicians' warranty service-charge rates, by product category and service type`.
2. Assert: hint text begins `Head Office's default is used unless you set your own rate for a row.`; headers `Product Category`, `Size / Model`, `Repair — HO Default`, `Repair — Your Rate`, `Installation — HO Default`, `Installation — Your Rate`.
3. Assert: every HO Default cell resolves from `—` to `₹<amount>` or `Not set`; categories that don't need a service type show `N/A` in both cells; the last row is `Other`.
4. If a pending request exists, Assert green text `<n> rate change request(s) waiting for Super Admin — current rates stay until approved.`

### TC-02: Happy path — request an override
1. Click **`Save your overrides`** with no edits. Assert green `No changes.`; nothing written.
2. In `{cat}` row enter `275` in `Repair — Your Rate`. Click **`Save your overrides`**.
3. Assert: button `Saving…`, then green `Sent to Super Admin for approval — your rates change once approved.`; button back to `Save your overrides`.
4. Reload and reopen. Assert: the input is still empty / old value (override not applied until approval) and the pending banner shows a count increased by 1.
5. Enter `-50` in the same cell; click **`Save your overrides`**. Assert red `Rates must be 0 or more.`; no new change request (pending count unchanged after reload).

### TC-03: Happy path — Center profile save
1. Click **`Profile`**. Assert: title `Profile`, sub `Center account details`; panel `Center profile` fields prefilled; `Email` disabled and equal to the signed-in email; panel `Full profile` leaves `Loading…`.
2. Fill Test data. Click **`Save changes`**.
3. Assert: `Saving…` then green `Saved.`.
4. Reload, reopen Profile. Assert all three values persist.
5. Restore the original values recorded in Preconditions and save again; Assert `Saved.`.

### TC-04: Form validation — Profile
| Field | Empty value error | Pattern violation | Max-length overflow |
|---|---|---|---|
| Center name | no required check — empty saves. Record `DEF: center name can be blanked` | n/a | n/a |
| Phone | empty saves | `abc` saves (no format check) — record DEF | n/a |
| Email | field disabled; cannot be edited | n/a | n/a |

### TC-05: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| `Save your overrides` | no edits | `No changes.` |
| `Save your overrides` | valid edit | `Sent to Super Admin for approval — your rates change once approved.` |
| `Save changes` (Profile) | click | `Saved.` |

### TC-06: Negative & edge cases
- Offline on **`Save your overrides`** → red `Could not send the request. Check console for details.`
- Offline on **`Save changes`** → red `Could not save. Check console for details.`
- No categories seeded → table shows `No product categories set up yet — add them under Super Admin's Categories first.`

## Assertions
- [ ] Rate card headers and HO default values render; overrides go to Super Admin as a pending request, not applied directly.
- [ ] Negative rate refused with `Rates must be 0 or more.`
- [ ] Profile values persist after reload; original values restored at the end.
- [ ] No console errors in DevTools at any step (except deliberate offline cases).
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected.

## Screenshots required
- Service Charge Rates initial load
- Success and error states of `Save your overrides`
- Profile before and after save

## Pass criteria
All TCs above pass AND no unexpected console/network errors. `DEF:` findings are reported but do not fail the task.
