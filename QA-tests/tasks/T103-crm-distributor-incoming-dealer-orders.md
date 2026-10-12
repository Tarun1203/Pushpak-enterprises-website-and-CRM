# T103-crm-distributor-incoming-dealer-orders: Handle dealer orders (approve, reject, dispatch, deliver)

| Field | Value |
|---|---|
| Route | `/crm/CRMdistributor.html` → sidebar `Incoming Dealer Orders` |
| Source | `crm/CRMdistributor.html` (line 410-412 → `Trade.renderOrderQueue(contentEl, { db, mode: 'distributor', uid })`); `crm/tradeOrders.js` (`renderOrderQueue` 277-456); `crm/tradePricing.js` (`SELLER_NEXT`, `STATUS_LABELS`) |
| Flow | Seller (the distributor) moves orders from its own dealers through: placed → confirmed → dispatched → delivered, plus reject/cancel |
| Requires auth | yes |
| Required role | distributor |
| Destructive | yes (changes order status, rejects/cancels orders, sends a dispatch request with serials) |
| Estimated steps | 38 |

## Preconditions
- App running at `http://localhost:8080`
- **Run only against the Firebase emulator or a dedicated test project — never the live makwell-websiteandcrm data. Mark BLOCKED if traffic would reach the live project.** Confirm the target in DevTools > Network before step 1.
- Signed in as `distributor` at `/crm/login.html` with env vars `QA_CRED_DISTRIBUTOR_USERNAME` / `QA_CRED_DISTRIBUTOR_PASSWORD`. Note this account's uid as `DIST_UID`.
- Seed data (emulator/test project). Dealer `users/qa-auto-dealer-1` = `{ role: "dealer", name: "QA-AUTO Dealer Raichur", distributionType: "underDistributor", distributorUid: DIST_UID, phone: "9000000201", pincode: "584101", city: "Raichur", state: "Karnataka" }`. Models `qa-auto-gy15` / `qa-auto-gy25` as in T102. Then these `dealerOrders`, all with `dealerUid: "qa-auto-dealer-1"`, `dealerName: "QA-AUTO Dealer Raichur"`, `distributorUid: DIST_UID`:
  - `QA-AUTO-DO-A`: `status: "placed"`, `lines: [{ modelId: "qa-auto-gy15", qty: 2 }]`, `pricing: { status: "ok", issues: [] }`, `pricedLines: [...]`, `totals: { taxable: 10000, gst: 1800, total: 11800 }`, `orderId: "QA-AUTO-DO-A"`
  - `QA-AUTO-DO-B`: same as A, `orderId: "QA-AUTO-DO-B"` (to be rejected)
  - `QA-AUTO-DO-C`: `status: "placed"`, `lines: [{ modelId: "qa-auto-gy25", qty: 1 }]`, `pricing: { status: "incomplete", issues: ["QA-AUTO Geyser — GY-25L: no price set"] }`, `totals: null`
  - `QA-AUTO-DO-D`: `status: "confirmed"`, priced like A, `stockStatus: "ready"`, `stockAllocation: { "qa-auto-gy15": 2 }`
  - `QA-AUTO-DO-E`: legacy free-text `{ status: "confirmed", product: "QA-AUTO Legacy TV", quantity: 1 }` (no `lines`)
  - `QA-AUTO-DO-F`: `status: "dispatched"`, priced like A
  - `QA-AUTO-DO-X`: a dealer order whose `distributorUid` is a **different** distributor, used for the isolation check
- Stock serials `QA-AUTO-SN-0001` and `QA-AUTO-SN-0002` (model `qa-auto-gy15`) held by `DIST_UID` in `unitSerials`/`productStock`, so the server dispatch check can pass. If the dispatch Cloud Function is not running, mark TC-04 step 8 BLOCKED.

## Test data
- `rejectReason = "QA-AUTO reject — duplicate order"`
- `cancelReason = "QA-AUTO cancel — dealer request"`
- `transporter = "QA-AUTO Raichur Roadways"`, `docket = "QA-LR-584101"`, `vehicle = "KA36QA0001"`
- `serialsGood = "QA-AUTO-SN-0001\nQA-AUTO-SN-0002"`
- `serialsShort = "QA-AUTO-SN-0001"` (1 of 2)
- `legacyTransporter = "QA-AUTO Courier"`, `legacyDocket = ""`

## Steps

### TC-01: Happy path, approve a priced dealer order
1. Click the nav item **`Incoming Dealer Orders`**. Assert: `#page-sub` = `Approve, dispatch and deliver orders from dealers under you`, the panel is titled `Orders from your dealers`, and the tab `Awaiting approval` is highlighted.
2. Assert: cards `QA-AUTO-DO-A`, `QA-AUTO-DO-B`, `QA-AUTO-DO-C` are listed oldest first. Each shows `Dealer: QA-AUTO Dealer Raichur` and the pill `Awaiting approval`. `QA-AUTO-DO-X` is **not** listed.
3. Assert: card A shows buttons **`Approve`** and **`Reject`**, and **no** `Cancel` button (cancel is hidden while `placed`). No `Credit:` line is shown, because the credit check is company-mode only.
4. Assert: card C shows `Price incomplete: QA-AUTO Geyser — GY-25L: no price set`, the text `Can't approve until every line is priced`, a **`Re-price`** button, and no `Approve` button.
5. On card A, click **`Approve`**. Assert: confirm text `Approve QA-AUTO-DO-A — ₹11,800.00?`. It must not mention a GST invoice, because that applies only in company mode.
6. Dismiss the confirm. Assert: no change, and A is still listed under `Awaiting approval`.
7. Click **`Approve`** again and accept. Assert: the list re-renders and A disappears from `Awaiting approval`.
8. Click the tab **`Approved — to dispatch`**. Assert: card A is present with the pill `Approved`, and a `Stock:` line reading either `checking…`, `all units reserved — ready to dispatch`, or `Waiting for stock: …`.
9. Reload, then reopen the section and tab. Assert: A is still `Approved`.

### TC-02: Reject, dismissing the prompt first, then with a reason
1. Under `Awaiting approval`, click **`Reject`** on card B. Assert: the prompt `Reason for rejecting QA-AUTO-DO-B (shown to the buyer):` appears.
2. Press Cancel on the prompt. Assert: no change, and B is still listed.
3. Click **`Reject`** again, enter `rejectReason`, and press OK.
4. Assert: B leaves `Awaiting approval`. Open the tab **`Closed`** and assert that B shows the pill `Rejected` and `Note: QA-AUTO reject — duplicate order`.
5. Edge: repeat the reject on a fresh seeded placed order, pressing OK with an **empty** reason. Expected per source: it is accepted with a blank `statusNote`. Record this; the dealer sees no reason (observation).

### TC-03: Re-price an incompletely priced order
1. On card C, click **`Re-price`**. Assert: the button shows `Re-pricing…` and is disabled, and the list reloads after about 4 s.
2. Seed `priceLists/<DIST_UID>_default_qa-auto-gy25` with `price: 7000`, then click `Re-price` again. Assert: after the reload, card C shows a priced table with total `₹8,260.00` and an `Approve` button. This step needs the pricing function; otherwise mark it BLOCKED.

### TC-04: Dispatch with serials (order D)
1. Open the tab **`Approved — to dispatch`**. Card D shows `Stock: all units reserved — ready to dispatch` and the button **`Dispatch…`**.
2. Click **`Dispatch…`**. Assert: an inline form appears with `Transporter / courier`, `Docket / LR no.`, `Vehicle no.`, `Serials — <label> (2)`, a counter `0 of 2`, and the buttons **`Dispatch`** and **`Close`**.
3. Click **`Close`**. Assert: the inline form disappears and the status is unchanged.
4. Reopen it with `Dispatch…`. Leave Transporter empty, then click **`Dispatch`**. Assert: the error `Enter the transporter / courier.`
5. Enter `transporter`, then type `serialsShort` into the serials box. Assert: the counter shows `1 of 2`. Click **`Dispatch`**. Assert: the error `Enter exactly 2 serial(s) for each product.`
6. Replace the serials with `serialsGood`. Assert: the counter shows `2 of 2` in green.
7. Fill `docket` and `vehicle`, then click **`Dispatch`**. Assert: the button shows `Checking serials…` and the list reloads after about 3.5 s.
8. Open the tab **`Dispatched`**. Assert: card D has the pill `Dispatched` and the line `Dispatch: QA-AUTO Raichur Roadways · Docket QA-LR-584101 · KA36QA0001 · <date>`, and a `2 serial numbers` details element lists both serials. If D instead stays `Approved` with `Dispatch refused: <reason>`, record the reason and fail the step.

### TC-05: Legacy order dispatch (E) and cancel after approval
1. Under `Approved — to dispatch`, card E shows `QA-AUTO Legacy TV × 1 (older order — no price list)` and buttons **`Mark dispatched`** and **`Cancel`**.
2. Click **`Cancel`** on E. Assert: the prompt `Reason for cancelling  (shown to the buyer):` appears. E has no `orderId`, so expect a double space. Dismiss the prompt and assert there is no change.
3. Click **`Mark dispatched`** on E. Assert: the prompt `Transporter / courier name:`. Enter `legacyTransporter`. At the second prompt, `Docket / LR number (optional):`, leave it blank and press OK.
4. Assert: E moves to `Dispatched` with `Dispatch: QA-AUTO Courier · <date>`.

### TC-06: Mark delivered (F)
1. Open the tab **`Dispatched`**. On card F, click **`Mark delivered`**. Assert: the confirm `Mark as delivered <orderId> — ₹11,800.00?`. Dismiss it and assert there is no change.
2. Click again and accept. Assert: F leaves `Dispatched`. Under **`Closed`**, F shows the pill `Delivered`. Closed lists the newest first, and F has no action buttons.

### TC-07: Negative and edge cases
- Concurrency: open the section in two tabs. Approve A2 (a fresh placed order) in tab 1, then click `Reject` on A2 in tab 2. Assert: firestore.rules reject the stale transition, and the alert `Could not update this order — it may have changed. Refresh and try again.` appears.
- Isolation: in the console, `updateDoc` on `dealerOrders/QA-AUTO-DO-X` must be denied by the rules. `QA-AUTO-DO-X` never appears in any tab.
- An empty tab shows `Nothing here.`
- XSS: a seeded order whose `notes` is `<img src=x onerror=alert(1)>` renders the notes as text, with no alert.

## Assertions
- [ ] Only this distributor's dealers' orders are listed, and they are grouped correctly into the 4 tabs.
- [ ] Approve, Reject, Mark dispatched, Mark delivered, and Cancel each ask for confirmation or a prompt, and dismissing it leaves the state unchanged.
- [ ] Unpriced orders cannot be approved and offer `Re-price`.
- [ ] The dispatch form enforces the transporter and the exact serial count, with the verbatim messages.
- [ ] Status pills read `Awaiting approval`, `Approved`, `Dispatched`, `Delivered`, `Rejected`, `Cancelled`.
- [ ] No console errors in DevTools at any step (except the expected ones in TC-07).
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected.

## Screenshots required
- `Awaiting approval` tab initial load
- The Approve confirm dialog and the Reject prompt
- The dispatch inline form with each validation error
- Each tab after the happy path (`Approved — to dispatch`, `Dispatched`, `Closed`)

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
