# T093-crm-crmdealer-account-invoices-as-dealer: Account & Invoices — credit, invoices, payments, statement

| Field | Value |
|---|---|
| Route | `/crm/CRMdealer.html` (sidebar `Account & Invoices`) |
| Source | `crm/CRMdealer.html` → `crm/tradeFinance.js` (`renderMyAccount`, `renderLedger`, `printInvoice`) |
| Flow | Review own credit position, invoices, payments and statement; print an invoice |
| Requires auth | yes |
| Required role | dealer |
| Destructive | no (read-only page) |
| Estimated steps | 22 |

## Preconditions
- App running at `http://localhost:8080`
- **Run only against the Firebase emulator or a dedicated test project — never the live makwell-websiteandcrm data. Mark BLOCKED if traffic would reach the live project.** Seed below must be written to the emulator only.
- Signed in as `dealer` via env `QA_CRED_DEALER_USERNAME` / `QA_CRED_DEALER_PASSWORD`.
- Pop-ups allowed for `localhost:8080` (needed for `View / print`).
- Seed (emulator), all for `<dealerUid>`:
  - `tradeAccounts/<dealerUid>` = `{ creditLimit: 50000, outstanding: 11800, paymentTermsDays: 30, oldestUnpaidDue: <today + 10 days> }`
  - `invoices/QA-INV-1` = `{ buyerUid, invoiceNo: "PE/2026-27/00901", orderId: "PE-DO-QA-0001-Dealer", invoiceDate: <today − 20 d>, dueDate: <today + 10 d>, totals: { taxable: 10000, cgst: 900, sgst: 900, igst: 0, total: 11800 }, paid: 0, balance: 11800, status: "unpaid", seller: { legalName: "Pushpak Enterprises", stateCode: "29" }, buyer: { name: "QA-AUTO Dealer Raichur", address: "Raichur, Karnataka 584101", stateCode: "29" }, lines: [ one line QA-AUTO Geyser qty 2 @ 5000, 18% ] }`
  - `invoices/QA-INV-2` = same shape, `invoiceNo: "PE/2026-27/00902"`, `totals.total: 5900`, `paid: 5900`, `balance: 0`, `status: "paid"`
  - `tradePayments/QA-PAY-1` = `{ accountUid: <dealerUid>, amount: 5900, mode: "UPI", reference: "QA-AUTO-UTR-001", receivedOn: "<today − 5 d ISO>" }`
  - `ledgerEntries`: invoice 11800 debit, invoice 5900 debit, payment 5900 credit (with `at` timestamps in that order, `ref` = invoice no / UTR)

## Test data
- Expected header: `Credit limit ₹50,000.00`, `Outstanding ₹11,800.00`, `Available ₹38,200.00`, `Payment terms 30 days`
- Expected statement closing balance: `₹11,800.00`
- Overdue seed variant: `oldestUnpaidDue = <today − 1 day>`, `QA-INV-1.dueDate = <today − 1 day>`

## Steps

### TC-01: Happy path — account summary, invoices, payments, statement
1. Sign in as `dealer`. Navigate to `/crm/CRMdealer.html`. Click `Account & Invoices`.
2. Assert: `#page-sub` = `Credit, invoices, payments and statement with Pushpak Enterprises`; panel `My account with Pushpak Enterprises` shows the four expected header values exactly.
3. Assert: no red overdue banner.
4. Assert panel `Invoices`: columns Invoice / Date / Order / Total / Paid / Balance / Due / Status; row `PE/2026-27/00901` Total `₹11,800.00`, Paid `₹0.00`, Balance `₹11,800.00`, Status pill `unpaid`; row `PE/2026-27/00902` Status `paid`. Newest invoice date first.
5. Assert panel `Payments received`: row `<receivedOn>` / `₹5,900.00` / `UPI QA-AUTO-UTR-001`.
6. Assert panel `Statement`: 3 rows in date order with labels `Invoice`, `Invoice`, `Payment received`; running balance ends at `₹11,800.00`; footer `A negative balance is money paid in advance.`
7. Click **`View / print`** on `PE/2026-27/00901`.
8. Assert: new window titled `PE/2026-27/00901` with heading `TAX INVOICE`, Seller `Pushpak Enterprises`, Buyer `QA-AUTO Dealer Raichur`, CGST/SGST columns (same state 29), Total `₹11,800.00`, `Balance due: ₹11,800.00`, a `Print` button.

### TC-02: Overdue state
1. Apply the overdue seed variant. Reload, click `Account & Invoices`.
2. Assert red text `You have an overdue invoice (due <dd/mm/yyyy>). New orders can't be approved until it is paid.`
3. Assert `PE/2026-27/00901` status pill reads `Overdue` (red) instead of `unpaid`.

### TC-03: Empty / new account
1. Use a dealer with no `tradeAccounts` doc, no invoices, no payments (or delete seed in emulator).
2. Assert: `Credit limit ₹0.00`, `Outstanding ₹0.00`, `Available ₹0.00`, `Payment terms 30 days`; `No invoices yet.`; `No payments recorded yet.`; Statement `No entries yet.`

### TC-04: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| `View / print` (pop-ups allowed) | click | invoice opens in new window |
| `View / print` (pop-ups blocked) | click | alert `Allow pop-ups for this site to view the invoice.` |
| `Print` (in invoice window) | click | browser print dialog opens; `Print` button hidden in print preview |

### TC-05: Negative & edge cases
- Isolation: seed an invoice with a different `buyerUid`. Assert it never appears for this dealer (and rules deny the read rather than returning it).
- Cancelled invoice (`status: "cancelled"`): print view shows red `CANCELLED` stamp; status pill `cancelled`, never `Overdue`.
- Firestore unavailable: Assert `Couldn't load your account.`
- Over-limit seed (`outstanding: 60000`, limit 50000): record `Available` value — source renders `₹-10,000.00`; log formatting if business wants a clearer "over limit" message.

## Assertions
- [ ] Header figures equal seed values exactly.
- [ ] Invoices list only this dealer's invoices, newest first, correct pills.
- [ ] Overdue banner and `Overdue` pill appear only when due date has passed.
- [ ] Statement running balance is correct.
- [ ] Invoice print view renders all totals.
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected.

## Screenshots required
- Account page initial load
- Overdue banner state
- Empty account state
- Printed invoice window

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
