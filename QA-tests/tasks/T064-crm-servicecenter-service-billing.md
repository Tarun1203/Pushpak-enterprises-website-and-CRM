# T064-crm-servicecenter-service-billing: Service Billing — bill completed tickets (in/out of warranty) and submit a bulk warranty claim

| Field | Value |
|---|---|
| Route | `/crm/CRMservicecenter.html` → sidebar `Service Billing` |
| Source | `crm/CRMservicecenter.html` (`renderServiceBilling`, `loadServiceBilling`, `getTicketWarrantyInfo`, `openBillingModal`, `#submit-billing` handler, `submitBulkClaim`, `openBillingTicketDetail`) |
| Flow | Bill an out-of-warranty ticket (collected from customer); bill an in-warranty ticket (ready to claim); submit selected tickets as one warranty claim |
| Requires auth | yes |
| Required role | servicecenter |
| Destructive | no |
| Estimated steps | 45 |

## Preconditions
- App running at `http://localhost:8080`
- Run only against the Firebase emulator or a dedicated test project — never the live makwell-websiteandcrm data.
- Signed in as `servicecenter` at `/crm/login.html` using `QA_CRED_SERVICECENTER_USERNAME` / `QA_CRED_SERVICECENTER_PASSWORD`.
- Firebase Functions emulator running: billing is written server-side (`applyBillingRequest`) and claims are locked server-side (`checkClaim`). Without it the modal ends with `Still being processed — refresh in a minute to see the result.` and the task fails as an environment issue.
- Three completed requests of this center, created and closed through the UI (T062 TC-01 + TC-05 flow), none billed yet:
  - `{outTicket}` — customer `QA-AUTO Out Warranty`, phone `9000000301`, purchase date today − 3 years (e.g. `2023-10-11`), no serial
  - `{inTicket}` — customer `QA-AUTO In Warranty`, phone `9000000302`, purchase date today − 60 days, category with a service-charge rate set (HO default or center override; record the amount as `{rate}`)
  - `{unknownTicket}` — customer `QA-AUTO Unknown Warranty`, phone `9000000303`, no purchase date, no serial

## Test data
Out-of-warranty billing (`#billing-customer-fields`):
- `Spare parts cost (₹)` = `450`
- `Other charges (₹)` = `50`
- `Service charge to collect (₹)` = `300`
- `Payment method` = `UPI`
- `Payment reference (optional)` = `QA-AUTO-UPI-0001`
- Expected total = `₹800`

Unknown-warranty ticket: `Bill as` = `In-warranty — claim to Head Office`.

Invalid: `Spare parts cost (₹)` = `-10` (min 0).

## Steps

### TC-01: Page renders the three billing panels
1. Navigate to `/crm/CRMservicecenter.html`; click **`Service Billing`**.
2. Assert: title `Service Billing`, sub `Warranty claims to Head Office, and charges collected from customers`.
3. Assert: panel `Needs billing` lists `{outTicket}`, `{inTicket}`, `{unknownTicket}` with headers `Ticket, Customer, Serial No, Completed, Warranty, Actions` and a `Bill this ticket` button each.
4. Assert: Warranty cells change from `Checking…` to pills: `{outTicket}` = `Expired`; `{inTicket}` = `Active — until <date>`; `{unknownTicket}` = `Unknown — no purchase date on file`.
5. Assert: panel heading `Ready to claim (in-warranty) — unclaimed: ₹<n>`; button `Submit selected as claim` is disabled.

### TC-02: Happy path — Bill out-of-warranty ticket (collected from customer)
1. Click **`Bill this ticket`** on `{outTicket}`.
2. Assert: dialog `Bill this service ticket` shows `Checking warranty…` then: `Ticket` = `{outTicket} — QA-AUTO Out Warranty`; `Warranty` pill `Expired` with `(Purchase date on ticket (default 12-month cover))`; `Bill as` = `Out-of-warranty — collect from customer` (read-only text, no select).
3. Assert: customer fields visible — `Spare parts cost (₹)`, `Other charges (₹)`, `Service charge to collect (₹)`, `Payment method` (`Cash, UPI, Card, Other`), `Payment reference (optional)`; in-warranty note hidden.
4. Fill with Test data. Click **`Save`**.
5. Assert: button `Saving…`, then `Saved.` within ~20 s; dialog closes.
6. Assert: `{outTicket}` is gone from `Needs billing` and appears in `Billing history` with Type `Customer paid`, Total `₹800`, Status pill `Collected from customer`.
7. Click `{outTicket}` link in Billing history. Assert dialog `{outTicket}` lists `Spare Parts Cost ₹450`, `Other Charges ₹50`, `Service Charge ₹300`, `Billing Total ₹800`, `Billing Type customer`, `Billing Status collected`, `Payment Method upi`, `Payment Reference QA-AUTO-UPI-0001`. Click **`Close`**.
8. Reload, reopen Service Billing. Assert the same history row persists.

### TC-03: Bill in-warranty ticket → Ready to claim
1. Click **`Bill this ticket`** on `{inTicket}`.
2. Assert: `Bill as` = `In-warranty — claim to Head Office`; row `Service charge (your rate card)` = `₹{rate}` (if `{rate}` is 0 the text continues `— not set up yet for this category/type. Set it under Service Charge Rates first.`); note beginning `Spare parts used on an in-warranty job aren't billed to Head Office per ticket`; customer-charge fields hidden.
3. Click **`Cancel`**. Assert: dialog closes, ticket still under `Needs billing`.
4. Reopen and click **`Save`**. Assert: `Saved.`; ticket moves to `Ready to claim` with Total `₹{rate}` and Billed-on today; unclaimed total heading increases by `{rate}`.

### TC-04: Unknown warranty — manual choice
1. Click **`Bill this ticket`** on `{unknownTicket}`.
2. Assert: `Bill as (warranty couldn't be determined automatically — choose manually)` select with `In-warranty — claim to Head Office` (selected) and `Out-of-warranty — collect from customer`.
3. Switch to `Out-of-warranty`: Assert customer fields appear and in-warranty note hides. Switch back: reverse.
4. Leave `In-warranty`, click **`Save`**. Assert: either `Saved.` and the ticket moves to `Ready to claim`, or a red server reason from `billingRejected` (record the exact text). Either is a pass if the UI reflects the server decision; a stuck `Saving…` is a fail.

### TC-05: Submit selected as one warranty claim
1. In `Ready to claim`, tick `{inTicket}` (and `{unknownTicket}` if it landed there). Assert: `Submit selected as claim` becomes enabled. Untick all → disabled again. Tick the header checkbox → all rows ticked, button enabled.
2. With `{inTicket}` ticked, click **`Submit selected as claim`**.
3. Assert: button `Submitting…`, then browser alert `Claim submitted — PE-CL-YYYYMMDD-NNNN-ServiceCenter`; record as `{claimId}`. Accept the alert.
4. Assert: `{inTicket}` moves to `Billing history` with Type `Warranty claim`, Status pill `Claimed — {claimId}`; unclaimed total drops accordingly.
5. Click **`Center Claims`**. Assert row `{claimId}`, Description `Warranty claim — 1 ticket ({inTicket})`, Amount `₹{rate}`, Status `Submitted`.
6. Double-claim guard: in the emulator re-set `{inTicket}.billingStatus = "ready_to_claim"`, reload, tick it and submit again. Assert alert begins `Claim not accepted — ` (server lock refuses a ticket already in another claim). Restore afterwards.

### TC-06: Form validation — billing modal
| Field | Empty value error | Pattern violation | Max-length overflow |
|---|---|---|---|
| Spare parts cost (₹) | empty → saved as 0 (no required) | `-10` → server either rejects (red reason) or stores 0; record result. No client-side min check exists on Save (button is `type="button"`). Report as `DEF:` if a negative value is persisted | n/a |
| Other charges (₹) | empty → 0 | `-5` → same as above | n/a |
| Service charge to collect (₹) | empty → 0 | `-1` → same as above | n/a |
| Payment reference (optional) | allowed | n/a | n/a |

### TC-07: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| `Bill this ticket` | click | billing dialog opens with `Checking warranty…` then the form |
| `Cancel` (billing) | click | dialog closes, nothing written |
| Backdrop (billing) | click | dialog closes |
| `Edit` (Ready to claim row) | click | billing dialog re-opens for that ticket |
| Ticket link (any table) | click | `Ticket details` dialog titled with the request ID |
| `Close` (ticket details) | click | dialog closes |
| `Submit selected as claim` | click with nothing ticked | button is disabled; nothing happens |

### TC-08: Negative & edge cases
- Functions emulator stopped → Save shows `Still being processed — refresh in a minute to see the result.` after ~20 s; button returns to `Save`.
- Offline on bulk claim → alert `Could not submit claim. Check console for details.`
- Ticket detail for a stale ID (delete the doc in emulator, click link without reloading) → `Could not find this ticket.` (or the cached values; record which).

## Assertions
- [ ] Warranty pill per ticket matches purchase-date rules (expired / active / unknown).
- [ ] Out-of-warranty billing records costs, payment method and reference; total `₹800`; status `Collected from customer`.
- [ ] In-warranty billing moves the ticket to `Ready to claim` with the rate-card amount.
- [ ] Bulk claim creates `PE-CL-…-ServiceCenter`, marks the ticket `Claimed — {claimId}` and appears on Center Claims.
- [ ] Server refuses a duplicate claim for an already-claimed ticket.
- [ ] No console errors in DevTools at any step (except deliberate offline/emulator-stopped cases).
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected.

## Screenshots required
- Service Billing initial load with warranty pills
- Billing dialog in out-of-warranty, in-warranty and unknown modes
- Ticket details dialog
- Billing history after both billings; Center Claims row
- Each validation error state

## Pass criteria
All TCs above pass AND no unexpected console/network errors. Findings flagged `DEF:` are reported but do not fail the task.
