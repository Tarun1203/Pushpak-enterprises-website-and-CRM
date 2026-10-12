# T013-index-track-and-warranty: Track a Service + Warranty Status lookups (and service feedback)

| Field | Value |
|---|---|
| Route | `/index.html` |
| Source | `index.html` (TRACK A SERVICE lines ~1058-1211, WARRANTY STATUS lines ~1213-1316), `functions/lookup.js` (server-side phone/ticket rules, rate limits) |
| Flow | Open "Track a Service" (`#track-overlay`) and "Warranty Status" (`#warranty-overlay`), look up by ticket/mobile, rate a finished service |
| Requires auth | no |
| Required role | anonymous |
| Destructive | no (lookups are read-only; TC-04 creates one `serviceFeedback` doc) |
| Estimated steps | 55 |

## Preconditions
- App running at `http://localhost:8080`
- anonymous (no sign-in)
- Run only against the Firebase emulator or a dedicated test project — never the live makwell-websiteandcrm data. TC-04 submits feedback, which writes to `serviceFeedback`.
- **Safe-run guard (mandatory):** lookups call the `publicLookup` callable in region `asia-south1` on the hardcoded live project, and feedback writes go to the live Firestore. Use one of these modes:
  - **Stub mode (preferred):** `installFirebaseStub(page)` with the `firebase-functions` module routed so that `httpsCallable(...)` returns the fixture responses below, keyed on `{type, phone, ticket}`. Feedback writes land in `window.__stubWrites`.
  - **Emulator mode:** page patched with `connectFunctionsEmulator` / `connectFirestoreEmulator`, functions + Firestore emulators running and seeded. Serve the site on a port other than 8080.
  - Abort rule: any request to `firestore.googleapis.com` or `*.cloudfunctions.net` means STOP and fail as "unsafe environment".
- Fixture responses / emulator seed:
  - `track` `PE-SVC-20260910-0001-CustomerSite` + `9000000003` returns `{ found: true, kind: "service", status: "in_progress", requestType: "service", brand: "MakWell", category: "LED TV", warrantyStatus: "", createdAt: "2026-09-10T05:00:00Z" }`
  - `track` `PE-SVC-20260911-0002-CustomerSite` + `9000000006` returns `{ found: true, kind: "service", status: "closed", requestType: "installation", brand: "MakWell", category: "Washing Machine", warrantyStatus: "in_warranty", feedbackStatus: "closed", createdAt: "2026-09-11T05:00:00Z" }`. In emulator mode this also needs `publicTicketStatus/PE-SVC-20260911-0002-CustomerSite` with `{ status: "closed", customerPhone: "9000000006" }`.
  - `track` `PE-REG-20260915-0001-CustomerSite` + `9000000001` returns `{ found: true, kind: "registration", brand: "MakWell", category: "Geyser", modelNo: "QA-AUTO-MW-GSR-25L", createdAt: "2026-09-15T05:00:00Z" }`
  - `track` with any other combination returns `{ found: false }`
  - `warranty` `9000000001` returns `{ registrations: [{ product: "MakWell Geyser — QA-AUTO-MW-GSR-25L", serialNumber: "••••0001", purchaseDate: "<today minus 30 days, YYYY-MM-DD>", warrantyMonths: 12, warrantyComponents: [] }], tickets: [] }`
  - `warranty` `9000000007` returns `{ registrations: [{ product: "QA-AUTO Washer", serialNumber: "", purchaseDate: "<today minus 360 days>", warrantyMonths: 12, warrantyComponents: [{ componentName: "Full product", coverage: "Parts + labour", durationYears: 1 }, { componentName: "Motor", coverage: "", durationYears: 5 }] }, { product: "QA-AUTO Old Geyser", serialNumber: "", purchaseDate: "2024-01-01", warrantyMonths: 12, warrantyComponents: [] }], tickets: [{ ticketId: "PE-SVC-20260911-0002-CustomerSite", category: "Washing Machine", requestType: "installation", warrantyStatus: "in_warranty", createdAt: "2026-09-11T05:00:00Z" }] }`
  - `warranty` `9000000008` returns `{ registrations: [], tickets: [] }`
- Optional chain: when run after T010/T011 in emulator mode, use their recorded `REG_ID` / `SVC_ID` in place of the fixture IDs.

## Test data
- `ticketInProgress = "PE-SVC-20260910-0001-CustomerSite"`, `phoneInProgress = "9000000003"`
- `ticketClosed = "PE-SVC-20260911-0002-CustomerSite"`, `phoneClosed = "9000000006"`
- `ticketReg = "PE-REG-20260915-0001-CustomerSite"`, `phoneReg = "9000000001"`
- `warrantyPhoneActive = "9000000001"`, `warrantyPhoneMixed = "9000000007"`, `warrantyPhoneNone = "9000000008"`
- `feedbackRating = 4`, `feedbackComment = "QA-AUTO prompt and polite technician"`
- Invalid values:
  - `emptyTicket = ""`
  - `wrongPhone = "9000000009"` (valid format, no match)
  - `shortPhone = "90000"`
  - `badPrefixPhone = "5000000001"`
  - `lettersPhone = "abcdefghij"`
  - `tooLongComment = 501 × "a"`

## Steps

### TC-01: Happy path — Track an in-progress service request
1. Navigate to `/index.html`. Dismiss the cookie banner with **Reject optional** if it is shown.
2. In `#help`, click the **Track service** card ("Follow your request from booking to completion.").
3. Assert: `#track-overlay` shows the heading "Track a Service" and the sub-text "Enter your request number and mobile number to check status.". **Request / Ticket Number** has the placeholder "e.g. PE-SVC-20260910-0001-CustomerSite", and focus is on it.
4. Fill **Request / Ticket Number** = `PE-SVC-20260910-0001-CustomerSite` and **Mobile No** = `9000000003`. Click **Check status**.
5. Assert: the button shows "Checking…", then "Check status".
6. Assert: `#track-result` shows a timeline with 6 steps: "Request received", "Service center assigned", "Technician assigned", "Technician visit", "Repair", "Completed". The first 4 have class `done` and "Repair" has class `cur`.
7. Assert: Status "in progress", Request Type "Service Request", Product "MakWell LED TV", Warranty "Not yet determined", and Submitted shows the locale date of 2026-09-10.
8. Assert: no "Rate your service" box is shown (no `feedbackStatus`).

### TC-02: Track — product registration ticket and closed installation
1. Lookup `PE-REG-20260915-0001-CustomerSite` + `9000000001`. Assert: Status "Product Registered", Request Type "Product Registration" and Product "MakWell Geyser — QA-AUTO-MW-GSR-25L". No timeline is shown.
2. Lookup `PE-SVC-20260911-0002-CustomerSite` + `9000000006`. Assert: all 6 timeline steps have class `done`, Status "closed", Request Type "Installation / Demo", Product "MakWell Washing Machine" and Warranty "In warranty — covered by company".
3. Assert: a "Rate your service" box is shown with 5 star buttons (aria-labels "1 star" … "5 stars"), a textarea with the placeholder "Anything you'd like to tell us? (optional)" and a **Submit feedback** button.

### TC-03: Track — validation and not-found
| Input | Expected |
|---|---|
| Ticket empty, mobile `9000000003` | `#track-error` "Enter your request number and a valid 10-digit mobile number."; no lookup call |
| Ticket `PE-SVC-20260910-0001-CustomerSite`, mobile empty | same error |
| mobile `90000` / `5000000001` | same error |
| mobile typed `abcdefghij` | field stays empty (sanitizer); clicking **Check status** gives the same error |
| Ticket `PE-SVC-20260910-0001-CustomerSite`, mobile `9000000009` | "No matching request found. Check your request number and mobile number." in red |
| Ticket with surrounding spaces `"  PE-SVC-20260910-0001-CustomerSite  "` + `9000000003` | trimmed, so the TC-01 result is shown |

### TC-04: Track — submit service feedback (writes `serviceFeedback`)
1. From TC-02 step 3, click **Submit feedback** with no star chosen. Assert: the red message "Please choose 1 to 5 stars." is shown and there is no write.
2. Click the 4th star. Assert: stars 1-4 have class `on` and star 5 does not.
3. Type `QA-AUTO prompt and polite technician` in the textarea. Click **Submit feedback**.
4. Assert: the button shows "Sending…", then the box is replaced by "Thank you — your feedback has been recorded." in green.
5. Verify the write: `serviceFeedback/PE-SVC-20260911-0002-CustomerSite` has `{ ticketId: "PE-SVC-20260911-0002-CustomerSite", customerPhone: "9000000006", rating: 4, comment: "QA-AUTO prompt and polite technician" }`.
6. Repeat the lookup and submit 5 stars again. Assert: in emulator mode the rules deny the second write and the message "Feedback for this request has already been received." is shown. In stub mode, make `setDoc` reject `{ code: "permission-denied" }` to simulate this.
7. Textarea `maxlength=500`: typing 501 × "a" keeps 500 characters.

### TC-05: Happy path — Warranty Status lookup
1. Click the **Check warranty** card ("See what is covered and until when, with your mobile number.").
2. Assert: `#warranty-overlay` shows the heading "Warranty Status" and the sub-text "Enter your mobile number to check coverage on all your registered products.". Focus is on **Mobile No**.
3. Fill **Mobile No** = `9000000001`. Click **Check warranty**.
4. Assert: the button shows "Checking…", then "Check warranty". One `.warranty-result-card` shows the heading "MakWell Geyser — QA-AUTO-MW-GSR-25L", Serial No "••••0001" and Purchased = the seeded date. The status pill has class `active` and reads "Active — until <purchase + 12 months, locale date>".
5. Fill `9000000007` and click **Check warranty**. Assert: there are 3 cards in this order:
   1. The ticket card, with heading "Washing Machine — PE-SVC-20260911-0002-CustomerSite", Request Type "Installation / Demo" and pill "In warranty — covered by company" (class `active`).
   2. "QA-AUTO Washer", with a "Coverage by component" section: "Full product — Parts + labour" with pill class `low` and text "Expiring in <N>d" (N ≤ 30), and "Motor" with pill class `active` "Active — until …".
   3. "QA-AUTO Old Geyser", with pill class `expired` "Expired". Serial No shows "—".
6. Fill `9000000008` and click **Check warranty**. Assert: the red text reads "No registered products or service tickets found for that mobile number.".

### TC-06: Warranty — validation
| Input | Expected |
|---|---|
| empty | `#warranty-error` "Enter a valid 10-digit mobile number."; no lookup call |
| `90000` | same error |
| `5000000001` | same error |
| typed `abcdefghij` | stays empty, then the same error on click |
| `90000000011` (11 digits typed) | `maxlength=10` keeps `9000000001`, so the TC-05 result is shown |

### TC-07: Modal coverage — `track-overlay` and `warranty-overlay`
1. Open **Track service** and fill both fields. Click **×** (`#track-close`). Assert: closed. Reopen. Assert: ticket, mobile, error and result are all cleared.
2. Open **Check warranty**, run a lookup, then press **Escape**. Assert: closed. Reopen. Assert: mobile and result are cleared.
3. Click the backdrop of each overlay. Assert: it closes.
4. Navigate to `/index.html#track-service`. Assert: Track opens. Navigate to `/index.html#warranty-check`. Assert: Warranty opens.
5. Each dialog has `role="dialog"`, `aria-modal="true"`, a × button with aria-label "Close", and a Tab focus trap.

### TC-08: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| **Track service** card | click | `#track-overlay` opens |
| **Check status** `#track-search-btn` | click with valid input | "Checking…", then the result |
| **×** `#track-close` | click | closes |
| **Check warranty** card | click | `#warranty-overlay` opens |
| **Check warranty** `#warranty-search-btn` | click with valid input | "Checking…", then the result cards |
| **×** `#warranty-close` | click | closes |
| star buttons 1-5 | click | stars up to N get class `on` |
| **Submit feedback** | click | "Sending…", then the thank-you message |

### TC-09: Negative & edge cases
- Rate limit: make the lookup reject `{ code: "functions/resource-exhausted" }`. Track and Warranty each show "Too many lookups from this device. Please try again in an hour.".
- Generic failure: reject `{ code: "functions/internal" }`. Track shows "Could not check status right now. Please try again.". Warranty shows "Could not check warranty right now. Please try again.".
- invalid-argument with message `"QA-AUTO invalid ticket"`: the message is shown verbatim.
- Cancelled ticket: fixture `status: "cancelled"`. The timeline has class `cancelled` with "Request received" (done) and "Cancelled" (cur).
- Waiting spare: fixture `status: "waiting_spare"`. The "Repair" step reads "Repair (waiting for a spare part)".
- Feedback network failure (non-permission error): "Could not send feedback right now. Please try again." and **Submit feedback** is re-enabled.
- XSS: fixture `brand = "<img src=x onerror=window.__xss=1>"` in both track and warranty results. The text is rendered literally and `window.__xss` is undefined.
- Privacy: the Track result never shows the customer's name, address or technician name, even if the fixture includes `customerName`.

## Assertions
- [ ] Track error "Enter your request number and a valid 10-digit mobile number.".
- [ ] Track not-found "No matching request found. Check your request number and mobile number.".
- [ ] Timeline step mapping matches `TRACK_AT` for in_progress, closed, cancelled and waiting_spare.
- [ ] Warranty error "Enter a valid 10-digit mobile number."; none-found text exact.
- [ ] Warranty pills: `active` / `low` ("Expiring in Nd") / `expired`; tickets listed before registrations.
- [ ] Feedback requires 1-5 stars; one rating per ticket.
- [ ] No console errors in DevTools at any step (TC-09 failure cases log the expected `console.error`).
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected (duplicate feedback denial).
- [ ] Zero requests to live Firebase hosts.

## Screenshots required
- Page initial load
- Track dialog opened; in-progress timeline result; closed result with the feedback box
- Warranty dialog opened; mixed result (ticket + component coverage + expired)
- Each validation error state (track error, warranty error, "Please choose 1 to 5 stars.", not-found)
- Final state: feedback thank-you message

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
