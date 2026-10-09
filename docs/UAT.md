# User Acceptance Test (UAT) matrix

How to use: log in with a **test** account for each role (see TRAINING.md, "Training data"), do the steps, tick **Pass** or write what went wrong. "Automated cover" shows which automated test already checks the same thing; it does not replace a real person doing it once on a real phone/computer.

Sign-off: each role's tester signs the bottom of their table. Go-live needs all rows Pass (or a written, accepted exception in KNOWN-ISSUES.md).

## Admin (Head Office / Super Admin)
| # | Steps | Expected | Automated cover | Pass |
|---|---|---|---|---|
| A1 | Sign in, open dashboard | Admin dashboard opens, no error banner | `phase10-roles.spec.js` | ☐ |
| A2 | Create a user (each role) | Account created with correct role; shows in Users | `rules.test.mjs` (user create) | ☐ |
| A3 | Switch a technician off, then try to sign in as them | Cannot sign in; reason shown | `phase10a.test.js` P10.2, `phase10-roles.spec.js` | ☐ |
| A4 | Add a service center and a technician with working hours | Saved; technician offered only on working days | `phase10a.test.js` P10.5 | ☐ |
| A5 | Add masters: pincode, territory, product, category, spare | Duplicates refused/flagged | `phase10a.test.js` P10.4 | ☐ |
| A6 | Approve a claim, record the payment | Status moves; payment shows; audit entry written | `phase9*.test.js`, `phase10b.test.js` P10.15 | ☐ |
| A7 | Open Audit log, filter by a job/claim | Shows who created/changed/closed it | `phase10c.test.js` P10.15 | ☐ |
| A8 | Print a warranty card and a claim voucher (A4 and A6) | Correct details; prints on the chosen paper | `phase10-field.spec.js` | ☐ |

## Service Center
| # | Steps | Expected | Automated cover | Pass |
|---|---|---|---|---|
| S1 | Sign in, view requests | Only this center's requests | `rules.test.mjs`, `phase10-roles.spec.js` | ☐ |
| S2 | Accept and assign a request to a technician | Technician sees it; wrong-brand technician warned/blocked | `phase10b.test.js` P10.6 | ☐ |
| S3 | Book an appointment on a holiday/outside hours | Refused with a reason | `phase10a.test.js` P10.5 | ☐ |
| S4 | Request a spare, receive it, transfer to technician | Stock moves, never below zero | `phase10b.test.js` P10.7 | ☐ |
| S5 | Verify repair, close the service | Status closed; voucher prints | `phase9*.test.js`, `phase10-field.spec.js` | ☐ |

## Technician (do this on a real phone)
| # | Steps | Expected | Automated cover | Pass |
|---|---|---|---|---|
| T1 | Sign in, open My Jobs | Only own jobs; no sideways scrolling | `phase10-field.spec.js` (320/360px) | ☐ |
| T2 | Accept job, set appointment | Saved; clash refused | `phase9*.test.js` | ☐ |
| T3 | Diagnose, request spare | Request reaches the center | `phase10b.test.js` | ☐ |
| T4 | Consume spare | Spare Bag reduces; cannot go below zero | `phase10b.test.js` P10.7 | ☐ |
| T5 | Repair, close with outcome and photo | Closed; customer can see completion | `phase9*.test.js` | ☐ |
| T6 | Turn Wi‑Fi/data off, tap Save | Offline notice shown; nothing lost silently | `browsers.spec.js` | ☐ |
| T7 | Tap Save twice quickly | Saved once | `browsers.spec.js`, `phase10c.test.js` | ☐ |

## Warehouse
| # | Steps | Expected | Automated cover | Pass |
|---|---|---|---|---|
| W1 | Open inventory | Own stock only | `phase8` tests, `rules.test.mjs` | ☐ |
| W2 | Receive stock | Quantity up, ledger line written | `phase8` tests | ☐ |
| W3 | Approve a spare request, dispatch with docket | Challan prints; status dispatched | `phase10-field.spec.js` | ☐ |
| W4 | Receive a defective return | Return recorded; stock unchanged for defectives | `phase8` tests | ☐ |

## Customer (website)
| # | Steps | Expected | Automated cover | Pass |
|---|---|---|---|---|
| C1 | Register a product, see warranty | Warranty dates correct | `phase7` tests | ☐ |
| C2 | Book a service, track it | Tracking page shows status/appointment | `phase7` tests | ☐ |
| C3 | Open a CRM link while signed in as customer | Refused | `phase10-roles.spec.js` | ☐ |
| C4 | Give feedback after completion | Saved | `phase9*.test.js` | ☐ |

Signed off by: Admin ______  Service Center ______  Technician ______  Warehouse ______  Date ______
