# T033-portal-register-product-validation: Form validation — `reg-form`

| Field | Value |
|---|---|
| Route | `/portal.html` (section `Register a Product`) |
| Source | `portal.html` (`#reg-form`, `novalidate`), `functions/customer.js` (`validateRegistration`, `contactFields`), `functions/stock.js` (`SERIAL_RE`) |
| Flow | Form validation — `reg-form` |
| Requires auth | yes |
| Required role | customer |
| Destructive | no |
| Estimated steps | 30 |

## Preconditions
- App running at `http://localhost:8080`.
- Run only against the Firebase emulator or a dedicated test project. Never run against the live makwell-websiteandcrm data. Every row here should be rejected, but a defect could let a write through to `productRegistrations`. Before submitting, confirm in DevTools → Network that `registerProduct` goes to the Functions emulator (`localhost:5001`) or to the dedicated test project. Otherwise STOP and mark BLOCKED.
- Sign in as `customer`. The runner resolves `QA_CRED_CUSTOMER_USERNAME` / `QA_CRED_CUSTOMER_PASSWORD` on `/portal.html` → `Email & password`. The account is phone-verified with `+91 9000000001` (Auth-emulator / test-project test number; the OTP comes from the emulator or the fixed test OTP).
- The same seed catalog as T032 is present (`MakWell` → `QA-AUTO Geyser` → `QA-MW-GZ-15L`).
- The form has `novalidate`. The browser does no validation, and every message comes back from the `registerProduct` callable as `functions/invalid-argument` and is shown in `#r-msg`. The server validates in the order brand → product → model → serial → purchase date → name → address → city → pincode, so each row below changes **one** field from the valid baseline.
- Validation failures happen before the daily rate limit, so these rows do not count toward the 10/day registration cap.

## Test data
Valid baseline (`{runId}` uppercase alphanumeric):
- `Brand = "MakWell"`, `Product = "QA-AUTO Geyser"`, `Model = "QA-MW-GZ-15L"`
- `Serial number = "QA-AUTO-{runId}-V1"`
- `Purchase date = today − 10 days`
- `Bought from (shop / dealer) = "QA-AUTO Dealer"`
- `Name = "QA-AUTO Customer"`, `Address = "QA-AUTO 1-2-3, Station Road"`, `City = "Raichur"`, `State = "Karnataka"`, `Pincode = "584101"`
- Consent `pr-consent` = checked

Invalid values:
- `emptyRequired = ""` (also clear prefilled profile values)
- `badSerialSpace = "QA AUTO 01"`, `badSerialShort = "AB1"`, `badSerialSlash = "QA/AUTO/01"`
- `futureDate = today + 1 day`
- `tooOldDate = today − 10 years − 1 day`
- `badPin5 = "58410"`, `badPinZero = "084101"`, `badPinAlpha = "58410A"`
- `tooLongName = 101 × "a"`, `tooLongAddress = 301 × "a"`, `tooLongCity = 61 × "a"`, `tooLongSerial = 41 × "A"`, `tooLongModelOther = 61 × "A"`, `tooLongPin = "5841011"`

## Steps

### TC-01: Happy path baseline sanity (no submit)
1. Navigate to `/portal.html`. Sign in as customer. Click nav **`Register a Product`**.
2. Assert: `Name`, `Address`, `City`, `State` and `Pincode` are prefilled from the saved profile (or empty for a new profile). This is expected behavior (`prefillForms`).
3. Fill every field with the valid baseline. Do NOT submit. This is the starting point for each TC-02 row. After each row, restore the field to its baseline value.

### TC-02: Form validation — `reg-form`
For each row, set only the listed field, click **`Register product`**, and assert the red `#r-msg` text. Also assert that `Registered products` on Home is unchanged after the whole table.

| Field | Empty value error | Pattern violation | Max-length overflow |
|---|---|---|---|
| `Brand` | `Select…` → `Choose a brand.` | n/a | n/a |
| `Product` | Brand set, `Product = Select…` → `Choose a product category.` | n/a | n/a |
| `Model` | `Model = Select…` → `Enter the model number.` | n/a | `Not listed — type it in` + 61 chars → input holds 60 chars (HTML `maxlength=60`) |
| `Model` (other) | `Not listed — type it in` with `Type your model number = ""` → `Enter the model number.` | n/a | — |
| `Serial number` | `""` → accepted (optional; no error from this field, so do not submit, or the record is created) | `QA AUTO 01`, `AB1`, `QA/AUTO/01` → `That serial number does not look right. Use letters, digits and dashes only (4–40 characters).` | 41 chars typed → input holds 40 |
| `Purchase date` | `""` → `Enter the purchase date.` | future → `The purchase date cannot be in the future.`; > 10 years ago → `That purchase date is too old to register.` | n/a |
| `Bought from (shop / dealer)` | optional | n/a | 101 chars → input holds 100 |
| `Name` | `""` → `Enter your name.` | n/a | 101 chars → input holds 100 |
| `Address` | `""` → `Enter your address.` | n/a | 301 chars → input holds 300 |
| `City` | `""` → `Enter your city.` | n/a | 61 chars → input holds 60 |
| `State` | optional (no server check) | n/a | 61 chars → input holds 60 |
| `Pincode` | `""` → `Enter a valid 6-digit pincode.` | `58410`, `084101`, `58410A` → `Enter a valid 6-digit pincode.` | `5841011` typed → input holds `584101` |
| `Name` = whitespace only `"   "` | → `Enter your name.` (trimmed) | n/a | n/a |

### TC-03: Privacy consent is required
1. Fill the full valid baseline, but use `Serial number = "QA-AUTO-{runId}-NC"` and **uncheck** the Privacy Policy consent box (`pr-consent`).
2. Click **`Register product`**.
3. Assert: submission is blocked. A visible error near the form asks for consent, no `registerProduct` request appears in the Network tab, no green `Registered. Your reference number is …` message shows, and `Registered products` on Home is unchanged.
4. Source note: the `#reg-form` submit handler never reads `pr-consent`, the form is `novalidate`, and `validateRegistration` has no consent check. The current build is therefore expected to FAIL this TC by creating a registration. If it does, record it as a defect (consent not enforced), take a screenshot of the success message, and record the `PE-REG-…` id so the test record can be cleaned up.

### TC-04: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| `Register product` | click with an invalid row | button disabled during the call, then re-enabled; red message shown; field values kept |
| `Model` select → `Not listed — type it in` | change | `Type your model number` input shown |
| `Model` select → a listed model | change | `Type your model number` input hidden |

### TC-05: Negative & edge cases
- Fix an error and resubmit: after `Enter your city.`, fill `City = "Raichur"` and submit with `Serial number = "QA-AUTO-{runId}-V2"` → green `Registered. Your reference number is PE-REG-…-Portal.` (this row WRITES one registration). The red message is replaced, not appended.
- Paste `" 584101 "` (with spaces) into `Pincode` → the server trims it and the registration is accepted. Use serial `QA-AUTO-{runId}-V3`. This WRITES one registration.
- Purchase date exactly today (IST) → accepted (not "in the future"). Use serial `QA-AUTO-{runId}-V4`. This WRITES one registration.

## Assertions
- [ ] Every error message in TC-02 matches the table text exactly and renders in red in `#r-msg`.
- [ ] HTML `maxlength` caps are enforced on typing for every text field listed.
- [ ] No registration is created by any invalid row (Home count unchanged; no new `productRegistrations` doc in the emulator).
- [ ] Consent checkbox blocks submission (TC-03), or the defect is logged.
- [ ] No console errors other than the `console.error` the page logs for each rejected callable.
- [ ] No failed network requests other than the expected `registerProduct` invalid-argument responses.

## Screenshots required
- Form with baseline data
- Each distinct validation error message in TC-02
- TC-03 result (blocked, or the defect evidence)

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
