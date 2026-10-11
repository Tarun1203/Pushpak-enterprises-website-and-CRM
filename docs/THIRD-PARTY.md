# Third-party services and scripts (audit)

Last audited: 11 October 2026. Re-audited automatically by `tests/e2e/trust-a11y.spec.js`, which fails if a new
external script host appears that is not listed here, or if any analytics / advertising / font-CDN code is added.

| Host | What | Where | Personal data sent | Needed? |
|---|---|---|---|---|
| `www.gstatic.com` | Firebase JS SDK (Auth, Firestore, Storage, Functions, App) modules, version-pinned | all pages that talk to the backend (public site forms, My Account, CRM) | Browser/IP details as for any script download; the SDK then talks to Google Firebase with the data in the privacy policy | Yes - it is the backend |
| `www.google.com` | reCAPTCHA (loaded by Firebase Phone Auth) | My Account sign-in only | Technical signals (IP, browser) handled by Google | Yes - protects SMS sign-in from abuse |
| `tile.openstreetmap.org` | OpenStreetMap map images (tiles) for the service-center finder; Leaflet itself is self-hosted in `assets/vendor/leaflet/` (BSD-2) | Find service center, only after the visitor taps "Show map" | IP and map area viewed, under the OSMF privacy policy; no cookies | Optional - the list works without it |
| GitHub Pages | Static hosting | whole site | IP / request in host logs | Yes - hosting |

Removed in this audit: **Google Fonts** (`fonts.googleapis.com`, `fonts.gstatic.com`). Inter and Manrope are now served from
`assets/fonts/` (SIL OFL 1.1), so visiting a page no longer contacts Google for fonts.

Not present (and checked by the test): Google Analytics / Tag Manager, Meta pixel, Hotjar, Clarity, Segment, Mixpanel, ad networks, social widgets, chat widgets.

Adding anything new: list it here, add it to the Privacy Policy table and the Cookie Policy, load it only after
`PE_CONSENT.allows('<category>')` is true if it is not strictly necessary, and update the allowed hosts in the test.

## Data-minimisation audit

- Forms ask only for what the job needs. The general enquiry form makes address, city, pincode, model, serial, dealer and product optional; registration and booking require only what warranty and a visit need (contact, address, product, model, purchase date, dealer).
- The service-center finder reads the device location only when the visitor taps "Use my location"; it is used in the browser to sort by distance and is never stored or sent.
- Nothing else is collected in the background: no device fingerprint, user-agent, screen size, referrer, location, or advertising ID is read or stored by the site code (checked by search).
- Consent: registration, booking and enquiry forms (website and My Account) have an unticked, required tick-box linking to the Privacy Policy; submitting is blocked until ticked.
- Open item for the owner: store a consent record (version + time) with each submission. This needs a Firestore rules change, so it is listed in `docs/go-live-confirmations.json` rather than done silently.
