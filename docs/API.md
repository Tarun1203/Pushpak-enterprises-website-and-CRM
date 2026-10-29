# API (Cloud Functions)

All functions live in `functions/index.js`, region `asia-south1`, Node 22. There is no REST server: the browser calls **callable** functions with the Firebase SDK, and everything else is a Firestore or schedule **trigger**.

## Callable functions

| Function | Who may call | What it does | Abuse limits |
|---|---|---|---|
| `publicLookup` | Anyone | Track a ticket (phone + ticket id), or look up warranty / registrations by phone | `lookupRateGuard`: per IP, phone and ticket |
| `ensureCustomerProfile` | Signed-in customer | Creates the customer's `users/{uid}`; the phone comes from the verified OTP token, never from the page | — |
| `registerProduct` | Signed-in customer | Registers a product and matches a warranty plan | 10 per customer per day; duplicate-serial check |
| `checkWarranty` | Signed-in customer | Warranty status for a serial number | 20 per customer and 60 per IP per hour |
| `bookService` | Signed-in customer | Creates a service request, optionally for a registered product | 6 per phone per day |
| `supportTicket` | Signed-in user | Customer support tickets and admin replies | 5 new tickets per phone per day |
| `sendCloseCode` | The job's technician or center, Super Admin, Warehouse | Sends the customer completion code | 60-second cooldown per job; fails if the account is switched off |
| `issueNumber` | Staff, by role per number kind | Issues request / job / claim / spare-request numbers from the monthly counters | Role-gated |

`consumeLimits()` in `index.js` is the shared limiter; it keeps counters in Firestore.

## Triggers

| Group | Functions |
|---|---|
| Routing and tickets | `routePublicServiceRequest`, `trackOnPublicRequest`, `stampDistrict_centerRequests`, `stampDistrict_serviceJobs`, `stampDistrict_publicServiceRequests`, `checkAssignmentOnCreate`, `checkAssignmentOnUpdate`, `checkLifecycle_*` (verifies the customer confirmation when a job closes) |
| Service centers and technicians | `assignServiceCenterCode`, `assignTechnicianCode`, `guardServiceCenterProfile`, `guardTechnicianDocs`, `syncAccess_users`, `syncAccess_serviceCenterProfiles`, `syncAccess_centerTechnicians` |
| Spares and stock | `flagDuplicateSpareRequest`, `checkSparePipeline`, `sparesOpCreated`, `sparesOpDecided`, `trackSpareEvent`, `processStockReceipt`, `lowStockAlert` |
| Claims, returns, billing | `checkClaim`, `claimUpdated`, `applyBillingRequest`, `rmaUpdated`, `processBrandReturn`, `applyChangeRequest`, `applyTradePayment` |
| Customer side | `processFeedback`, `checkRegistrationSerial` |

## Scheduled

- `escalationSweep` — SLA breach alerts. Order of rules: district, then service type, then the 24/48 h default. Each alert goes once to Super Admin, the district's Area Managers and the center.
- `documentExpiryCheck` — daily at 08:00 IST. Sends one reminder per stage before a service center's or technician's documents expire, to the center (and the technician for their own) and to Super Admin. `docExpiryAlerts` remembers what was already sent. Expired documents are flagged on screen; work is not blocked.

## Customer messaging

`functions/messaging.js` sends SMS/WhatsApp through MSG91 for: request received, technician assigned, visit scheduled, job completed, completion code. It does nothing until it is switched on (see [integrations.md](integrations.md)). Every attempt is written to `messageLog`.

## Calling from the browser

Customer pages use `httpsCallable(functions, '<name>')` on the `asia-south1` functions instance. Failures come back as `HttpsError` codes (`unauthenticated`, `permission-denied`, `resource-exhausted`, `invalid-argument`, `failed-precondition`) with a message that is safe to show the user.
