# T011-index-book-service: Book a Service (mobile search + 4-step request wizard)

| Field | Value |
|---|---|
| Route | `/index.html` |
| Source | `index.html` (inline module script, "BOOK A SERVICE" block, lines ~856-1056), `assets/pe.js` (wizard), `assets/pe-trust.js` (consent + dialog behaviour) |
| Flow | Fill and submit form "Book a Service" (`#book-form` inside `#book-overlay`) |
| Requires auth | no |
| Required role | anonymous |
| Destructive | no (creates `publicServiceRequests/<requestId>` + bumps `counters/publicservice-YYYYMM`) |
| Estimated steps | 65 |

## Preconditions
- App running at `http://localhost:8080`
- anonymous (no sign-in)
- Run only against the Firebase emulator or a dedicated test project — never the live makwell-websiteandcrm data.
- **Safe-run guard (mandatory):** `index.html` hardcodes `projectId: "makwell-websiteandcrm"` with no emulator hook, so a local server still writes to live Firestore and calls the live `publicLookup` function (asia-south1). Use one of these modes:
  - **Stub mode (preferred):** `installFirebaseStub(page, { data: SEED })` from `tests/e2e/support/firebase-stub.js`. The stubbed `httpsCallable` resolves `{ data: {} }`, so the mobile search returns "no products". Override `window.__STUB` / route the functions module to return `{ data: { registrations: [REG] } }` for TC-02.
  - **Emulator mode:** only with the page patched to `connectFirestoreEmulator` + `connectFunctionsEmulator`. Serve the site on a port other than 8080, which the Firestore emulator uses.
  - Abort rule: any request to `firestore.googleapis.com` or `*.cloudfunctions.net` means STOP and fail as "unsafe environment".
- Seed for TC-02 (lookup result `REG`): `{ registrationId: "PE-REG-20260915-0001-CustomerSite", product: "MakWell Geyser — QA-AUTO-MW-GSR-25L", brand: "MakWell", category: "Geyser", modelNo: "QA-AUTO-MW-GSR-25L", serialNumber: "QA-AUTO-SN-0001", purchaseDate: "2026-09-15" }` for phone `9000000001`. In emulator mode, create it by running T010 TC-01 first.

## Test data
- `searchMobile = "9000000003"` (no registered product)
- `requestType = "Repair / service"` (value `service`)
- `brand = "MakWell"`
- `category = "LED TV"`
- `issue = "No Picture no sound"`
- `modelNo = "QA-AUTO-LED-32"`
- `serialNumber = "QA-AUTO-SN-0003"`
- `purchaseDate = "2026-08-01"`
- `dealerName = "QA-AUTO Dealer Raichur"`
- `name = "QA-AUTO Customer Three"`
- `mobile = "9000000003"`
- `address = "QA-AUTO 3rd Cross, Gandhi Chowk"`
- `city = "Raichur"`
- `state = "Karnataka"`
- `pincode = "584101"`
- `consent = checked`
- Installation path: `requestType = "Installation / Demo"`, `category = "Washing Machine"`, `mobile = "9000000004"`, `name = "QA-AUTO Customer Four"`
- Geyser fallback path: `requestType = "Repair / service"`, `category = "Geyser"`, `issueText = "QA-AUTO geyser not heating, MCB trips after 10 minutes"`
- Invalid values:
  - `shortMobile = "90000"`
  - `badPrefixMobile = "5000000001"`
  - `badPincode = "58410"` (5 digits)
  - `alphaPincode = "58A101"`
  - `tooLongName = 101 × "a"`
  - `tooLongAddress = 301 × "a"`
  - `tooLongIssue = 1001 × "a"`
  - `emptyRequired = ""`

## Steps

### TC-01: Happy path — Book a TV repair without a registered product
1. Navigate to `/index.html`. Dismiss the cookie banner with **Reject optional** if it is shown.
2. In the `#help` section, click the **Book a service** card ("Repair or installation. We route it to a technician near you.").
3. Assert: `#book-overlay` is shown on the search step. Heading "Book a Service", sub-text "Search by your mobile number to find a registered product, or continue without one.", a **Mobile No** input, a **Search** button and a **Continue without a registered product →** button are visible. `#book-step-form` is hidden.
4. Fill **Mobile No** = `9000000003`. Click **Search**.
5. Assert: the button shows "Searching…", then returns to "Search". `#book-search-results` reads "No registered products found for this number — you can continue without one."
6. Click **Continue without a registered product →**.
7. Assert: the search step hides and the "Service Details" heading with "Fill in the rest and we'll route your request." is shown. The wizard progress shows "Need", "Problem", "You", "Confirm", with "Need" current.
8. Select **What do you need?** = `Repair / service`, **Brand** = `MakWell` and **Product** = `LED TV`. Click **Continue**.
9. Assert: step "Problem" is current. The **What's the issue?** select is visible with exactly these options: "No power", "No Picture no sound", "No Sound Only Picture", "No Picture Only Sound", "Sound Problem", "Display Problem". The **Describe the issue** textarea is hidden.
10. Select **What's the issue?** = `No Picture no sound`. Fill **Model number** = `QA-AUTO-LED-32`, **Serial number** = `QA-AUTO-SN-0003`, **Date of purchase** = `2026-08-01` and **Bought from (dealer)** = `QA-AUTO Dealer Raichur`. Assert: the **Invoice copy** input is disabled. Click **Continue**.
11. Assert: step "You" is current, and **Mobile number** is prefilled with `9000000003` (carried over from the search).
12. Fill **Name** = `QA-AUTO Customer Three`, **Address** = `QA-AUTO 3rd Cross, Gandhi Chowk`, **City** = `Raichur`, **State** = `Karnataka` and **Pincode** = `584101`. Click **Continue**.
13. Assert: step "Confirm" shows "Check your details. We route the request to the nearest service center; they will confirm the visit time with you." The summary lists Request "Repair / service", Brand "MakWell", Product "LED TV", Issue "No Picture no sound", Model "QA-AUTO-LED-32", Name "QA-AUTO Customer Three", Mobile "9000000003", City "Raichur" and Pincode "584101".
14. Assert: `#book-consent` is visible and not ticked. Tick it. Click **Submit request**.
15. Assert: the button shows "Submitting…", then "Submitted". `#book-success` reads "Request submitted.".
16. Assert: `#book-ticket-note` reads "Your reference number: **PE-SVC-<YYYYMMDD>-<NNNN>-CustomerSite** — save this to track your request." Record it as `SVC_ID` for T013.
17. Assert: the form is reset, and the issue rows are hidden again.
18. Wait 3 s. Assert: the button reads "Submit request" and is enabled.
19. Verify the write:
    - **Stub mode:** `window.__stubWrites` has `["set", "publicServiceRequests/<SVC_ID>", {...}]` with `requestId = SVC_ID`, `customerName "QA-AUTO Customer Three"`, `customerPhone "9000000003"`, `brand "MakWell"`, `category "LED TV"`, `requestType "service"`, `issueDescription "No Picture no sound"`, `modelNo "QA-AUTO-LED-32"`, `pincode "584101"`, `linkedRegistrationId null`, `status "new"` and `source "public-site"`.
    - **Emulator mode:** the doc ID equals `requestId`, and `counters/publicservice-<YYYYMM>` is incremented by 1.

### TC-02: Happy path — Book against a registered product found by mobile search
1. Configure the lookup to return `REG` for `9000000001`. Open **Book a service**.
2. Fill **Mobile No** = `9000000001`. Click **Search**.
3. Assert: one `.search-result-card` shows the bold text "MakWell Geyser — QA-AUTO-MW-GSR-25L" and the line "Model QA-AUTO-MW-GSR-25L · Purchased 2026-09-15".
4. Click the card. Assert: the form step opens with **Brand** = MakWell, **Product** = Geyser, **Model number** = `QA-AUTO-MW-GSR-25L`, **Serial number** = `QA-AUTO-SN-0001`, **Date of purchase** = `2026-09-15` and **Mobile number** = `9000000001`. **Name** and **Address** are empty (the lookup deliberately omits them).
5. Select **What do you need?** = `Repair / service`. Click **Continue**. Assert: the **Describe the issue** textarea is shown (Geyser has no preset list) and the issue select is hidden.
6. Fill **Describe the issue** = `QA-AUTO geyser not heating, MCB trips after 10 minutes` and **Bought from (dealer)** = `QA-AUTO Dealer Raichur`. Continue.
7. Fill **Name** = `QA-AUTO Customer One`, **Address** = `QA-AUTO 1st Cross, Station Road`, **City** = `Raichur`, **State** = `Karnataka`, **Pincode** = `584101`. Continue, tick consent, then **Submit request**.
8. Assert: "Request submitted." and a `PE-SVC-…-CustomerSite` reference are shown. The write has `linkedRegistrationId "PE-REG-20260915-0001-CustomerSite"` and `issueDescription` equal to the typed text.

### TC-03: Happy path — Installation / Demo request
1. Open **Book a service** and click **Continue without a registered product →**.
2. Select `Installation / Demo`, `MakWell` and `Washing Machine`. Continue.
3. Assert: both the issue select and the **Describe the issue** textarea are hidden (issue rows show only for `service`).
4. Complete the Problem and You steps (use `mobile = 9000000004`, `name = "QA-AUTO Customer Four"`), then submit with consent.
5. Assert: "Request submitted.". The write has `requestType "installation"` and `issueDescription ""`.
6. Switching check: on a fresh form, choose `Repair / service` + `Washing Machine`. Assert: the issue options are "No Power", "Washing problem", "Dryer problem", "Switches/buttons Problem", "Drain Problem". Change the request type to `Installation / Demo`. Assert: the issue rows hide.

### TC-04: Form validation — `book-form` and the search step
Start each row from a fresh form via **Continue without a registered product →**, with all other fields at TC-01 values.

| Field (step) | Empty value error | Pattern violation | Max-length overflow |
|---|---|---|---|
| Mobile No (search step) | **Search** with an empty field shows `#book-search-error` "Enter a valid 10-digit mobile number to search." and no lookup call | `90000` / `5000000001` give the same message | `maxlength=10` truncates at 10 characters |
| What do you need? (Need) | Native "Please select an item in the list."; **Continue** does not advance | n/a | n/a |
| Brand (Need) | Native "Please select an item in the list." | n/a | n/a |
| Product (Need) | Native "Please select an item in the list." | n/a | n/a |
| Describe the issue (Problem, fallback) | Optional, so the step advances | n/a | `maxlength=1000`: pasting 1001 × "a" keeps 1000 characters |
| Model number (Problem) | Native "Please fill out this field." | n/a | n/a |
| Date of purchase (Problem) | Native "Please fill out this field." | n/a | n/a |
| Bought from (dealer) (Problem) | Native "Please fill out this field." | n/a | n/a |
| Name (You) | Native "Please fill out this field." | n/a | `maxlength=100`: typing 101 × "a" keeps 100 characters |
| Mobile number (You) | Native "Please fill out this field." | On submit, `#book-phone-error` shows "Enter a valid 10-digit mobile number." and focus moves to `#book-phone`, for `90000` and `5000000001` | `maxlength=10` |
| Address (You) | Native "Please fill out this field." | n/a | `maxlength=300`: typing 301 × "a" keeps 300 characters |
| City (You) | Native "Please fill out this field." | n/a | n/a |
| State (You) | Native "Please fill out this field." | n/a | n/a |
| Pincode (You) | Native "Please fill out this field." | `58410` / `58A101` give the native pattern message including the title "6-digit pincode"; **Continue** does not advance | `maxlength=6` |
| Consent `#book-consent` (Confirm) | "Please tick the box to agree to the Privacy Policy before submitting." and `aria-invalid="true"`; no write | n/a | n/a |

Additional assertions:
1. Phone sanitizer on both `#book-search-phone` and `#book-phone`: typing `abc9000000003` leaves `9000000003`.
2. `+91 9000000003` is too long for `maxlength=10`. Type `+919000000` and assert the phone error appears on submit. Record that `+91` input cannot fit the 10-character limit.
3. For every blocked case: no `publicServiceRequests` write and no counter bump.

### TC-05: Modal coverage — `book-overlay`
1. Open from the card. Assert: `role="dialog"`, `aria-modal="true"` and focus lands on **Mobile No** (`#book-search-phone`).
2. Click **×** (`#book-close`). Assert: closed, with no write.
3. Reopen after reaching step "You" in a previous attempt. Assert: the search step is shown again, the search phone is empty, the results are cleared, and the form has been reset to step "Need".
4. Press **Escape** while on the form step. Assert: the dialog closes.
5. Click outside the dialog on the overlay. Assert: the dialog closes.
6. Navigate to `/index.html#book-service`. Assert: the dialog opens on the search step.
7. Invalid then valid input: covered by TC-04 then TC-01.

### TC-06: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| **Book a service** card | click | `#book-overlay` opens on the search step |
| **Search** `#book-search-btn` | click with a valid mobile | "Searching…", then the result list or the no-products message |
| **Continue without a registered product →** | click | form step shown, and Mobile number is prefilled from the search field if it was filled |
| search result card | click | form step prefilled from the registration |
| **Continue** / **Back** (wizard) | click | moves forward only when the step is valid; Back keeps values |
| **×** `#book-close` | click | dialog closes |
| **Submit request** | click on Confirm with consent | "Submitting…", then "Submitted", then "Submit request" after 3 s |

### TC-07: Negative & edge cases
- Lookup rate limit (stub: make `publicLookup` reject `{ code: "functions/resource-exhausted" }`). Click **Search**. Assert: a red message reads "Too many lookups from this device. Please try again in an hour.".
- Lookup generic failure (reject with `{ code: "functions/internal" }`). Assert: "Search failed — please try again.".
- Lookup invalid-argument (reject `{ code: "functions/invalid-argument", message: "QA-AUTO bad phone" }`). Assert: the message "QA-AUTO bad phone" is shown.
- Write failure (stub `setDoc` rejects / emulator rules denial). Assert: `#book-error` "Could not submit this request. Please try again." is shown, the button is re-enabled as "Submit request" and the fields are kept.
- XSS in lookup result: return `REG.product = "<img src=x onerror=window.__xss=1>"`. Assert: the text is rendered literally, and `window.__xss` is undefined.
- Prefill with a category not in the dropdown (`REG.category = "Air Cooler"`). Assert: **Product** shows "Select…" and **Continue** is blocked on Product (no silent bad value).
- Double submit: double-click **Submit request**. Assert: exactly one `publicServiceRequests` write.

## Assertions
- [ ] Search step error "Enter a valid 10-digit mobile number to search.".
- [ ] No-result text "No registered products found for this number — you can continue without one.".
- [ ] Issue list for LED TV (6 items) and Washing Machine (5 items); free text for other categories; hidden for installation.
- [ ] Pincode pattern `[0-9]{6}` enforced; Name ≤ 100, Address ≤ 300, Issue ≤ 1000.
- [ ] Phone error "Enter a valid 10-digit mobile number.".
- [ ] Consent error "Please tick the box to agree to the Privacy Policy before submitting.".
- [ ] Success "Request submitted." + `PE-SVC-YYYYMMDD-NNNN-CustomerSite`, doc ID = requestId, `status: "new"`, `source: "public-site"`.
- [ ] No console errors in DevTools at any step (the TC-07 failure cases log the expected `console.error`).
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected.
- [ ] Zero requests to live Firebase hosts.

## Screenshots required
- Page initial load
- Book dialog on the search step; search result card (TC-02)
- Each wizard step ("Need", "Problem" with issue list, "You", "Confirm")
- Each validation error state (search phone error, pincode pattern bubble, phone error, consent error)
- Final success state with the PE-SVC reference

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
