# T055-crm-superadmin-service-ticket-routing: Service ticket intake → route to center → assign technician (incl. no product model)

| Field | Value |
|---|---|
| Route | `/crm/CRMsuperadmin.html` → nav **Service** |
| Source | `crm/CRMsuperadmin.html` (`renderServiceOverview` ~5901, `loadServiceOverview` ~5975, `openSvcTicketPopup` ~6094, `renderRoutingControlsForPublicRequest` ~6214, `renderRoutingControlsForCenterRequest` ~6273, `routeRequestToCenter` ~8365, `autoRouteExactPincodeMatches` ~8412, `backfillPublicTracking` ~5927); `functions/routing.js` |
| Flow | A website service request (`publicServiceRequests`) appears in Service. Super Admin routes it to a center (creating a `centerRequests` doc that keeps the same ticket ID), then assigns a technician. The ticket ID format is checked along the way. |
| Requires auth | yes |
| Required role | superadmin |
| Destructive | no |
| Estimated steps | 35 |

> **Scope gap, read first.** `CRMsuperadmin.html` has **no "create service request" form** and **never generates a ticket number**. `routeRequestToCenter` copies `requestId` from the website request, or falls back to the Firestore doc id when `requestId` is missing. The format `PE-KA-{TYPE}-{YYMMDD}-{DISTRICT}{RANDOM}{SOURCE}` is created upstream, on the public Book-a-Service flow or a Cloud Function. This task checks that the format survives intact through Super Admin routing. The generator itself belongs in the public-site / Service Center tasks.

## Preconditions
- App running at `http://localhost:8080`
- Signed in as `superadmin` (env `QA_CRED_SUPERADMIN_USERNAME` / `QA_CRED_SUPERADMIN_PASSWORD`).
- **Run only against the Firebase emulator or a dedicated test project — never the live makwell-websiteandcrm data.** The page hard-codes the live `makwell-websiteandcrm` config with no emulator switch. If DevTools → Network shows Firestore/Auth traffic going to the live project, **mark this task BLOCKED** and stop.
- T052 accounts exist: `QA-AUTO Service Center {runId}` (covers district `Raichur`, pincode `584101`, brands MakWell + Flyvision) and `QA-AUTO Technician {runId}` (MakWell, skill `QA-AUTO Geyser {runId}`), not suspended.
- Pincode `584101` exists in the Pincode Master with District `Raichur`.
- Two website requests exist, both with **no product model selected** (`modelNo: ""`). Create them with the public Book-a-Service form on `http://localhost:8080/` if available. Otherwise seed `publicServiceRequests` directly and mark TC-01 `BLOCKED (seeded, generator not exercised)`:
  - `REQ-SK` (forces manual routing, because the brand is not authorized at the covering center): `customerName "QA-AUTO Customer SK {runId}"`, `customerPhone "9000000101"`, `address "QA-AUTO 1 Station Road"`, `city "Raichur"`, `pincode "584101"`, `brand "skevia"`, `category "QA-AUTO Geyser {runId}"`, `modelNo ""`, `requestType "repair"`, `issueDescription "QA-AUTO {runId} no hot water"`, `status "new"`.
  - `REQ-MW`: the same but with `customerName "QA-AUTO Customer MW {runId}"`, `customerPhone "9000000102"`, `brand "makwell"`.

## Test data
- `ticketRegex = ^PE-KA-[A-Z]+-\d{6}-[A-Z0-9]+$` (loose: the PE-KA prefix, a TYPE word, YYMMDD, then DISTRICT+RANDOM+SOURCE)
- `todayYYMMDD` = the creation date in IST, formatted `YYMMDD`
- No form fields are typed on this page. Data comes from the seeded requests above.

## Steps

### TC-01: Ticket ID format at intake
1. Read the `requestId` of `REQ-SK` and `REQ-MW` (Firestore, or the public confirmation screen).
2. Assert: both match `ticketRegex`. The 6-digit block equals `todayYYMMDD`. The TYPE segment reflects repair (e.g. `SR`/`REP`, as defined by the generator). The DISTRICT segment reflects Raichur. The SOURCE suffix reflects website.
3. Assert: the two IDs are different.
4. If `requestId` is missing on either doc, record the defect `publicServiceRequests created without requestId — Super Admin falls back to raw doc id`.

### TC-02: Website requests appear in Service with correct auto-route behaviour
1. Click nav **Service**. Assert: `#page-title` = `Service`, `#page-sub` = `All service activity, company-wide`, and table headers `Source | ID | Customer | Assigned To | Status`.
2. Assert: `REQ-MW` is auto-routed, either by the `routePublicServiceRequest` Cloud Function (within seconds) or by the in-page fallback (once the request is older than 2 min, with banner `Auto-routed 1 request(s) by exact pincode match — sent straight to the covering service center.`). Its Website row shows Status `Assigned to Center`, and a `Service Center` row with the **same ID** shows Status `New`.
3. Assert: `REQ-SK` stays on its Website row with Status `New`. If the fallback ran, the red banner shows `1 request(s) matched a pincode but not a brand-authorized center — left below for manual routing.`

### TC-03: Manually route REQ-SK (no product model)
1. Click the ID link of the `REQ-SK` Website row. Assert: the dialog title equals the ticket ID. The body shows `Customer: QA-AUTO Customer SK {runId}`, `Phone: 9000000101`, `Address: QA-AUTO 1 Station Road`, `Issue: QA-AUTO {runId} no hot water`. If the Cloud Function ran, it also shows `Needs manual routing: covering center(s) are not authorized for this brand`.
2. Assert: the actions area shows **Route to service center**, a select `Select service center…`, and an **Assign** button.
3. Click **Assign** with nothing selected. Assert: alert `Select a service center first.` and no write.
4. Select the option `QA-AUTO Service Center {runId} — ✓ district, ⚠ not brand-authorized`, then click **Assign**.
5. Assert: the dialog closes and the list reloads. The `REQ-SK` Website row shows `Assigned to Center` and Assigned To `QA-AUTO Service Center {runId}`. A new `Service Center` row has the **identical ticket ID** and Status `New`.
6. Assert in Firestore: the new `centerRequests` doc has `requestId` equal to the website ID, `modelNo: ""`, `product: "skevia QA-AUTO Geyser {runId}"`, `type: "service"`, `status: "new"`, and `sourceRequestId` equal to the website doc id. Its `statusLog` holds one entry `new` with note `Routed to QA-AUTO Service Center {runId}`.
7. Assert: a `notifications` doc exists for the center's uid with title `New service request routed to you`.

### TC-04: Assign a technician directly
1. Click the ID link on the new `Service Center` row (status `New`, no technician). Assert: the heading **Assign a technician**, a select `Select technician…`, and an **Assign** button.
2. Assert: `QA-AUTO Technician {runId}` is listed. Because the brand is skevia and only the skill matches, its flag is `✓ partial match`.
3. Click **Assign** with nothing selected. Assert: alert `Select a technician first.`
4. Select the technician and click **Assign**. Assert: the row shows Assigned To `QA-AUTO Technician {runId}` and Status `Assigned`. The `statusLog` has an entry `assigned` with note `Assigned to QA-AUTO Technician {runId}`, and a notification `New job assigned` exists for the technician uid.
5. Reopen the ticket. Assert: **Status history** lists `New` then `Assigned`, each with timestamp and `by <email>`. A **Raise RMA** button is present. Click **Close**.

### TC-05: Reassign from the Website row
1. Open the `REQ-MW` Website row (status `Assigned to Center`). Assert: the heading `Reassign — currently at <center>`, the current center tagged `(current)`, and a section **Or assign a technician directly** if the linked request has no technician yet.
2. Click **Close** without changes. Assert: no writes.

### TC-06: Backfill website tracking
1. Click **Backfill website tracking**. Assert: the button shows `Backfilling…`, then the green `Done — N ticket(s) are now trackable on the website` (with `, M skipped (no customer phone on file)` when M > 0).
2. Assert: `publicTicketStatus/{REQ-SK id}` exists with `customerPhone: "9000000101"` and `status: "assigned"`.

### TC-07: Negative & edge cases
- A website request seeded **without** `requestId`: route it and assert the outcome. The centerRequests `requestId` equals the raw Firestore doc id, which breaks the PE-KA format. Log it as a defect.
- A seeded `centerRequests` ticket with status `completed`: open it and click **Move to Verification**. Assert: status `Verification`, then **Close Job** gives `Closed`, then **Reopen** sets the stored status to `Assigned` (not `reopened`), and each step adds a `statusLog` entry and an `auditLogs` `status_changed` row.

## Assertions
- [ ] Ticket IDs match `ticketRegex` with today's YYMMDD, and the ID is identical across the Website and Service Center rows.
- [ ] Routing with no product model succeeds (`modelNo: ""`) and builds the product label from brand + category.
- [ ] Empty-selection alerts `Select a service center first.` and `Select a technician first.` appear.
- [ ] Status history, notifications and the backfill message appear as specified.
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected.

## Screenshots required
- Service list initial load (with any auto-route banner)
- Ticket popup for REQ-SK before routing
- Service list after routing (Website + Service Center rows with the same ID)
- Assign-technician popup and the status history after assignment
- Backfill result message

## Pass criteria
All TCs above pass AND no unexpected console/network errors. TC-01 may be BLOCKED if the requests were seeded rather than generated.
