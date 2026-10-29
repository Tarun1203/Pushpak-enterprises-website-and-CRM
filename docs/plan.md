# Plan

Updated 29 Oct 2026. The code and CI are healthy: functions 205/205, frontend units 38/38, regression gate 1335 passed, 0 failed across 20 suites, dependency audit clean. What is left is mostly owner action and data.

## Owner to do (cannot be done from code)

1. Publish the rules and functions, from the project folder in PowerShell:
   ```powershell
   cd functions; npm install; cd ..
   $env:FUNCTIONS_DISCOVERY_TIMEOUT=60
   firebase deploy --only functions,firestore:rules,storage
   ```
   The website publishes by itself through GitHub Pages.
2. Super Admin → Pincode Master: press "Fill districts on open tickets".
3. Create the Area Manager accounts.
4. Test a job closing with a code. Later, switch on "required" confirmation.
5. Enter the data the routing depends on: pincode master, rates, brand rules, locations, technician areas. **Without the pincode master every website ticket falls to manual routing.**
6. Sign up for MSG91 (DLT templates for SMS, Meta-approved templates for WhatsApp) before switching messaging on.
7. Work through `docs/go-live-confirmations.json` (20 items) and run `scripts/stamp-release.mjs` before deploying.

## Engineering backlog, in suggested order

| # | Item | Why |
|---|---|---|
| 1 | **Customer site ticket not showing** (Service Center requests and Super Admin → Service). Needs a ticket number (PE-SVC-…). Use the checklist in [debugging.md](debugging.md) first | Open owner issue |
| 2 | **App Check** on Firestore and a limit on anonymous booking and contact writes | The one real abuse gap ([security.md](security.md)) |
| 3 | Security headers through Cloudflare or Firebase Hosting in front of `makwell.co` | Pages cannot set them |
| 4 | Make the Super Admin → Service list resilient: run the auto-route fallback in its own `try`, so one failing query cannot blank the whole table | A single failure currently hides every row |
| 5 | Delete the stale `assets/logos/` copy of the old site | Public, confusing, 43 files |
| 6 | SEO: `sitemap.xml`, canonical links, Open Graph and social images, schema.org data, meta descriptions on `portal.html` and `product.html` | None exist today |
| 7 | Convert referenced images to WebP where useful | Hero images already are; the heavy PNGs are unreferenced |
| 8 | Offline mode | Open from the original list |
| 9 | Tooltips and optimistic UI in the CRM | Polish |

## How we work

- Fix the root cause and add a test.
- Run the suite, then push to `main`. Say clearly whenever a rules or functions publish is needed.
- Screenshots of problems are welcome.
