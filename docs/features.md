# Features

What exists today. Status: **Live** (built, tested and pushed), **Built, needs owner action** (code is done, something must be switched on, entered or deployed), **Open** (not built).

"Live" means the code is on `main`. Anything backed by a Cloud Function or a rule only works in production after the owner publishes them ([plan.md](plan.md)); the repository cannot tell which version is currently deployed.

## Public website and customer portal

| Feature | Status |
|---|---|
| Multi-brand landing page and brand sub-sites (MakWell, Flyvision, Skevia) | Live |
| Live product pages from the product master (`product.html`) | Live |
| Book a service or installation request (no sign-in) | Live |
| Track a request by ticket + phone | Live |
| Register a product, check warranty by serial number | Live |
| Customer portal "My Service": phone-OTP sign-in, tickets, registrations, completion code, support tickets | Live |
| Find a store / service center on a map | Live (Super Admin manages the places) |
| Privacy policy, terms, cookie policy, consent banner with equal choices | Live |
| Accessibility: keyboard use, contrast, WCAG 2.2 AA checks on every page | Live |

## CRM

| Feature | Status |
|---|---|
| Role dashboards: Super Admin, Warehouse, Area Manager, Service Center, Technician, Dealer, Distributor | Live |
| Automatic routing of website requests by pincode / district / brand / category, with manual fallback | Live (needs pincode master and center coverage data) |
| Direct technician service for areas with no center | Live |
| Area Manager portal: coverage gaps, routing, SLA, approvals, reports with CSV | Built; needs the owner's rules and functions publish, then Area Manager accounts |
| Who pays: rate card per row, with per-brand overrides (e.g. Skevia demo/installation/service free) | Live |
| Line-by-line approval of rate requests | Live |
| Installation jobs with their own outcomes and checklist | Live |
| Appointment scheduling with server-enforced working hours, closures and daily capacity | Live |
| Spare requests, dispatch audit (stock movement vs quantity, no negative warehouse stock) | Live |
| Customer confirmation when a job closes (4-digit code or signature) | Built; **optional**, off by default (`settings/closeConfirmation.required`) |
| SLA alerts: district rule, then service type, then 24/48 h default | Live |
| Account switch-off by Super Admin, enforced in the rules | Live |
| Server-issued request/job/claim/spare numbers | Live |
| Bug Tracker and My Bugs inside the CRM | Live |
| Skeleton loaders and empty states on CRM lists | Live |

## Customer messaging (MSG91)

Built, **off**. Needs the switch in Super Admin, template IDs, the `MSG91_AUTHKEY` and a functions deploy. See [integrations.md](integrations.md).

## Open

- Offline mode.
- Data entry by the owner: pincode master, rates, brand rules, locations, technician areas.
- Go-live confirmations in `docs/go-live-confirmations.json`.
- App Check and security headers ([security.md](security.md)).
- Tooltips beyond the existing row hints, and optimistic UI updates (writes currently wait for the server).
