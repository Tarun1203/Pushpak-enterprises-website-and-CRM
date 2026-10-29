# Architecture

Pushpak Enterprises runs one multi-brand platform (MakWell, Flyvision, Skevia): a public website and a central CRM on one Firebase backend. There is no framework and no build step: plain HTML and JavaScript, with the Firebase JS SDK 10.13.0 imported from gstatic.

```text
Browser (public site, portal, CRM)  ──►  Firebase project makwell-websiteandcrm
  static HTML/JS on GitHub Pages          ├─ Authentication   (email+password staff; phone OTP customers)
                                          ├─ Firestore        (rules: firestore.rules)
                                          ├─ Storage          (rules: storage.rules)
                                          └─ Cloud Functions  (asia-south1, Node 22, functions/)
```

## Front end

| Area | Files |
|---|---|
| Public site | `index.html` (landing, book/track service, register product), `product.html` (live product page), `portal.html` (customer "My Service", phone-OTP sign-in), `privacy.html`, `terms.html`, `cookies.html`, `404.html` |
| Brand sub-sites | `makwell/`, `flyvision/`, `skevia/` |
| Shared public assets | `assets/` — `pe.js`, `locator.js` (store/service-center map; self-hosted Leaflet + OpenStreetMap tiles), `pe-trust.js` (cookie consent, accessibility), `motion-system.*`, `assets/fonts/` (self-hosted Inter and Manrope, `font-display: swap`) |
| CRM | `crm/CRM<role>.html` for superadmin, warehouse, areamanager, servicecenter, technician, dealer, distributor. `crm/login.html` routes each user by `users/{uid}.role` |
| Shared CRM code | `crm/ui.css`, `crm/ui.js` (presentation only), `crm/live.js`, `crm/resilience.js` (double-tap guard), `crm/stockOps.js` |
| CRM modules | `areamanager.js`, `close-confirm.js`, `messages-admin.js`, `numbers.js`, `rate-approvals.js`, `locations-admin.js` |

`crm/` is listed in `.gitignore`. Files already tracked stay tracked; **new files under `crm/` need `git add -f`**.

`assets/logos/` also holds an old (25 Sep) copy of the whole site, CRM pages and rules. Nothing references it; it is published by Pages and is a candidate for deletion.

## Back end (`functions/`)

`functions/index.js` registers every function; the business logic lives in small modules that are unit-tested on their own (`routing`, `billing`, `lifecycle`, `escalation`, `closeConfirm`, `messaging`, `numbers`, `district`, `lookup`, `customer`, `access`, `audit`, `stock`, `spares` and others). Function list: [API.md](API.md).

## The main flow: a website service request

1. The customer submits the booking form on `index.html`. It writes `publicServiceRequests/<PE-SVC-YYYYMMDD-NNNN-CustomerSite>` straight from the browser (no sign-in; the rule validates the fields).
2. `routePublicServiceRequest` picks a center by pincode / district / brand / category (`functions/routing.js`), writes `centerRequests/route_<ticket>` for that center and marks the public ticket `assigned_to_center`.
3. If no center matches, it tries a technician who covers the area; otherwise the ticket gets `routing.status = "manual"` plus a reason and waits for Super Admin or an Area Manager.
4. A Service Center only ever sees `centerRequests`; Super Admin → Service also lists the original website tickets.
5. District is stamped on every ticket by the `stampDistrict_*` triggers, which is what scopes Area Managers.

## Delivery

- **Website:** `pages.yml` publishes to GitHub Pages on every push to `main`.
- **Rules and functions:** published by the owner by hand (see [DEPLOY-ROLLBACK.md](DEPLOY-ROLLBACK.md)). A push to `main` never deploys them.
- **CI:** `automated-qa.yml` (see [testing.md](testing.md)).

## Limits worth knowing

- GitHub Pages cannot set HTTP response headers, so CSP, HSTS and `X-Frame-Options` need a proxy such as Cloudflare in front ([security.md](security.md)).
- The anonymous website forms write to Firestore directly, so they are not rate limited by a function.
