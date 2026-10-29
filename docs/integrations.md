# Integrations

The full third-party list and what each receives is in [THIRD-PARTY.md](THIRD-PARTY.md); `privacy.html` mirrors it for customers.

| Service | Used for | Notes |
|---|---|---|
| **Firebase** (project `makwell-websiteandcrm`) | Authentication, Firestore, Storage, Cloud Functions (`asia-south1`) | Blaze plan. SDK 10.13.0 loaded from gstatic |
| **GitHub Pages** | Hosts the website; publishes on every push to `main` (`pages.yml`) | Live: https://tarun1203.github.io/Pushpak-enterprises-website-and-CRM/ . Cannot set response headers |
| **GitHub Actions** | `automated-qa.yml` (QA), `pages.yml` (deploy). The QA run also writes `crm/bug-data.json` for the Bug Tracker via a bot commit marked `[skip ci]` | Secrets: `QA_EMAIL`, `QA_PASSWORD`, `QA_ROLE` |
| **reCAPTCHA** (via Firebase phone auth) | Invisible check before the customer OTP | `portal.html` |
| **MSG91** | Automatic SMS / WhatsApp to customers: request received, technician assigned, visit scheduled, job completed, completion code | **Off by default**, see below |
| **Leaflet + OpenStreetMap** | Store and service-center finder (`assets/locator.js`) | Leaflet is self-hosted in `assets/vendor/`; map tiles load from OpenStreetMap |

Fonts (Inter, Manrope) are self-hosted in `assets/fonts/`; no font CDN is used.

## Switching MSG91 messaging on

It stays off until all three are done:

1. Super Admin → Customer Messages & Closing: switch it on and enter the MSG91 template IDs.
2. `functions/.env` contains `MSG91_AUTHKEY=...` (`.env` is git-ignored; `functions/.env.example` is the template).
3. The functions are deployed.

You also need DLT-registered templates for SMS and Meta-approved templates for WhatsApp. Every attempt, sent or skipped, is recorded in `messageLog`. If a completion code cannot be sent, it is still readable by that customer in `portal.html` (`sentVia: "portal"`).

## Adding an integration

- Add it to [THIRD-PARTY.md](THIRD-PARTY.md) and to `privacy.html` before it ships.
- Keep keys in `functions/.env` or GitHub secrets, never in the repo (the go-live gate scans for exposed credentials).
- Call third parties from Cloud Functions, not from the browser, unless it is a public map or script that needs no secret.
- Verify inbound webhook signatures before acting on them. There are no inbound webhooks today.
