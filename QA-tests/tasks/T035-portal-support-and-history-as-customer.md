# T035-portal-support-and-history-as-customer: Open, reply to and close a support ticket; rate a finished service

| Field | Value |
|---|---|
| Route | `/portal.html` (sections `Support`, `Service History`) |
| Source | `portal.html` (`#sp-form`, `loadSupport`, `renderHistory`, `loadFeedbackBox`), `functions/index.js` (`supportTicket`), `functions/customer.js` (`validateSupportCreate`, `applySupportAction`) |
| Flow | Fill and submit form `sp-form`; reply to and close a ticket; rate a finished service visit |
| Requires auth | yes |
| Required role | customer |
| Destructive | yes (`Close ticket` has no confirm dialog; `Submit rating` can be done only once per visit) |
| Estimated steps | 38 |

## Preconditions
- App running at `http://localhost:8080`.
- Run only against the Firebase emulator or a dedicated test project. Never run against the live makwell-websiteandcrm data. This task WRITES `supportTickets`, `notifications`, `counters`, `lookupLimits` and `serviceFeedback`. `portal.html` hard-codes the `makwell-websiteandcrm` config. Before submitting, confirm in DevTools → Network that `supportTicket` and Firestore writes go to the emulators or to the dedicated test project. Otherwise STOP and mark BLOCKED.
- Sign in as `customer`. The runner resolves `QA_CRED_CUSTOMER_USERNAME` / `QA_CRED_CUSTOMER_PASSWORD` on `/portal.html` → `Email & password`. The account is phone-verified with `+91 9000000001` (Auth-emulator / test-project test number; the OTP comes from the emulator or the fixed test OTP).
- Seed data (emulator), for the related-request dropdown and Service History:
  - `customerTracking/PE-SVC-20261001-0009-Portal` = `{ ticketId: "PE-SVC-20261001-0009-Portal", customerPhone: "9000000001", requestType: "service", category: "QA-AUTO Geyser", status: "completed", history: [{status:"new", at:<2026-10-01>}, {status:"completed", at:<2026-10-03>}], technicianName: "QA-AUTO Tech", actionTaken: "QA-AUTO replaced thermostat", customerCharge: 450, createdAt: <2026-10-01> }`
  - No `serviceFeedback/PE-SVC-20261001-0009-Portal` doc exists yet.
- Rate limit: 5 ticket creations per phone per IST day. This task creates 1. Validation failures do not count.

## Test data
- `What is this about? = "Service complaint"`
- `Related service request (optional) = "PE-SVC-20261001-0009-Portal — QA-AUTO Geyser"`
- `Subject = "QA-AUTO geyser still leaking {runId}"`
- `Message = "QA-AUTO test ticket. Geyser drips from the inlet after the visit. Please ignore — automated QA."`
- `replyText = "QA-AUTO follow-up reply {runId}"`
- `feedbackComment = "QA-AUTO rating comment"`, `rating = 4`
- Invalid: `emptyRequired = ""`, `whitespace = "   "`, `tooLongSubject = 121 × "a"`, `tooLongMessage = 2001 × "a"`

## Steps

### TC-01: Happy path — Open a support ticket
1. Navigate to `/portal.html`. Sign in as customer. Click Home **`Get support`**.
2. Assert: heading `Support`, sub-text `Questions, complaints or anything else — our team replies here, and you can follow the conversation.`, and heading `Open a new ticket`.
3. Assert: `What is this about?` lists `Select…`, `Product question`, `Service complaint`, `Warranty`, `Billing`, `Other`. `Related service request (optional)` lists `None` and `PE-SVC-20261001-0009-Portal — QA-AUTO Geyser`.
4. Fill all four fields from Test data. Click **`Send`**.
5. Assert: `#sp-msg` is green and matches `^Sent\. Your ticket number is PE-SUP-\d{8}-\d{4}\. We will reply here\.$`. Record it as `supId`.
6. Assert: the form resets. `What is this about?` = `Select…`, `Related` = `None`, and `Subject` and `Message` are empty.
7. Assert: the support list shows a card `QA-AUTO geyser still leaking {runId} · supId`, with row `Service complaint · PE-SVC-20261001-0009-Portal` and a green pill `Waiting for our team`.
8. Click **`View conversation`**. Assert: the button reads `Hide conversation` and the first message is from `You` with the Test data `Message` text. A reply textarea with placeholder `Write a reply`, plus **`Send reply`** and **`Close ticket`** buttons, are shown.
9. Reload. Assert: the ticket `supId` is still listed.

### TC-02: Reply to the ticket
1. In the expanded `supId` conversation, leave the reply textarea empty and click **`Send reply`**. Assert: the red message under it reads `Write your message.`
2. Type `replyText` and click **`Send reply`**. Assert: the conversation re-renders still expanded, the last message is from `You` with `replyText`, and the pill is `Waiting for our team`.

### TC-03: Destructive — Close ticket
There is no confirmation dialog, so there is no cancel path. Assert this explicitly.
1. Click **`Close ticket`** on `supId`.
2. Assert: no confirm dialog appears. The pill becomes `Closed`, a system line `Closed by customer.` is added in italics, the `Close ticket` button disappears, and the textarea placeholder becomes `Write to reopen this ticket`.
3. Type `QA-AUTO reopen {runId}` and click **`Send reply`**. Assert: the pill returns to `Waiting for our team` and `Close ticket` reappears (a customer reply reopens the ticket).
4. Click **`Close ticket`** again to leave the test ticket closed. Assert: pill `Closed`.
5. Defect check: log as a finding (not a failure) that `Close ticket` has no confirmation step.

### TC-04: Form validation — `sp-form`
Change one field per row from the valid Test data, click **`Send`**, and assert the red `#sp-msg`. No new ticket may appear in the list.

| Field | Empty value error | Pattern violation | Max-length overflow |
|---|---|---|---|
| `What is this about?` | `Select…` → `Choose what this is about.` | n/a | n/a |
| `Subject` | `""` or `"   "` → `Add a short subject.` | n/a | 121 chars typed → input holds 120 |
| `Message` | `""` or `"   "` → `Write your message.` | n/a | 2001 chars typed → textarea holds 2000 |
| `Related service request (optional)` | `None` → accepted (optional) | tampered option value `x` (via DevTools) → `Invalid related request.` | n/a |

### TC-05: Service History — rate a finished visit
1. Click nav **`Service History`**. Assert: sub-text `Every visit for each of your products — what was done, and what you paid. Rate finished visits to help us improve.`
2. Assert: under `Other service requests` (or under the matching product), the card `Service visit — PE-SVC-20261001-0009-Portal` shows `Status Service completed`, a `Completed <date>` row, `Technician QA-AUTO Tech`, `Work done QA-AUTO replaced thermostat`, and `Charges ₹450 paid`.
3. Assert: the box `How was this service?` has 5 star buttons and **`Submit rating`** is disabled.
4. Click the 4-star button (`aria-label="4 star"`). Assert: `Submit rating` is enabled and the 4-star button has the blue border.
5. Type `feedbackComment` in `Anything to add? (optional)`. Click **`Submit rating`**.
6. Assert: the box is replaced by `You rated this visit ★★★★☆. Thank you!`
7. Reload, then open `Service History` again. Assert: the same `You rated this visit ★★★★☆. Thank you!` text shows and no rating form is offered.
8. Assert (emulator): `serviceFeedback/PE-SVC-20261001-0009-Portal` has `rating: 4`, `customerPhone: "9000000001"`, `comment: "QA-AUTO rating comment"`.
9. If step 6 instead shows red `You can rate this once the service center has marked it completed. Please try again later.`, the Firestore rules rejected the seeded (non-CRM) ticket. Record TC-05 as BLOCKED (seed) and attach the console error.

### TC-06: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| `Send` | click | disabled during the call, then green ticket message |
| `View conversation` / `Hide conversation` | click | toggles that ticket's thread only |
| `Send reply` | click (empty / with text) | `Write your message.` / message appended |
| `Close ticket` | click → (no confirm) | pill `Closed`, `Closed by customer.` |
| star buttons 1–5 | click | enables `Submit rating`, highlights the chosen star |
| `Submit rating` | click | `You rated this visit …. Thank you!` |

### Negative & edge cases (part of TC-06)
- Go offline and click **`Send`** with valid data → `#sp-msg`: `Could not send. Please try again.`
- A customer whose `customerPhone` has no tickets → `No support tickets yet.`, and `Service History` shows `No products or service visits yet.` when nothing else exists.

## Assertions
- [ ] Ticket number format `PE-SUP-YYYYMMDD-NNNN` is shown in green and the form resets.
- [ ] The new ticket is listed with its subject, related request and `Waiting for our team`, and it survives a reload.
- [ ] Reply appends a `You` message, close sets `Closed` with `Closed by customer.`, and a reply on a closed ticket reopens it.
- [ ] Every validation message in TC-04 matches exactly.
- [ ] The rating is saved once and shown as stars after a reload.
- [ ] No console errors other than the `console.error` logged for deliberately rejected calls.
- [ ] No failed network requests other than the expected `supportTicket` errors in TC-02 step 1 / TC-04.

## Screenshots required
- `Support` section on load
- Success message after `Send`
- Expanded conversation after the reply
- Ticket in `Closed` state
- Each validation error in TC-04
- `Service History` card before and after rating

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
