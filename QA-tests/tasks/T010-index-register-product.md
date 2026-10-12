# T010-index-register-product: Register a Product (warranty registration wizard)

| Field | Value |
|---|---|
| Route | `/index.html` |
| Source | `index.html` (inline module script, "REGISTER A PRODUCT" block, lines ~628-854), `assets/pe.js` (wizard), `assets/pe-trust.js` (consent + dialog behaviour) |
| Flow | Fill and submit form "Register a Product" (`#register-form` inside `#register-overlay`) |
| Requires auth | no |
| Required role | anonymous |
| Destructive | no (creates a `productRegistrations` document + bumps `counters/productreg-YYYYMM`) |
| Estimated steps | 60 |

## Preconditions
- App running at `http://localhost:8080`
- anonymous (no sign-in; do not open `/portal.html` or `/crm/login.html` first)
- Run only against the Firebase emulator or a dedicated test project — never the live makwell-websiteandcrm data.
- **Safe-run guard (mandatory):** `index.html` hardcodes `projectId: "makwell-websiteandcrm"` and never calls `connectFirestoreEmulator`, so serving the page locally STILL talks to live Firestore. The runner MUST do one of:
  - **Stub mode (preferred):** call `installFirebaseStub(page, { data: SEED })` from `tests/e2e/support/firebase-stub.js` before navigation. Writes are captured in `window.__stubWrites` and nothing leaves the browser.
  - **Emulator mode:** only if the page has been locally patched to call `connectFirestoreEmulator` / `connectFunctionsEmulator`. Note `firebase.json` binds the Firestore emulator to port **8080**, which is the same as the dev URL. Serve the site on a different port in this mode.
  - Abort rule: if any request to `firestore.googleapis.com` or `*.cloudfunctions.net` is observed at any step, STOP and fail the task as "unsafe environment".
- Seed data (`SEED`, stub `data` or emulator documents):
  - `productCategories`: `{ id: "qa-cat-geyser", brandId: "makwell", name: "Geyser", status: "active" }`, `{ id: "qa-cat-ledtv", brandId: "makwell", name: "LED TV", status: "active" }`, `{ id: "qa-cat-old", brandId: "makwell", name: "QA-AUTO Retired", status: "inactive" }`
  - `products`: `{ id: "qa-prod-geyser", brandId: "makwell", categoryId: "qa-cat-geyser", name: "QA-AUTO Geyser 25L" }` (no product for `qa-cat-ledtv`, so LED TV exercises the free-text fallback)
  - `productModels`: `{ id: "qa-model-1", productId: "qa-prod-geyser", modelNumber: "QA-AUTO-MW-GSR-25L" }`
  - No `productCategories` for `brandId: "flyvision"` (exercises the empty-category message)
  - `warrantyPlans`: none (registration falls back to `warrantyMonths: 12`, `warrantyPlanId: null`)

## Test data
- `brand = "MakWell"`
- `category = "Geyser"` (option value `qa-cat-geyser`)
- `model = "QA-AUTO-MW-GSR-25L"`
- `serialNumber = "QA-AUTO-SN-0001"`
- `purchaseDate = "2026-09-15"`
- `dealerName = "QA-AUTO Dealer Raichur"`
- `name = "QA-AUTO Customer One"`
- `mobile = "9000000001"`
- `address = "QA-AUTO 1st Cross, Station Road"`
- `city = "Raichur"`
- `state = "Karnataka"`
- `pincode = "584101"`
- `consent = checked`
- LED TV fallback path: `category = "LED TV"`, `modelText = "QA-AUTO-LED-32"`, `installationRequired = checked`, `mobile = "9000000002"`, `name = "QA-AUTO Customer Two"`
- Invalid values:
  - `shortMobile = "90000"`
  - `badPrefixMobile = "5000000001"` (must start 6-9)
  - `lettersMobile = "abcdefghij"` (stripped by the sanitizer)
  - `spacedMobile = "90000 0000"` (10 chars incl. space = 9 digits, invalid)
  - `emptyRequired = ""`

## Steps

### TC-01: Happy path — Register a MakWell geyser with a listed model
1. Navigate to `/index.html`. If the cookie banner "Your privacy choices" is shown, click **Reject optional**.
2. Scroll to the `#help` section. Assert: heading "How can we help?" is visible.
3. Click the **Register product** service card ("Five quick steps to activate your warranty.").
4. Assert: `#register-overlay` has class `show`. The dialog heading is "Register a Product" and the sub-text is "Activate your warranty by registering your purchase."
5. Assert: the progress bar shows 4 steps "Product", "Purchase", "You", "Confirm", with "Product" current. **Back** is hidden, **Continue** is visible, and **Register product** and the consent checkbox are hidden.
6. Assert: the **Product** select shows "Select brand first…" and the **Model** select shows "Select brand and category first…".
7. Select **Brand** = `MakWell`. Assert: **Product** options become "Select…", "Geyser", "LED TV" (alphabetical; "QA-AUTO Retired" is NOT listed).
8. Select **Product** = `Geyser`. Assert: **Model** options are "Select…", "QA-AUTO-MW-GSR-25L", "Not listed — type it in". The "Type your model number" input stays hidden, and the "Installation / demo required for this product" row stays hidden.
9. Select **Model** = `QA-AUTO-MW-GSR-25L`. Fill **Serial number** = `QA-AUTO-SN-0001`.
10. Click **Continue**. Assert: step "Purchase" is current and **Back** is visible.
11. Fill **Date of purchase** = `2026-09-15` and **Bought from (dealer)** = `QA-AUTO Dealer Raichur`. Assert: the **Invoice copy** file input is disabled.
12. Click **Continue**. Assert: step "You" is current.
13. Fill **Name** = `QA-AUTO Customer One`, **Mobile number** = `9000000001`, **Address** = `QA-AUTO 1st Cross, Station Road`, **City** = `Raichur`, **State** = `Karnataka`, **Pincode** = `584101`.
14. Click **Continue**. Assert: step "Confirm" is current and the text "Check your details, then register. Your warranty starts from the purchase date." is shown.
15. Assert: the summary lists Brand "MakWell", Product "Geyser", Model "QA-AUTO-MW-GSR-25L", Serial "QA-AUTO-SN-0001", Purchased "2026-09-15", Dealer "QA-AUTO Dealer Raichur", Name "QA-AUTO Customer One", Mobile "9000000001", City "Raichur" and Pincode "584101".
16. Assert: the consent checkbox `#reg-consent` is visible and NOT pre-ticked, and the **Register product** button is visible. Tick the consent checkbox.
17. Click **Register product**.
18. Assert: the button briefly reads "Registering…", then "Registered".
19. Assert: `#register-success` is visible with text "Product registered successfully.".
20. Assert: `#register-ticket-note` reads "Your reference number: **PE-REG-<YYYYMMDD>-<NNNN>-CustomerSite** — save this for warranty follow-up.". `<YYYYMMDD>` is today's date and `<NNNN>` is 4 digits. Record this ID as `REG_ID` for T013.
21. Assert: all form fields are reset (empty/first option) and the consent box is unticked.
22. Wait 3 s. Assert: the button reads "Register product" again and is enabled.
23. Verify the write:
    - **Stub mode:** `window.__stubWrites` contains `["add", "productRegistrations", {...}]` with `registrationId = REG_ID`, `customerName "QA-AUTO Customer One"`, `customerPhone "9000000001"`, `brand "MakWell"`, `category "Geyser"`, `categoryId "qa-cat-geyser"`, `modelNo "QA-AUTO-MW-GSR-25L"`, `product "MakWell Geyser — QA-AUTO-MW-GSR-25L"`, `purchaseDate "2026-09-15"`, `installationRequired false`, `warrantyMonths 12`, `warrantyPlanId null`, `status "active"` and `source "public-site"`.
    - **Emulator mode:** the same document exists in `productRegistrations`, and `counters/productreg-<YYYYMM>.value` has increased by 1.

### TC-02: Happy path — LED TV with no listed models (free-text model + installation flag)
1. Close and reopen **Register product**. Assert: the wizard restarts on step "Product" and all fields are empty.
2. Select **Brand** = `MakWell`, then **Product** = `LED TV`.
3. Assert: the **Model** select shows "— No models listed yet, type it in below —", and the "Type your model number" input is visible and required.
4. Click **Continue** with the model text empty. Assert: the browser blocks the step on "Type your model number" (native "Please fill out this field." in Chromium) and step "Product" stays current.
5. Fill **Type your model number** = `QA-AUTO-LED-32`. Click **Continue**.
6. Assert: the "Installation / demo required for this product" checkbox row is visible on step "Purchase". Tick it.
7. Fill Purchase and You steps with the TC-01 values, but use `name = "QA-AUTO Customer Two"` and `mobile = "9000000002"`. Click **Continue** to reach "Confirm", tick consent and click **Register product**.
8. Assert: "Product registered successfully." and a new `PE-REG-…-CustomerSite` reference are shown.
9. Verify the write has `modelNo "QA-AUTO-LED-32"`, `category "LED TV"`, `installationRequired true` and `product "MakWell LED TV — QA-AUTO-LED-32"`.

### TC-03: "Not listed — type it in" path
1. Reopen the modal. Select `MakWell`, then `Geyser`, then **Model** = `Not listed — type it in`.
2. Assert: the "Type your model number" input appears and is required.
3. Switch **Model** back to `QA-AUTO-MW-GSR-25L`. Assert: the text input hides and is no longer required.

### TC-04: Form validation — `register-form`
The wizard checks the current step's visible fields on **Continue** with native constraint validation (`reportValidity`). Submit-time checks are the JS phone check and the consent guard. For each row, start from a fresh modal with every other field holding its TC-01 value.

| Field (step) | Empty value error | Pattern violation | Max-length overflow |
|---|---|---|---|
| Brand (Product) | Native "Please select an item in the list." on `#register-brand`; **Continue** does not advance | n/a | n/a |
| Product (Product) | Native "Please select an item in the list." on `#register-category` | n/a | n/a |
| Model (Product) | Native "Please select an item in the list." on `#register-model-select` | n/a | n/a |
| Serial number (Product) | Optional, so the step advances | n/a | n/a |
| Date of purchase (Purchase) | Native "Please fill out this field." | n/a | n/a |
| Bought from (dealer) (Purchase) | Native "Please fill out this field." | n/a | n/a |
| Name (You) | Native "Please fill out this field." | n/a | n/a |
| Mobile number (You) | Native "Please fill out this field." | On **Register product**, `#register-phone-error` shows "Enter a valid 10-digit mobile number." and focus moves to the Mobile number field, for `90000`, `5000000001` and `90000 0000` | `maxlength=10`: typing `90000000012` keeps `9000000001` |
| Address (You) | Native "Please fill out this field." | n/a | n/a |
| City (You) | Native "Please fill out this field." | n/a | n/a |
| State (You) | Native "Please fill out this field." | n/a | n/a |
| Pincode (You) | Native "Please fill out this field." | No pattern on this form: `12` is accepted. Record it as a finding: Book a Service enforces `[0-9]{6}`, this form does not | `maxlength=6`: typing `5841019` keeps `584101` |
| Consent `#reg-consent` (Confirm) | "Please tick the box to agree to the Privacy Policy before submitting." appears under the checkbox, which gets `aria-invalid="true"` and focus; no write occurs | n/a | n/a |

Additional validation assertions:
1. Mobile sanitizer: type `abcdefghij` into **Mobile number**. Assert: the field value is empty (letters stripped on input).
2. Mobile with spaces/dashes: type `90000-0000` (10 chars). On submit, assert the phone error shows, because only 9 digits remain after normalization.
3. After a phone error, correct to `9000000001` and submit. Assert: the phone error hides and success is shown.
4. Tick the consent box after the consent error. Assert: the consent error message is removed and `aria-invalid` is cleared.
5. For every blocked case: no new entry in `window.__stubWrites` (stub) / no new `productRegistrations` doc (emulator).

### TC-05: Modal coverage — `register-overlay`
1. Click the **Register product** card. Assert: the dialog has `role="dialog"`, `aria-modal="true"` and is labelled by "Register a Product". Within ~100 ms, focus is on **Brand** (`#register-brand`), not on the × button.
2. Press **Tab** repeatedly. Assert: focus cycles only within the dialog (focus trap).
3. Click **×** (`#register-close`, aria-label "Close"). Assert: the dialog closes, focus returns to the **Register product** card and no write occurs.
4. Reopen. Fill Brand + Product, then press **Escape**. Assert: the dialog closes.
5. Reopen. Assert: the fields are reset, and Product shows "Select brand first…".
6. Click the dark overlay outside the dialog box. Assert: the dialog closes.
7. Navigate to `/index.html#register-product`. Assert: the Register a Product dialog opens automatically.
8. Invalid then valid inside the modal: covered by TC-04 then TC-01.

### TC-06: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| **Register product** card (`data-modal="register"`) | click | `#register-overlay` opens on step "Product" |
| **Continue** | click with valid step | next step becomes current, and the progress `li` for the previous step gets class `done` |
| **Back** | click on step "Purchase" | returns to "Product", and entered values are preserved |
| **×** `#register-close` | click | dialog closes, no write |
| **Register product** (submit) | click on Confirm with consent | "Registering…", then "Registered", then "Register product" after 3 s |
| Privacy Policy link in the consent label | click | `privacy.html` opens in a new tab (`target="_blank"`, `rel="noopener"`) |

### TC-07: Negative & edge cases
- Brand with no categories: select **Brand** = `Flyvision`. Assert: **Product** shows the single option "No categories set up for this brand yet", and **Continue** is blocked on Product.
- Brand reset: select `MakWell`, then switch **Brand** back to `Select…`. Assert: Product shows "Select brand first…".
- Category load failure (stub: make `getDocs` throw for `productCategories`; emulator: stop the emulator after page load). Select `MakWell`. Assert: Product shows "Couldn't load categories" and the console has the warning "Could not load categories:".
- Model load failure (stub: make `getDocs` throw for `products`). Select MakWell + Geyser. Assert: Model shows "— Type your model below —", the text input is visible and required, and the console has the warning "Could not load models, falling back to free text:".
- Write failure (stub: make `addDoc` reject; emulator: rules denial). Submit valid data. Assert: `#register-error` shows "Could not register this product. Please try again.", the button is re-enabled with label "Register product" and the fields are NOT reset.
- Future purchase date `2027-01-01`: there is no `max` attribute, so the registration is accepted. Record as an observation (the warranty would start in the future).
- Double submit: double-click **Register product** quickly. Assert: exactly one `productRegistrations` write, because the button is disabled after the first click.
- Markup in model names (emulator/stub seed `productModels.modelNumber = "<b>QA-AUTO-X</b>"`): the Model `<option>` is built WITHOUT `escapeHtml` (index.html line ~709). Assert: the option text is the literal string `<b>QA-AUTO-X</b>`. If the markup is interpreted instead, raise a finding.
- Today's date via the counter: two consecutive registrations in emulator mode produce serials `NNNN` and `NNNN+1` for the same month.

## Assertions
- [ ] Register dialog opens from the card and from `#register-product`.
- [ ] Wizard shows 4 steps; submit + consent appear only on "Confirm".
- [ ] Category list is filtered by brand and excludes `status: "inactive"`.
- [ ] Model list comes from `products` + `productModels`; the free-text fallback appears when none exist.
- [ ] Installation row appears only for "LED TV" / "Washing Machine".
- [ ] Phone error text "Enter a valid 10-digit mobile number." for invalid numbers.
- [ ] Consent error text "Please tick the box to agree to the Privacy Policy before submitting.".
- [ ] Success "Product registered successfully." + reference `PE-REG-YYYYMMDD-NNNN-CustomerSite`.
- [ ] Exactly one `productRegistrations` write per successful submit with `source: "public-site"` and `status: "active"`.
- [ ] No console errors in DevTools at any step (the warnings listed in TC-07 are expected only in those cases).
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected.
- [ ] Zero requests to live Firebase hosts (`firestore.googleapis.com`, `*.cloudfunctions.net`).

## Screenshots required
- Page initial load (`#help` hub visible)
- Register dialog opened on step "Product"
- Step "Confirm" with summary
- Each validation error state (native bubble on Brand, phone error, consent error)
- LED TV free-text model + installation row
- Final success state with reference number

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
