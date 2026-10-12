# T078-crm-warehouse-local-purchase-returns-claims: Local purchase lifecycle, Log a return (restock), and New claim, with validation

| Field | Value |
|---|---|
| Route | `/crm/CRMwarehouse.html` (sections `lp-*`, `returns-*`, `claims-*`) |
| Source | `crm/CRMwarehouse.html` (`lp-form`, `lp-invoice-form`, `payment-form`, `return-form` / `openReturnModal`, `restockReturn`, `claim-form`) |
| Flow | Fill and submit "New local purchase request" → "Submit invoice" → Verify → "Record payment"; "Log a return" → Received → Return to Stock; "New claim" |
| Requires auth | yes |
| Required role | warehouse |
| Destructive | no |
| Estimated steps | 52 |

## Preconditions
- App running at `http://localhost:8080`
- Signed in as `warehouse` at `/crm/login.html`. The runner resolves `QA_CRED_WAREHOUSE_USERNAME` / `QA_CRED_WAREHOUSE_PASSWORD`. Never type literal credentials.
- Run only against the Firebase emulator or a dedicated test project, never the live makwell-websiteandcrm data. This task writes to `localPurchases`, `payments`, `auditLogs`, `returns`, `inventory`, `stockMovements`, `claims` and `counters`.
- `spareParts/qa-part-thermo` (SP-9001 `QA-AUTO Geyser Thermostat 15L`) with `inventory/warehouse_qa-part-thermo.quantity = 20`.

## Test data
**Local purchase (`lp-form`)**
- `lp-item` = `QA-AUTO Geyser Thermostat 15L (local)`
- `lp-qty` = `2`
- `lp-amount` = `900`
- `lp-requestedby` = `QA-AUTO Raichur Service Center`
- `lp-emergency-flag` = checked
- `lp-notes` = `QA-AUTO vendor Raichur Electricals, 9000000041`

**Invoice (`lp-invoice-form`)**
- `lp-vendor` = `QA-AUTO Raichur Electricals`
- `lp-invoice-number` = `QA-INV-584101-001`
- `lp-actual-amount` = `880`

**Payment (`payment-form`)**
- `payment-amount` = `880` (prefilled)
- `payment-method` = `UPI`
- `payment-reference` = `QA-UPI-0001`
- `payment-date` = today (prefilled)

**Return (`return-form`, "Accept a return")**
- `return-part-id` = `SP-9001 — QA-AUTO Geyser Thermostat 15L`
- `return-qty` = `2`
- `return-source` = `QA-AUTO Service Center - Raichur`
- `return-reason` = `QA-AUTO excess stock`
- `return-notes` = `QA-AUTO pincode 584101`

**Claim (`claim-form`)**
- `claim-type` = `Technician`
- `claim-name` = `QA-AUTO Ramesh Technician`
- `claim-description` = `QA-AUTO travel expense Raichur on-site repair`
- `claim-amount` = `350`
- `claim-notes` = `QA-AUTO mobile 9000000051`

**Invalid values:** `""`, `-1`, `0` (qty), `1.234` (amounts with `step=0.01`)

## Steps

### TC-01: Happy path. Local purchase from request to reimbursement
1. Click nav **New Requests** under Parts & Purchase (`lp-new`). Assert: `#page-sub` = `Local Purchase`, button **`+ New Request`**.
2. Click it. Assert: `#lp-overlay` with heading `New local purchase request`, Quantity default `1`, and an unchecked checkbox `This is an emergency purchase`.
3. Fill every field with the local purchase Test data. Click **`Create request`**.
4. Assert: `#lp-success` = `Created — PE-LP-<YYYYMMDD>-<NNNN>-Warehouse` and the modal closes within 1.5 s. The row shows that ID, Item, Qty `2`, Requested By `QA-AUTO Raichur Service Center`, Amount `~₹900`, Emergency `URGENT`, pill `Requested`, and button **`Submit Invoice`**.
5. Open **Emergency Purchase**. Assert: the same row is listed.
6. Back on `lp-new`, click **`Submit Invoice`**. Assert: `#lp-invoice-overlay` heading `Submit invoice`, label `PE-LP-… — QA-AUTO Geyser Thermostat 15L (local)`.
7. Fill the invoice data. Click **`Submit invoice`**. Assert: `Invoice submitted.` The row leaves `lp-new`.
8. Open **Invoice Verification**. Assert: the row shows Amount `₹880`, pill `Invoice Submitted`, and button **`Verify Invoice`**. Click it. Assert: the row leaves the tab. There is no confirmation dialog; record this as an observation.
9. Open **Claim Processing** (`lp-claims`). Assert: pill `Verified`, button **`Mark Reimbursed`**. Click it.
10. Assert: `#payment-overlay` heading `Record payment`, label `PE-LP-… — QA-AUTO Geyser Thermostat 15L (local)`, Amount prefilled `880`, Paid date = today.
11. Set Method `UPI`, Reference `QA-UPI-0001`. Click **`Record payment`**. Assert: `Payment recorded.` and the modal closes within 1.2 s.
12. Open **Local Purchase History**. Assert: the row shows pill `Reimbursed`, there is no Actions column, and it is no longer under Emergency Purchase.
13. Open **Audit Logs**. Assert: the top entry has Type `Payment`, Action `settled`, Details `Recorded ₹880 payment (UPI) for PE-LP-…`.

### TC-02: Happy path. Accept a return and put it back in stock
1. Open **Returns** (`returns-intake`). Click **`+ Accept Return`**. Assert: the title is `Accept a return` and the button reads **`Accept return`**. `#return-part-id` lists `SP-9001 — QA-AUTO Geyser Thermostat 15L`.
2. Fill the return data. Click **`Accept return`**. Assert: `#return-success` = `Saved — PE-RT-<YYYYMMDD>-<NNNN>-Warehouse`. The row shows Qty `2`, Source `QA-AUTO Service Center - Raichur`, Reason `QA-AUTO excess stock`, pill `Received`, and buttons **`Mark Defective`**, **`Return to Stock`**, **`Reject`**.
3. Click **`Return to Stock`**. Assert: the row leaves Returns (status `restocked`).
4. Open **Warehouse Stock**. Assert: SP-9001 = `22` (20 + 2). Open **Receive**. Assert: the newest row has Type `Receive`, Qty `2`, Reason `Returned to stock (inspected, found OK)`.
5. Click **`+ Request Return`**. Assert: the title is `Request a return` and the button reads **`Send request`**. Submit the same data. Assert: it appears under **Return Requests** with **`Mark Received`**, and the dashboard **Pending Returns** tile goes up by 1.

### TC-03: Happy path. New claim
1. Open **Technician Claims**. Click **`+ New Claim`**. Assert: heading `New claim`, Claimant type default `Technician`.
2. Fill the claim data. Click **`Create claim`**. Assert: `Created — PE-CL-<YYYYMMDD>-<NNNN>-Warehouse`. The row shows Type `Technician`, Claimant `QA-AUTO Ramesh Technician`, Amount `₹350`, pill `Submitted`, buttons **`Verify`** / **`Reject`**.
3. Type `QA-AUTO Ramesh` in the claims search. Assert: only matching rows remain. Clear the search.
4. Click the row (not a button). Assert: `#claim-detail-overlay` with title `PE-CL-…`, `Claimant: QA-AUTO Ramesh Technician (Technician)`, and `Not yet settled — no payment recorded.` Click **`Close`**.

### TC-04: Form validation matrix
All forms use native `required` / `min` / `step` (no `novalidate`). For each blocked case, assert the field matches `:invalid` and that no success text or new row appears.

| Form | Field | Empty value | Range / pattern violation | Max-length overflow |
|---|---|---|---|---|
| lp-form | Item / part needed | blocked | `"   "` saves an empty item (log a defect) | none enforced |
| lp-form | Quantity | blocked | `0`, `-1` blocked (`min=1`) | n/a |
| lp-form | Estimated amount (₹) | blocked | `-1` blocked; `1.234` blocked (`step=0.01`) | n/a |
| lp-form | Requested by | blocked | `"   "` saves (log a defect) | none |
| lp-invoice-form | Vendor name | blocked | `"   "` saves (log a defect) | none |
| lp-invoice-form | Invoice number | blocked | n/a | none |
| lp-invoice-form | Actual amount (₹) | blocked | `-1` blocked | n/a |
| payment-form | Amount (₹) | blocked | `-1` blocked | n/a |
| payment-form | Paid date | blocked (clear it) | n/a | n/a |
| claim-form | Claimant name | blocked | `"   "` saves (log a defect) | none |
| claim-form | Description | blocked | n/a | none |
| claim-form | Amount (₹) | blocked | `-1` blocked; `0` allowed (record this) | n/a |
| return-form | Part | `Select a part…` blocked natively (the JS message `Select a part.` shows only if the native check is bypassed) | n/a | n/a |
| return-form | Quantity | blocked | `0` blocked | n/a |
| return-form | Returned from | blocked | n/a | none |
| return-form | Reason | blocked | n/a | none |

### TC-05: Modal coverage. Cancel paths
For each: open the modal, type into the first field, click its Cancel button, and assert it closes with no write. Reopen and assert the fields are reset.
- **`Cancel`** `#cancel-lp`
- **`Cancel`** `#cancel-lp-invoice`
- **`Cancel`** `#cancel-payment` (the local purchase stays `Verified`)
- **`Cancel`** `#cancel-claim`
- **`Cancel`** `#cancel-return`

### TC-06: Negative & edge cases
- **Restock twice:** open the Returns tab in two browser tabs. Click **`Return to Stock`** in both. Expected: the second click shows the alert `Could not restock this item. Check the console for details.`, and stock goes up only once.
- **Payment amount differs from invoice:** in TC-01 step 11, set Amount `1000`. Expected per source: it is accepted (no cap). Record this as an observation, since the reimbursement can exceed the invoice.
- **Offline create:** offline `lp-form` submit shows `Could not create request. Check console for details.`

## Assertions
- [ ] Local purchase goes Requested → Invoice Submitted → Verified → Reimbursed, with a payment and an audit log.
- [ ] Return to Stock adds +2 to the warehouse and logs a Receive movement.
- [ ] The claim is created with ID `PE-CL-…`, is searchable, and its detail popup opens.
- [ ] Native validation blocks every required/min/step violation. Whitespace defects are logged.
- [ ] All Cancel buttons close without writing.
- [ ] No console errors in DevTools at any step, except the deliberate offline/race cases.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected.

## Screenshots required
- Each modal opened (lp, invoice, payment, return accept, return request, claim)
- Each success message
- Each validation error state (one per form minimum)
- Local Purchase History final row; Warehouse Stock after restock; Claims list

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
