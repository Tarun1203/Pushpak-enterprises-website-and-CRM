# T032-portal-register-product-as-customer: Register a product and check its warranty

| Field | Value |
|---|---|
| Route | `/portal.html` (section `Register a Product`, then `My Products` / `Warranty`) |
| Source | `portal.html` (`#reg-form` submit, `#w-check`), `functions/index.js` (`registerProduct`, `checkWarranty`), `functions/customer.js` (`validateRegistration`) |
| Flow | Fill and submit form `reg-form`; check a serial number under Warranty |
| Requires auth | yes |
| Required role | customer |
| Destructive | no |
| Estimated steps | 36 |

## Preconditions
- App running at `http://localhost:8080`.
- Run only against the Firebase emulator or a dedicated test project. Never run against the live makwell-websiteandcrm data. This task WRITES `productRegistrations`, `registrationSerials`, `counters`, `lookupLimits` and `users/{uid}.contact`. `portal.html` hard-codes the `makwell-websiteandcrm` config. Before submitting, confirm in DevTools → Network that `registerProduct` / Firestore calls go to the emulators or to the dedicated test project. Otherwise STOP and mark BLOCKED.
- Sign in as `customer`. The runner resolves `QA_CRED_CUSTOMER_USERNAME` / `QA_CRED_CUSTOMER_PASSWORD` and signs in on `/portal.html` → `Email & password`. The account must be phone-verified with `+91 9000000001` (Auth-emulator / test-project test number; if `Verify your mobile` appears, use the emulator's code or the fixed test OTP) and have `users/{uid}.role = "customer"`.
- Seed data (emulator):
  - `productCategories/qa-geyser` = `{ brandId: "makwell", name: "QA-AUTO Geyser", status: "active" }`
  - `products/qa-geyser-15` = `{ brandId: "makwell", categoryId: "qa-geyser" }`
  - `productModels/qa-mw-gz-15` = `{ productId: "qa-geyser-15", modelNumber: "QA-MW-GZ-15L" }`
  - `unitSerials/QA-AUTO-UNREG-0001` = `{ serial: "QA-AUTO-UNREG-0001", modelId: "qa-mw-gz-15" }` (no `registrationId`)
  - A `productRegistrations` doc for **another** customer: `{ registrationId: "PE-REG-20260101-0001-Portal", customerPhone: "9000000099", serialNumber: "QA-AUTO-OTHER-0001", brand: "MakWell", category: "QA-AUTO Geyser", purchaseDate: "2026-01-01" }`
- Rate limit: 10 `registerProduct` calls per customer per IST day that pass validation (duplicate-serial attempts count). This task makes 3. Do not rerun it more than 3 times a day with the same account.

## Test data
`{runId}` = uppercase letters/digits only, max 10 chars (e.g. `R20261011A`), so that serials pass `^[A-Z0-9][A-Z0-9-]{3,39}$`.
- `Brand = "MakWell"`
- `Product = "QA-AUTO Geyser"`
- `Model = "QA-MW-GZ-15L"`
- `Serial number = "QA-AUTO-{runId}-01"`
- `Purchase date = today − 10 days` (IST, format `YYYY-MM-DD`)
- `Bought from (shop / dealer) = "QA-AUTO Chittam Enterprises"`
- `Name = "QA-AUTO Customer"`
- `Address = "QA-AUTO 1-2-3, Station Road"`
- `City = "Raichur"`
- `State = "Karnataka"`
- `Pincode = "584101"`
- `I need installation / demo` = checked
- Privacy consent `pr-consent` = checked
- Second registration (TC-02): `Brand = "MakWell"`, `Product = "QA-AUTO Geyser"`, `Model = "Not listed — type it in"` → `Type your model number = "QA-AUTO-CUSTOM-25L"`, `Serial number = "qa-auto-{runid}-02"` (lowercase on purpose), `Purchase date = today − 30 days`, no dealer, installation unchecked, contact as above.
- `unknownSerial = "QA-AUTO-NOPE-{runId}"`

## Steps

### TC-01: Happy path — Register a MakWell geyser
1. Navigate to `/portal.html`. Sign in as customer. Assert: `Hello, …` Home is shown, and note `Registered products = N`.
2. Click nav **`Register a Product`**. Assert: heading `Register a Product`, sub-text `Register within days of buying to start your warranty record. Your mobile number is added automatically.` `Product` shows `Select brand first…` and `Model` shows `Select brand and product first…`.
3. Select `Brand = MakWell`. Assert: `Product` briefly shows `Loading…`, then lists `Select…` and `QA-AUTO Geyser`.
4. Select `Product = QA-AUTO Geyser`. Assert: `Model` lists `Select…`, `QA-MW-GZ-15L`, `Not listed — type it in`, and the `Type your model number` input is hidden.
5. Select `Model = QA-MW-GZ-15L`. Fill `Serial number`, `Purchase date` and `Bought from (shop / dealer)` from Test data.
6. Under `Your details`, clear any prefilled values and fill `Name`, `Address`, `City`, `State` and `Pincode` from Test data. Check `I need installation / demo` and the Privacy Policy consent box.
7. Click **`Register product`**. Assert: the button is disabled while the request runs.
8. Assert: `#r-msg` is green and matches `^Registered\. Your reference number is PE-REG-\d{8}-\d{4}-Portal\.$`. Record it as `regId1`.
9. Assert: `Serial number`, `Purchase date` and `Bought from` are now empty and `I need installation / demo` is unchecked. `Brand`, `Product`, `Model` and the contact fields keep their values.
10. Click nav **`Home`**. Assert: `Registered products = N + 1`.
11. Click nav **`My Products`**. Assert: the first card has heading `MakWell QA-AUTO Geyser — QA-MW-GZ-15L`, with rows `Model QA-MW-GZ-15L`, `Serial QA-AUTO-{runId}-01`, `Purchased <date>`, `Registration regId1`, and a warranty pill starting `Active until`.
12. Click nav **`Warranty`**. Assert: the table (`Product | Serial | Purchased | Warranty`) has a row for `QA-AUTO-{runId}-01` with an `Active until …` pill.
13. Reload the page. Assert: the registration is still listed under `My Products`.
14. Assert (emulator): the `productRegistrations` doc with `registrationId == regId1` has `customerPhone: "9000000001"`, `source: "portal"`, `installationRequired: true`, `dealerName: "QA-AUTO Chittam Enterprises"`, `pincode: "584101"`. `users/{uid}.contact.city == "Raichur"`.

### TC-02: Happy path — "Not listed" model, lowercase serial is normalized
1. Nav **`Register a Product`**. Select `Brand = MakWell`, `Product = QA-AUTO Geyser`, `Model = Not listed — type it in`.
2. Assert: `Type your model number` input becomes visible. Fill it with `QA-AUTO-CUSTOM-25L`.
3. Fill the rest from the TC-02 test data and check the consent box. Click **`Register product`**.
4. Assert: green `Registered. Your reference number is PE-REG-…-Portal.`
5. Nav **`My Products`**. Assert: the new card shows `Model QA-AUTO-CUSTOM-25L` and `Serial QA-AUTO-{runId}-02` (uppercased).

### TC-03: Duplicate serial is rejected
1. Nav **`Register a Product`**. Fill as in TC-01 with `Serial number = "QA-AUTO-{runId}-01"` (already yours). Click **`Register product`**.
2. Assert `#r-msg` (red): `You have already registered this serial number.`
3. Change `Serial number = "QA-AUTO-OTHER-0001"` (another customer's). Click **`Register product`**.
4. Assert `#r-msg` (red): `This serial number is already registered. If you bought this product second-hand, please contact support.`
5. Assert: `Registered products` on Home is unchanged by steps 1–4.

### TC-04: Warranty — Check a serial number
Nav **`Warranty`**, section `Check a serial number`.

| `Serial number` input | Click | Expected |
|---|---|---|
| `""` | **`Check`** | `#w-msg`: `Enter the serial number.` |
| `ab` | **`Check`** | `#w-msg`: `Enter the serial number printed on the product.` |
| `QA-AUTO-{runId}-01` | **`Check`** | card with heading `MakWell QA-AUTO Geyser — QA-MW-GZ-15L`, `Purchased <date>`, pill `Active until …` |
| `QA-AUTO-OTHER-0001` | **`Check`** | notice `This serial number is already registered to another customer. If you bought this product second-hand, or think this is a mistake, please contact support.` No other customer's name or phone is shown. |
| `QA-AUTO-UNREG-0001` | **`Check`** | notice `This unit (model QA-MW-GZ-15L) is genuine and not registered yet.` with button `Register it now` |
| `QA-AUTO-NOPE-{runId}` | **`Check`** | notice `We could not find this serial number. Check it against the label on the product — you can still register it and we will verify it.` |

Then click **`Register it now`** (after the `QA-AUTO-UNREG-0001` check). Assert: the `Register a Product` section is active and `Serial number` = `QA-AUTO-UNREG-0001`. Do not submit.

### TC-05: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| `Register product` | click with valid data | disabled during the request, green reference message |
| `Check` (`#w-check`) | click | disabled during the request, then one result per the TC-04 table |
| `Register it now` | click | switches to `Register a Product` with the serial prefilled |
| `Privacy Policy` link | click | opens `privacy.html` in a new tab |

### TC-06: Negative & edge cases
- Go offline, submit a valid form → `#r-msg`: `Could not register this product. Please try again.`, and the button is re-enabled.
- Change `Brand` after choosing a model → `Model` resets to `Select brand and product first…` and `Type your model number` is hidden.
- Brand `Skevia` with no seeded categories → `Product` shows `No products listed for this brand yet`.

## Assertions
- [ ] Reference id format `PE-REG-YYYYMMDD-NNNN-Portal` is shown in green after a valid submit.
- [ ] The new registration appears in `My Products`, the `Warranty` table and the Home count, and survives a reload.
- [ ] Lowercase serial is stored uppercased. The duplicate-serial messages match exactly.
- [ ] Warranty check never reveals another customer's details.
- [ ] No console errors in DevTools at any step, except the `console.error` logged for the deliberately rejected callables (TC-03, TC-04 invalid rows, TC-06).
- [ ] No failed network requests (no 4xx/5xx) except the expected callable errors in TC-03 / TC-04 / TC-06.

## Screenshots required
- `Register a Product` section on load
- Filled form before submit
- Success message (TC-01 step 8)
- `My Products` with the new card
- Each `Check a serial number` result in TC-04
- Each duplicate error in TC-03

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
