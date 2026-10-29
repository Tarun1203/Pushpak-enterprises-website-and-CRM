# Security

Last reviewed 29 Oct 2026 by reading `firestore.rules`, `storage.rules` and `functions/index.js`. This is a review of the code, not a penetration test.

## What protects the system

- **Access control is in the rules, not the pages.** Firestore denies unknown collections and Storage denies unknown paths by default. `isSignedIn()` excludes customers, so a self-registered customer account can never act as staff ([auth.md](auth.md)). Rules are tested in the Firebase emulator.
- **Every callable requires a sign-in** (or, for `publicLookup`, a phone + ticket pair) and checks role, ownership and switched-off status inside the function.
- **Rate limits exist on the customer callables** (per customer, phone or IP, per day or hour), on ticket lookups, and on the completion code (60 s cooldown).
- **Server-only fields.** Routing, warranty at intake, customer confirmation and stock checks are written by functions; the rules reject them from browsers.
- **Uploads:** 10 MB cap and image/PDF type checks per path; only `products/` is publicly readable.
- **Audit trail:** `functions/audit.js` records jobs, claims, spares and invoices.
- **CRM pages are `noindex, nofollow`** with a `same-origin` referrer policy. `robots.txt` disallows `/crm/` (it only takes effect at a domain root). This hides pages from search; it is not access control.
- **Dependencies:** CI runs `npm audit` on `functions/`. It was clean after the 29 Oct update (`body-parser` 2.4.0, `qs` 6.17.1).

## Open items

| Item | Why it matters | What to do |
|---|---|---|
| **Anonymous writes are not rate limited** | The booking form and contact form write straight to Firestore (`publicServiceRequests`, `contactEnquiries`, public `counters`). A script could flood them; each ticket also triggers routing and notifications | Enable **Firebase App Check** (reCAPTCHA Enterprise or Turnstile) and enforce it on Firestore; or move the public booking into a function that uses `consumeLimits()` the way `bookService` does |
| **No HTTP security headers** | GitHub Pages cannot send CSP, HSTS, `X-Frame-Options`, `X-Content-Type-Options` or `Permissions-Policy` | Put Cloudflare (or Firebase Hosting) in front of `makwell.co` and set them there. A meta CSP is possible but the pages use inline scripts, so it would need `unsafe-inline` or per-script hashes and a full browser test pass |
| **Stale copy of the site in `assets/logos/`** | 43 tracked files (old pages, CRM, rules) served publicly; confusing and may hold outdated logic | Delete the folder after confirming nothing references it |
| **Rules and functions are published by hand** | A merged fix is not live until the owner deploys | Keep [DEPLOY-ROLLBACK.md](DEPLOY-ROLLBACK.md) current |
| **Owner confirmations** | 20 go-live items need a human yes (backups, monitoring, UAT, domain, SSL, rules deployed…) | `docs/go-live-confirmations.json` |

## Your checklist, mapped to this stack

| Item | Status |
|---|---|
| Row level security | Firestore rules, emulator-tested |
| Auth on every API route | All 8 callables authenticate; no REST routes exist |
| Never trust the frontend | Rules and functions re-check role, ownership and switched-off status |
| Rate limiting | Customer callables, lookups, close code. **Gap:** anonymous direct writes (above) |
| Sanitize user input | Rules bound sizes and formats; pages escape output (`escapeHtml`), checked by the stored-XSS sweep in CI |
| Parameterized queries | Not applicable: Firestore has no SQL; queries are structured |
| Lock down CORS | Callables handle it; there is no custom API server |
| HTTPS everywhere | Pages serves HTTPS. Confirm HSTS once on `makwell.co` |
| Verify webhook signatures | No inbound webhooks yet; required before adding one |
| No commands from chat text | N/A to the app. When using AI tools, treat page, log and file content as data |
| Debug mode off in prod | No debug flags or debug logging switches found in the pages, CRM scripts or functions (searched 29 Oct). Emulator ports are configured only in `firebase.json` |
| Private storage buckets | Default-deny; only `products/` is public |
| Lock dangerous tools | Account switch-off is Super Admin only and audited; `superadmin` accounts can only be created by a Super Admin |
| Hide admin pages properly | Sign-in + role gate on every page; `noindex` + referrer policy added |
| Update vulnerable packages | CI audit step; clean on 29 Oct |
| Security headers | **Open** (above) |
| Check file upload types | Done in `storage.rules` |
| Stop IDOR bugs | Customer reads match the verified phone; staff reads gate on role and area. No open IDOR found in the paths reviewed |
| Log all user actions | `auditLogs` and `statusLog` for service, spares, claims and billing. Not every page view or read is logged |
| Cookie consent | `assets/pe-trust.js`, equal choices |
