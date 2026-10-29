# AGENTS.md

Guidance for AI coding assistants (and new developers) working in this repository.

## What this is

Pushpak Enterprises' website and CRM for the brands MakWell, Flyvision and Skevia. Plain HTML and JavaScript, Firebase backend (project `makwell-websiteandcrm`, functions in `asia-south1`, Node 22). Live site: https://tarun1203.github.io/Pushpak-enterprises-website-and-CRM/ — it republishes on every push to `main`.

Read first: [docs/architecture.md](docs/architecture.md), [docs/database.md](docs/database.md), [docs/auth.md](docs/auth.md), [docs/testing.md](docs/testing.md). Everything is indexed in [docs/index.md](docs/index.md).

## Commands

```bash
cd functions && npm install && npm test   # 205 tests, no Firebase needed
npm install && npm run test:unit          # 38 frontend unit tests (repo root)
npx playwright test                       # browser tests (npx playwright install first)
```

## Conventions

- **No framework, no build step.** Do not introduce one.
- **`crm/` is git-ignored.** New files there need `git add -f`.
- **Business logic goes in `functions/` modules** that can be tested without Firebase; `functions/index.js` only wires them.
- **The browser is never the authority.** Add or change a rule in `firestore.rules` / `storage.rules` whenever you add data access, and a test in `tests/emulator/`.
- **Server-only fields** (`routing`, `customerConfirmation`, `stockCheck`, …) are written by functions; keep the rules rejecting them from browsers.
- **Every change gets a test.** After adding tests, raise the minimums in `tests/regression-baseline.json` and add a row to `tests/REGRESSION.md`.
- **Tests must not depend on today's date or weekday**, and must not type into hidden modal fields without `revealModals()` ([docs/testing.md](docs/testing.md)).
- **Keep "Loading…" text in the page**; skeleton loaders are drawn by CSS over it.
- **Escape everything rendered into HTML** (`escapeHtml`). A stored-XSS sweep runs in CI.
- **Third parties:** list them in `docs/THIRD-PARTY.md` and `privacy.html` before adding one.

## Things not to do without the owner's say-so

- Publish rules or functions (`firebase deploy`). The owner does this; always say clearly when a publish is needed.
- Change production data, switch on customer messaging, or make job confirmation mandatory.
- Put secrets in the repo. `functions/.env` is git-ignored; CI uses GitHub secrets.
- Push to `main` only when asked. A push publishes the site.

## How the owner likes to work

Plain, short answers. Fix the root cause and add a test. Push to `main` when done. Screenshots of problems are welcome.

## Gotchas

- `assets/logos/` holds a stale 25 Sep copy of the whole site; do not edit it, and do not search it when looking for current code.
- A Service Center sees only `centerRequests`; website tickets live in `publicServiceRequests` until `routePublicServiceRequest` copies them ([docs/debugging.md](docs/debugging.md)).
- On a PowerShell terminal, a quoted path needs `&` in front, and double quotes inside a commit message break the argument; use `git commit -F <file>`.
