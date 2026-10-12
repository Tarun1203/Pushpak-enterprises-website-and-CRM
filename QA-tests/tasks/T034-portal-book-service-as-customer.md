# T034-portal-book-service-as-customer: Book a service, validate the booking form, track it under My Services

| Field | Value |
|---|---|
| Route | `/portal.html` (section `Book a Service`, then `My Services` / `Home`) |
| Source | `portal.html` (`#bk-form`, `syncBookProduct`, `loadAll` → `list-services`), `functions/index.js` (`bookService`, `trackOnPublicRequest`), `functions/customer.js` (`validateBooking`, `contactFields`) |
| Flow | Fill and submit form `bk-form` (registered product and unregistered product), plus form validation for `bk-form` |
| Requires auth | yes |
| Required role | customer |
| Destructive | no |
| Estimated steps | 40 |

## Preconditions
- App running at `http://localhost:8080`.
- Run only against the Firebase emulator or a dedicated test project. Never run against the live makwell-websiteandcrm data. This task WRITES `publicServiceRequests`, `customerTracking` (via trigger), `counters`, `lookupLimits` and `users/{uid}.contact`. `portal.html` hard-codes the `makwell-websiteandcrm` config. Before submitting, confirm in DevTools → Network that `bookService` / Firestore calls go to the emulators (`localhost:5001`, Firestore emulator) or to the dedicated test project. Otherwise STOP and mark BLOCKED.
- Sign in as `customer`. The runner resolves `QA_CRED_CUSTOMER_USERNAME` / `QA_CRED_CUSTOMER_PASSWORD` on `/portal.html` → `Email & password`. The account is phone-verified with `+91 9000000001` (Auth-emulator / test-project test number; the OTP comes from the emulator or the fixed test OTP).
- Seed data (emulator): a registration owned by this customer: `productRegistrations/qa-reg-seed` = `{ registrationId: "PE-REG-20261001-0001-Portal", customerPhone: "9000000001", brand: "MakWell", category: "QA-AUTO Geyser", product: "MakWell QA-AUTO Geyser — QA-MW-GZ-15L", modelNo: "QA-MW-GZ-15L", serialNumber: "QA-AUTO-SEED-0001", purchaseDate: "2026-09-01", warrantyMonths: 24, createdAt: <now> }`.
- The Firestore trigger `trackOnPublicRequest` must be running in the Functions emulator for `View progress` to show a timeline.
- Rate limit: 6 successful-validation `bookService` calls per phone per IST day. This task makes 2. Validation failures do not count.
- The consent box `pb-consent` is not read by the page script (form is `novalidate`). See TC-04.

## Test data
- Booking A (registered product, repair):
  - `What do you need? = "Repair / service"`
  - `Product = "MakWell QA-AUTO Geyser — QA-MW-GZ-15L (QA-AUTO-SEED-0001)"`
  - `Describe the problem = "QA-AUTO geyser not heating; tripping MCB after 2 minutes."`
  - `Name = "QA-AUTO Customer"`, `Address = "QA-AUTO 1-2-3, Station Road"`, `City = "Raichur"`, `State = "Karnataka"`, `Pincode = "584101"`
  - consent `pb-consent` = checked
- Booking B (unregistered product, installation):
  - `What do you need? = "Installation / demo"`
  - `Product = "Another product (not registered)"`
  - `Brand = "Flyvision"`, `Product (e.g. Geyser) = "QA-AUTO Wall Mount"`, `Model (if known) = "QA-FV-WM-43"`, `Serial (if known) = "qa-auto-{runId}-bk"` (`{runId}` uppercase alphanumeric)
  - contact as Booking A, consent checked
- Invalid values: `emptyRequired = ""`, `whitespace = "   "`, `badSerial = "QA AUTO 1"`, `badPin = "58410"`, `badPinZero = "084101"`, `tooLongIssue = 1001 × "a"`

## Steps

### TC-01: Happy path — Book a repair for a registered product
1. Navigate to `/portal.html`. Sign in as customer. On Home, note `Open service requests = O` and `All service requests = A`.
2. Click Home **`Book a service`**. Assert: heading `Book a Service`, sub-text `We route your request to the nearest authorised service center. You can follow it under My Services.`
3. Assert: `Product` select lists `MakWell QA-AUTO Geyser — QA-MW-GZ-15L (QA-AUTO-SEED-0001)` and, last, `Another product (not registered)`. Assert that the Brand / `Product (e.g. Geyser)` / `Model (if known)` / `Serial (if known)` block is hidden while a registered product is selected.
4. Fill Booking A: select `What do you need? = Repair / service` and the seeded product, then fill `Describe the problem`. Under `Where should we visit?`, clear the prefilled values and fill `Name`, `Address`, `City`, `State` and `Pincode`. Check the consent box.
5. Click **`Submit request`**. Assert: the button is disabled during the request.
6. Assert: `#b-msg` is green and matches `^Request submitted\. Your request number is PE-SVC-\d{8}-\d{4}-Portal\.$`. Record it as `svcA`.
7. Assert: `Describe the problem` is cleared and the contact fields keep their values.
8. Click nav **`Home`**. Assert: `Open service requests = O + 1` and `All service requests = A + 1`.
9. Click nav **`My Services`**. Assert: the newest card has heading `QA-AUTO Geyser — svcA` and rows `Type Service request`, `Status Request received`, `Warranty Not yet determined`, and `Raised <today>`.
10. Click **`View progress`** on that card. Assert: the button text becomes `Hide progress` and a timeline (or the notice `Detailed progress will appear here as soon as your request is picked up. Current status: Request received.`) is shown. If the trigger has run, the timeline's last entry is `Request received`. Click **`Hide progress`** and assert that it collapses.
11. Reload the page. Assert: `svcA` is still listed in `My Services`.
12. Assert (emulator): `publicServiceRequests/svcA` has `customerPhone: "9000000001"`, `linkedRegistrationId: "PE-REG-20261001-0001-Portal"`, `serialNumber: "QA-AUTO-SEED-0001"`, `requestType: "service"`, `status: "new"`, `source: "portal"`, `pincode: "584101"`.

### TC-02: Happy path — Book an installation for an unregistered product
1. Nav **`Book a Service`**. Select `What do you need? = Installation / demo`. Assert: `Describe the problem` is hidden.
2. Select `Product = Another product (not registered)`. Assert: the `Brand`, `Product (e.g. Geyser)`, `Model (if known)` and `Serial (if known)` fields are visible.
3. Fill Booking B and check the consent box. Click **`Submit request`**.
4. Assert: green `Request submitted. Your request number is PE-SVC-…-Portal.` Record it as `svcB`.
5. Nav **`My Services`**. Assert: the card `QA-AUTO Wall Mount — svcB` shows `Type Installation / Demo` and `Status Request received`.
6. Assert (emulator): `publicServiceRequests/svcB` has `brand: "Flyvision"`, `serialNumber: "QA-AUTO-{runId}-BK"` (uppercased), `requestType: "installation"`, `issueDescription: ""`, `linkedRegistrationId: null`.

### TC-03: Form validation — `bk-form`
Start from the valid Booking A or B values. Change one field per row, click **`Submit request`**, and assert the red `#b-msg`. Assert that `All service requests` on Home is unchanged after the table.

| Field | Empty value error | Pattern violation | Max-length overflow |
|---|---|---|---|
| `Describe the problem` (type `Repair / service`) | `""` or `"   "` → `Describe the problem.` | n/a | 1001 chars typed → textarea holds 1000 |
| `Brand` (product `Another product (not registered)`) | `Select…` → `Choose a brand, or pick one of your registered products.` | n/a | n/a |
| `Product (e.g. Geyser)` (unregistered) | `""` → `Choose a product category.` | n/a | 61 chars → input holds 60 |
| `Model (if known)` | optional | n/a | 61 chars → input holds 60 |
| `Serial (if known)` | optional | `QA AUTO 1` → `That serial number does not look right.` | 41 chars → input holds 40 |
| `Name` | `""` → `Enter your name.` | n/a | 101 chars → input holds 100 |
| `Address` | `""` → `Enter your address.` | n/a | 301 chars → input holds 300 |
| `City` | `""` → `Enter your city.` | n/a | 61 chars → input holds 60 |
| `State` | optional | n/a | 61 chars → input holds 60 |
| `Pincode` | `""` → `Enter a valid 6-digit pincode.` | `58410`, `084101` → `Enter a valid 6-digit pincode.` | `5841011` typed → input holds `584101` |

### TC-04: Privacy consent is required
1. Fill valid Booking A, but **uncheck** the consent box (`pb-consent`). Click **`Submit request`**.
2. Assert: submission is blocked. There is a visible consent error, no `bookService` request appears in the Network tab, no `Request submitted…` message shows, and the Home counts are unchanged.
3. Source note: the `#bk-form` submit handler never reads `pb-consent`, and `validateBooking` has no consent check. The current build is expected to FAIL here by creating a request. If it does, log a defect (consent not enforced) and record the `PE-SVC-…` id for cleanup. This uses 1 of the 6 daily bookings.

### TC-05: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| `What do you need?` → `Installation / demo` | change | `Describe the problem` hidden |
| `What do you need?` → `Repair / service` | change | `Describe the problem` visible |
| `Product` → `Another product (not registered)` | change | brand/product/model/serial block visible |
| `Product` → registered product | change | brand/product/model/serial block hidden |
| `Submit request` | click | disabled during the call, then re-enabled |
| `View progress` / `Hide progress` | click | toggles the timeline for that card only |

### TC-06: Negative & edge cases
- Tampered registration: in DevTools, change the value of the seeded `Product` option to `PE-REG-20260101-0001-Portal` (another customer's), then submit valid Booking A → `#b-msg`: `That product is not registered to your account.` No request is created.
- Go offline, submit valid data → `#b-msg`: `Could not submit this request. Please try again.`
- Customer with no registrations: `Product` contains only `Another product (not registered)` and the brand block is visible on load.

## Assertions
- [ ] Request number format `PE-SVC-YYYYMMDD-NNNN-Portal` is shown in green after each valid booking.
- [ ] New requests appear in `My Services` with status `Request received` and the correct type, and they survive a reload.
- [ ] Home `Open` and `All` counts increase by 1 per booking.
- [ ] Every validation message in TC-03 matches exactly; invalid rows create no request.
- [ ] Consent checkbox blocks submission (TC-04), or the defect is logged.
- [ ] No console errors other than the `console.error` logged for deliberately rejected callables.
- [ ] No failed network requests other than the expected `bookService` errors in TC-03 / TC-04 / TC-06.

## Screenshots required
- `Book a Service` initial state
- Filled Booking A before submit, and the success message
- Booking B with the unregistered-product block visible, and the success message
- Each validation error in TC-03
- `My Services` with both new cards and an expanded `View progress`

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
