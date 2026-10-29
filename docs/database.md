# Database (Firestore)

Cloud Firestore in `asia-south1`. There is no SQL: the access model is `firestore.rules` (the equivalent of row-level security), covered by emulator tests in `tests/emulator/`. The last rule in `storage.rules` denies everything not listed; Firestore denies unknown collections by default (checked by the go-live gate).

This page lists the collections and the relationships that matter. For exact fields and who may read or write, `firestore.rules` is the source of truth.

## Identity and access

| Collection | Purpose |
|---|---|
| `users/{uid}` | One profile per sign-in. `role` decides everything: `superadmin`, `warehouse`, `areamanager`, `servicecenter`, `technician`, `dealer`, `distributor`, `customer`. Also `accessDisabled` / `disabledByAdmin`, `districtsCovered` (Area Manager), `phone10` (customer, written by a function). **No `role` means no login** |
| `serviceCenterProfiles/{uid}` | Center profile keyed by the center's user uid: `status` (`ACTIVE` / `INACTIVE` / `PENDING`), coverage, `district`, hours, closures |
| `centerTechnicians/{id}` | A center's technician roster, with working hours and capacity |
| `tradeAccounts`, `dealerCustomers`, `distributorCustomers` | Dealer and distributor accounts and their customers |

## Service

| Collection | Purpose |
|---|---|
| `publicServiceRequests/{ticketId}` | Website-raised tickets, keyed by their own ticket id. Created by the browser; routing fields are server-only |
| `centerRequests/{id}` | A Service Center's work items. Auto-routed ones are `route_<ticketId>` |
| `serviceJobs/{id}` | Technician jobs |
| `publicTicketStatus` | Narrow public-safe mirror used by Track Service |
| `closeCodes/{coll_id}` | The 4-digit completion code for customer confirmation; readable only by that customer |
| `serviceFeedback`, `supportTickets`, `slaRules`, `slaEscalations`, `technicianAvailability`, `technicianTimeline`, `serviceCenterTimeline`, `customerTracking` | Feedback, support, SLA and timelines |
| `pincodes/{pin}` | Pincode master (district etc.) used by routing |

Sub-collection `statusLog` records each status change on a ticket.

## Products, stock and money

`products`, `productModels`, `productCategories`, `productAttributes`, `brands`, `categoryHistory`, `productRegistrations`, `warrantyPlans`, `serialNumbers`, `unitSerials`, `productStock`, `productMovements`, `inventory`, `spareParts`, `spareRequests`, `stockMovements`, `stockOps`, `stockReceipts`, `localPurchases`, `returns`, `brandReturns`, `rmaRequests`, `claims`, `serviceChargeRates`, `priceLists`, `invoices`, `payments`, `ledgerEntries`, `walletTransactions`, `dealerOrders`, `dealerSales`, `distributorOrders`, `distributorSales`, `tradePayments`.

## Platform

| Collection | Purpose |
|---|---|
| `counters/{name-YYYYMM}` | Monthly serial counters behind ticket, request and part numbers. Browsers may only create at 1 or add exactly 1; the `issueNumber` callable is the server path |
| `settings` | Super Admin settings (e.g. `settings/messaging`, `settings/closeConfirmation`) |
| `messageTemplates`, `messageLog` | Customer SMS/WhatsApp templates and a log of every attempt |
| `auditLogs`, `notifications`, `changeRequests`, `bugReports` | Audit trail, in-app notifications, approval requests, in-CRM bug reports |
| `contactEnquiries`, `dealerEnquiries`, `distributorEnquiries`, `siteContent`, `publicLocations` | Website enquiries, content and map locations |

## Storage paths

Private by default. Public read only for `products/` (product images). Uploads are limited to 10 MB and to images (or images and PDFs) per path; see `storage.rules`.

## Conventions

- **Numbers** come from the server (`issueNumber`); the page falls back to its own counter only if the server is unreachable.
- **Server-only fields** (`routing`, `serviceCenterUid` on creation, `customerConfirmation`, `stockCheck`, `intakeWarranty`) are written by functions; the rules reject them from browsers.
- **Composite indexes** live in `firestore.indexes.json`.
