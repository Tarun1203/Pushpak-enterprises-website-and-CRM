# T012-index-enquiry-modal: Generic enquiry modal (Help & FAQs / Manuals / Brochures / Talk to support)

| Field | Value |
|---|---|
| Route | `/index.html` |
| Source | `index.html` (`#service-modal-overlay`, inline script lines ~511-613, hash map lines ~1318-1339), `assets/pe-trust.js` (consent), `assets/locator.js` (`Send us an enquiry` → `PE_openEnquiry`) |
| Flow | Fill and submit form `#service-modal-form` (analysis label "Warranty Status" is only the static placeholder title — the real title is set from the card clicked) |
| Requires auth | no |
| Required role | anonymous |
| Destructive | no (creates `contactEnquiries` doc + best-effort `notifications` doc + bumps `counters/enquiry-YYYYMM`) |
| Estimated steps | 50 |

## Preconditions
- App running at `http://localhost:8080`
- anonymous (no sign-in)
- Run only against the Firebase emulator or a dedicated test project — never the live makwell-websiteandcrm data.
- **Safe-run guard (mandatory):** the page hardcodes `projectId: "makwell-websiteandcrm"` with no emulator hook. Use one of these modes:
  - **Stub mode (preferred):** `installFirebaseStub(page)` from `tests/e2e/support/firebase-stub.js`. Writes are recorded in `window.__stubWrites`.
  - **Emulator mode:** only with the page patched to `connectFirestoreEmulator`. Serve the site on a port other than 8080, which the Firestore emulator uses.
  - Abort rule: any request to `firestore.googleapis.com` means STOP and fail as "unsafe environment".
- No seed data required.

## Test data
- `name = "QA-AUTO Enquirer One"`
- `phone = "9000000005"`
- `brand = "MakWell"`
- `product = "QA-AUTO Geyser"`
- `modelNo = "QA-AUTO-MW-GSR-25L"`
- `serialNo = "QA-AUTO-SN-0005"`
- `dealerName = "QA-AUTO Dealer Raichur"`
- `address = "QA-AUTO 5th Cross, Station Road"`
- `city = "Raichur"`
- `pincode = "584101"`
- `message = "QA-AUTO please share the user manual for model QA-AUTO-MW-GSR-25L"`
- `consent = checked`
- Formatted phone: `phoneFormatted = "90000-00006"` (10 chars, but only 9 digits, so invalid) and `phoneSpaced = "9000 00000"` (invalid). `phoneValidDashed` cannot fit in `maxlength=10`, so only bare 10-digit numbers can succeed.
- Invalid values:
  - `shortPhone = "90000"`
  - `badPrefixPhone = "5000000001"`
  - `lettersPhone = "abcdefghij"`
  - `tooLongName = 101 × "a"` (no client maxlength; Firestore rule caps the name at 100)
  - `tooLongMessage = 2001 × "a"` (rule caps the message at 2000)
  - `pincodeOverflow = "5841019"`
  - `emptyRequired = ""`

## Steps

### TC-01: Happy path — Request a manual via the **Manuals** card
1. Navigate to `/index.html`. Dismiss the cookie banner with **Reject optional** if it is shown.
2. In `#help` → `.hub-more`, click the **Manuals** card ("Download the manual for your product model.").
3. Assert: `#service-modal-overlay` has class `show`, the heading `#service-modal-title` reads "Manuals", the sub-text reads "Fill in your details and we'll get back to you.", and focus is on the **Your name** input.
4. Fill **Your name** = `QA-AUTO Enquirer One`, **Phone number (10-digit mobile)** = `9000000005`, **Brand** = `MakWell`, **Product / category (optional)** = `QA-AUTO Geyser`, **Model No (optional)** = `QA-AUTO-MW-GSR-25L`, **Serial No (optional)** = `QA-AUTO-SN-0005`, **Purchased from — dealer name (optional)** = `QA-AUTO Dealer Raichur`, **Address (optional)** = `QA-AUTO 5th Cross, Station Road`, **City (optional)** = `Raichur`, **Pincode (optional)** = `584101` and **Details** = `QA-AUTO please share the user manual for model QA-AUTO-MW-GSR-25L`.
5. Tick the consent checkbox `#svc-consent`. Assert: it was not pre-ticked.
6. Click **Submit request**.
7. Assert: the button reads "Sending…" (disabled), then "Sent — thank you".
8. Assert: `#service-modal-ticket-note` reads "Your reference number: **PE-ENQ-<YYYYMMDD>-<NNNN>-CustomerSite** — save this for follow-up." Record it as `ENQ_ID`.
9. Assert: all form fields are reset and the consent box is unticked.
10. Wait 3 s. Assert: the button reads "Submit request" and is enabled.
11. Verify the writes:
    - **Stub mode:** `window.__stubWrites` contains `["add", "contactEnquiries", {...}]` with `ticketId = ENQ_ID`, `name "QA-AUTO Enquirer One"`, `phone "9000000005"`, `subject "Manuals Request"`, `brand "MakWell"`, `product "QA-AUTO Geyser"`, `modelNo "QA-AUTO-MW-GSR-25L"`, `serialNo "QA-AUTO-SN-0005"`, `dealerName "QA-AUTO Dealer Raichur"`, `address "QA-AUTO 5th Cross, Station Road"`, `city "Raichur"`, `pincode "584101"`, the full `message` and `source "landing-page-card"`. It also contains `["add", "notifications", {recipientType: "role", recipientValue: "superadmin", title: "New website enquiry", message: "QA-AUTO Enquirer One — Manuals Request (<ENQ_ID>)", read: false}]`.
    - **Emulator mode:** both docs exist, and `counters/enquiry-<YYYYMM>` is incremented by 1.

### TC-02: Category routing — each entry point sets title + subject
For each row: open the entry point, assert the title, then submit minimal valid data (`name`, `phone = 9000000005`, `message = "QA-AUTO routing check"`, consent) and assert the `subject` written.

| Entry point | Modal title | `subject` written |
|---|---|---|
| **Help & FAQs** card | "Help & FAQs" | "FAQ / Question" |
| **Manuals** card | "Manuals" | "Manuals Request" |
| **Brochures** card | "Brochures" | "Brochures Request" |
| **Talk to support** card | "Talk to support" | "General Support" |
| URL `/index.html#manuals` | "Manuals" | "Manuals Request" |
| URL `/index.html#brochures` | "Brochures" | "Brochures Request" |
| URL `/index.html#support` | "Support" | "General Support" |
| URL `/index.html#faq` | "FAQs" | "FAQ / Question" |
| Locator dialog → **Send us an enquiry** | "Find a service center" (the locator closes first) | "Service Center Enquiry" |

### TC-03: Form validation — `service-modal-form`
Start from a fresh **Talk to support** modal with every other field at TC-01 values.

| Field | Empty value error | Pattern violation | Max-length overflow |
|---|---|---|---|
| Your name | Native "Please fill out this field."; no write | n/a | No client limit. With 101 × "a", the client allows submit, the Firestore rule rejects it, and the button shows "Something went wrong — try again" and is re-enabled. Record as a finding: there is no client-side maxlength=100 to match the rule |
| Phone number (10-digit mobile) | Native "Please fill out this field." | `#service-modal-phone-error` shows "Enter a valid 10-digit mobile number (e.g. 9980000515)." and focus moves to the phone field, for `90000`, `5000000001`, `90000-0000` and `9000 00000` | `maxlength=10`: typing `90000000051` keeps `9000000005` |
| Brand | Optional; "Brand (optional)" submits `brand: ""` | n/a | n/a |
| Product / Model / Serial / Dealer / Address / City | Optional; empty submits `""` | n/a | n/a |
| Pincode (optional) | Optional | No pattern: `12AB` is accepted and written. Record as an observation | `maxlength=6`: `5841019` keeps `584101` |
| Details | Native "Please fill out this field." | n/a | No client limit. 2001 × "a" is rejected by the rule, and the button shows "Something went wrong — try again" |
| Consent `#svc-consent` | "Please tick the box to agree to the Privacy Policy before submitting." appears after the label, the checkbox gets `aria-invalid="true"` and focus; no write | n/a | n/a |

Additional assertions:
1. Phone sanitizer: typing `abcdefghij` leaves an empty field. Typing `98a76` leaves `9876`. Characters `+`, space and `-` are kept.
2. Phone error clears: after the error, enter `9000000005` and submit. Assert: the error loses class `show` and the submit succeeds.
3. Blocked submits produce no `contactEnquiries` write and no counter bump.

### TC-04: Modal coverage — `service-modal-overlay`
1. Open via **Help & FAQs**. Assert: `role="dialog"`, `aria-modal="true"`, labelled by the title "Help & FAQs", the × button has aria-label "Close", and focus is on **Your name**.
2. Type `QA-AUTO draft` into **Your name** and click **×** (`#service-modal-close`). Assert: the dialog closes, there is no write, and focus returns to the **Help & FAQs** card.
3. Reopen via **Brochures**. Assert: the title is "Brochures", **Your name** is empty (form reset on open), and any previous phone error and ticket note are cleared.
4. Press **Escape**. Assert: the dialog closes.
5. Reopen, then click the overlay backdrop. Assert: the dialog closes.
6. Press **Tab** through the dialog. Assert: focus stays inside it.
7. Invalid then valid input inside the modal: covered by TC-03 then TC-01.

### TC-05: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| **Help & FAQs** card | click | modal opens with title "Help & FAQs" |
| **Manuals** card | click | title "Manuals" |
| **Brochures** card | click | title "Brochures" |
| **Talk to support** card | click | title "Talk to support" |
| **×** `#service-modal-close` | click | modal closes, no write |
| **Submit request** | click with valid data | "Sending…", then "Sent — thank you", then "Submit request" after 3 s |
| Privacy Policy link (consent) | click | `privacy.html` opens in a new tab |

### TC-06: Negative & edge cases
- Counter transaction failure (stub: make `runTransaction` throw). Submit valid data. Assert: the button shows "Something went wrong — try again" and is enabled, the fields are NOT reset, there is no ticket note, and the console has the error "Service request submit failed:".
- Notification write failure (stub: make `addDoc` reject only for `notifications`). Assert: the enquiry still succeeds ("Sent — thank you" + reference), and the console has the warning "Notification write failed (non-blocking):".
- Double submit: double-click **Submit request**. Assert: exactly one `contactEnquiries` write.
- Second enquiry in the same month (emulator): `NNNN` increments by exactly 1 over `ENQ_ID`.
- XSS: `name = "QA-AUTO <img src=x onerror=window.__xss=1>"`. Assert: the submit stores the literal text, `window.__xss` is undefined, and the ticket note shows only the generated ID.

## Assertions
- [ ] Title follows the entry point (cards, hashes, locator enquiry).
- [ ] Phone error "Enter a valid 10-digit mobile number (e.g. 9980000515)." for invalid numbers.
- [ ] Consent error "Please tick the box to agree to the Privacy Policy before submitting.".
- [ ] Success: "Sent — thank you" + "Your reference number: PE-ENQ-YYYYMMDD-NNNN-CustomerSite — save this for follow-up.".
- [ ] `contactEnquiries` doc has the correct `subject` and `source: "landing-page-card"`; superadmin notification written.
- [ ] No console errors in DevTools at any step (TC-06 failure cases excepted).
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected (rule-denied overflow cases in TC-03).
- [ ] Zero requests to live Firebase hosts.

## Screenshots required
- Page initial load (`#help` hub)
- Modal opened from each card (title visible)
- Each validation error state (phone error, consent error, "Something went wrong — try again")
- Final success state with the PE-ENQ reference

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
