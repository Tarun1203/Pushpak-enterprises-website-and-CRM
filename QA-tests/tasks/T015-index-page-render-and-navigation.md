# T015-index-page-render-and-navigation: Landing page render, CMS content, navigation and cookie consent

| Field | Value |
|---|---|
| Route | `/index.html` |
| Source | `index.html` (static markup + `loadSiteContent` / `loadBrand` lines ~1341-1394), `assets/pe.js` (hero rotation, tab bar), `assets/mobile-nav.js` (phone menu), `assets/pe-trust.js` (cookie banner/settings) |
| Flow | Page renders; header/hero/brand/category/footer/tab-bar navigation; Firestore-driven content overrides; cookie consent |
| Requires auth | no |
| Required role | anonymous |
| Destructive | no (reads `siteContent/landing`, `brands/*`; writes only `localStorage["pe.consent"]`) |
| Estimated steps | 45 |

## Preconditions
- App running at `http://localhost:8080`
- anonymous (no sign-in)
- This task does not write to Firestore. For deterministic CMS assertions, use the stub `installFirebaseStub(page, { data: SEED })` or emulator data. Abort if any request goes to `firestore.googleapis.com` while asserting seeded text.
- Fresh browser context (empty `localStorage`) so the cookie banner shows.
- `SEED`:
  - `siteContent`: `[{ id: "landing", heroHeadline: "QA-AUTO Headline", heroSubcopy: "QA-AUTO Subcopy", brandsIntro: "QA-AUTO Brands intro", aboutText1: "QA-AUTO About 1", aboutText2: "QA-AUTO About 2", contactPhone: "+91 90000 00013", contactEmail: "qa-auto@example.test", contactLocation: "QA-AUTO Station Road, Raichur - 584101, Karnataka" }]`
  - `brands`: `[{ id: "makwell", tagline: "QA-AUTO MakWell tag", description: "QA-AUTO MakWell desc" }, { id: "flyvision", tagline: "", description: "QA-AUTO Flyvision desc" }]` (no `skevia` doc)

## Test data
- Viewports: `desktop = 1280×800`, `phone = 390×844`
- Expected static defaults (no seed):
  - hero headline "Technology made for every home."
  - contact phone "+91 99800 00515"
  - contact email "pushpakenterprises91@gmail.com"
  - location "No. 62/2, 3rd Main Road, New Timber Yard, Unkal, Hubli - 580031, Karnataka"
  - Skevia tag "A new awakening"
  - Flyvision tag "Precision in motion"

## Steps

### TC-01: Happy path — Page renders with all sections (no CMS data)
1. Use the stub with no data. Navigate to `/index.html`.
2. Assert: the document title is "Pushpak Enterprises — MakWell, Flyvision, Skevia". `<html>` no longer has class `no-js`.
3. Assert: the headings, in order: H1 "Technology made for every home.", then H2s "Three brands. One promise.", "Find what fits your home.", "How can we help?", "One company behind every brand.", "About Pushpak Enterprises", "Get in touch.".
4. Assert: the hero stats show "3" with "brands, one service promise", "Registered" with "warranty on every product" and "Doorstep" with "service by local technicians".
5. Assert: 3 brand cards with tags "Make it happen", "Precision in motion", "A new awakening".
6. Assert: 4 category tiles: "TVs", "Appliances", "Accessories", "Other products".
7. Assert: 6 hub cards ("Book a service", "Check warranty", "Register product", "Find service center", "Track service", "Help & FAQs") and 3 more ("Manuals", "Brochures", "Talk to support").
8. Assert: the contact section shows the default phone, email and location from Test data.
9. Assert: the footer reads "© <current year> Pushpak Enterprises. All rights reserved." (`#year` = `new Date().getFullYear()`).
10. Assert: the hero has 3 images, and exactly one has class `active`. Wait 4.6 s. Assert: the active image index has advanced by one.

### TC-02: CMS content overrides from Firestore
1. Load with `SEED`. Assert: H1 "QA-AUTO Headline", subcopy "QA-AUTO Subcopy", brands intro "QA-AUTO Brands intro", about paragraphs "QA-AUTO About 1" / "QA-AUTO About 2", phone "+91 90000 00013", email "qa-auto@example.test", location "QA-AUTO Station Road, Raichur - 584101, Karnataka".
2. Assert: MakWell tag "QA-AUTO MakWell tag" and description "QA-AUTO MakWell desc".
3. Assert: the Flyvision tag is still "Precision in motion" (an empty string does not override), and the description is "QA-AUTO Flyvision desc".
4. Assert: Skevia keeps its static tag "A new awakening" and description "Skevia, a product by MakWell — a newer line exploring the next generation of home appliances." (doc missing).
5. XSS: seed `heroHeadline = "<img src=x onerror=window.__xss=1>"`. Assert: it renders as literal text (`textContent`) and `window.__xss` is undefined.
6. Read failure (stub `getDoc` throws). Assert: the static defaults stay, and the console has the warnings "siteContent/landing not loaded, using defaults:" and "brands/makwell not loaded, using defaults:". These are console.warn, not errors.

### TC-03: Button / link coverage (desktop 1280×800)
| Button | Action taken | Expected result |
|---|---|---|
| Header **Products** | click | scrolls to `#products` |
| Header **Brands** | click | scrolls to `#brands` |
| Header **Support** | click | scrolls to `#help` |
| Header **About** | click | scrolls to `#about` |
| Header **Contact** | click | scrolls to `#contact` |
| **Find a Service** | click | scrolls to `#help` |
| Account icon (aria-label "My Account") | click | navigates to `/portal.html` (HTTP 200) |
| Brandmark "Pushpak Enterprises Building Brands. Delivering Trust." | click | reloads `/index.html` |
| **Skip to content** | Tab from the top, then Enter | focus/scroll moves to `#main` |
| **Explore Products** | click | scrolls to `#products` |
| **Get Support** | click | scrolls to `#help` |
| **Explore MakWell →** | click | `/makwell/index.html` loads (200) |
| **Explore Flyvision →** | click | `/flyvision/index.html` loads (200) |
| **Explore Skevia →** | click | `/skevia/index.html` loads (200) |
| Tiles **TVs** / **Appliances** / **Accessories** | click | `/makwell/index.html#products` |
| Tile **Other products** | click | scrolls to `#contact` |
| Footer **MakWell** / **Flyvision** / **Skevia** / **My Account** | click | respective page loads (200) |
| Footer **Privacy** / **Terms** / **Cookies** | click | `privacy.html` / `terms.html` / `cookies.html` load (200) |
| Footer **Cookie settings** | click | "Cookie settings" dialog opens (see TC-04) |

### TC-04: Cookie consent banner and settings
1. Fresh context: load the page. Assert: a region "Your privacy choices" is shown with links "Cookie Policy" / "Privacy Policy" and buttons **Reject optional**, **Choose**, **Accept all**.
2. Click **Reject optional**. Assert: the banner is removed, and `localStorage["pe.consent"]` parses to `{ v: 1, essential: true, analytics: false, preferences: false, at: <ISO date> }`.
3. Reload. Assert: no banner.
4. Click footer **Cookie settings**. Assert: a dialog "Cookie settings" (`role="dialog"`, `aria-modal="true"`) is shown. "Essential" is checked and disabled, "Analytics" and "Preferences" are unchecked, and focus is on Analytics.
5. Tick **Analytics** and click **Save my choices**. Assert: the dialog closes, `pe.consent.analytics = true`, `preferences = false`, and focus returns to the **Cookie settings** button.
6. Open settings and press **Escape**. Assert: closes without changing the stored value.
7. Fresh context: click **Accept all** on the banner. Assert: `analytics: true`, `preferences: true`.
8. Fresh context: click **Choose**. Assert: the settings dialog opens over the banner.
9. Navigate to `/index.html?cookiesettings=1`. Assert: the settings dialog opens automatically.

### TC-05: Phone layout (390×844)
1. Set the viewport to 390×844 and load the page. Assert: the header nav is hidden, and a **Menu** button (aria-label "Open menu", `aria-expanded="false"`) is visible with a hit area ≥ 44×44.
2. Click **Menu**. Assert: the header gets `mnav-open`, the nav links appear as a column, and the button reads "Close" with aria-label "Close menu" and `aria-expanded="true"`.
3. Click **Brands** in the menu. Assert: the menu closes and the page scrolls to `#brands`.
4. Open the menu and press **Escape**. Assert: it closes.
5. Assert: the bottom tab bar ("Quick links") shows **Home**, **Products**, **Support**, **Account**. Scroll to `#help`. Assert: **Support** gets class `on`.
6. Click tab **Account**. Assert: navigates to `/portal.html`.
7. Assert: there is no horizontal scroll (`document.documentElement.scrollWidth <= 390`).

### TC-06: Negative & edge cases
- `prefers-reduced-motion: reduce`: all `.rv` elements get class `in` immediately (no reveal-on-scroll animation dependency).
- Unknown hash `/index.html#nonexistent`: no modal opens and no console error.
- Firebase SDK unreachable (block `https://www.gstatic.com/firebasejs/**`): the static content still renders fully. Record any console errors from the failed module import; hub cards that depend on the module script will not open modals — record this as a resilience finding if confirmed.
- Images: every `<img>` on the page loads (`naturalWidth > 0`); no 404s for `assets/products/*.webp` or `assets/logos/*`.

## Assertions
- [ ] Title, H1 and the 6 H2 headings exactly as listed.
- [ ] CMS fields override static text only when non-empty; failures fall back silently with console.warn.
- [ ] Every internal link returns 200.
- [ ] Cookie banner/settings store `pe.consent` v1 with the correct flags; never pre-ticked optional categories.
- [ ] Phone menu toggles with correct aria state; tab bar highlights the section in view.
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected (TC-06 blocked SDK).

## Screenshots required
- Page initial load (desktop, above the fold)
- Full page (desktop) with defaults; full page with QA-AUTO CMS seed
- Cookie banner; cookie settings dialog
- Phone viewport: closed header, open menu, tab bar
- Final state after navigation checks

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
