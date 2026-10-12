# T140-makwell-index-smoke: MakWell brand page — renders, Firestore content, links, mobile

| Field | Value |
|---|---|
| Route | `/makwell/index.html` |
| Source | `makwell/index.html` |
| Flow | Smoke — brand landing page loads, Firestore brand/products/contact render, every link resolves |
| Requires auth | no |
| Required role | anonymous |
| Destructive | no |
| Estimated steps | 24 |

## Preconditions
- App running at `http://localhost:8080`
- anonymous
- Firestore project `makwell-websiteandcrm` reachable; seed data: `brands/makwell` doc, ≥ 1 `productCategories` doc with `brandId == "makwell"` and `status == "active"`, ≥ 1 `products` doc with `brandId == "makwell"`, `siteContent/landing` doc
- Browser localStorage cleared (so the `Your privacy choices` consent banner appears)

## Test data
- `brandId = "makwell"`, `brandName = "MakWell"`
- `expectedTitle = "MakWell — Pushpak Enterprises"`
- `expectedH1 = "Make it happen, every day."`
- `expectedH2s = ["The MakWell range.", "Built to be backed.", "About MakWell", "After you buy.", "Get in touch"]`
- `staticTagline = "Make it happen"`; `staticDescription` starts `MakWell's own line of home appliances`
- `heroImg = "../assets/products/hero-tv-makwell.webp"`; `logoImg = "../assets/logos/makwell-logo.jpeg"`
- `phoneViewport = 375 × 812`

## Steps

### TC-01: Happy path — Page loads with Firestore content
1. Navigate to `http://localhost:8080/makwell/index.html`.
2. Assert: HTTP 200; `document.title` is `MakWell — Pushpak Enterprises`; the single `<h1>` is `Make it happen, every day.`.
3. Assert: all `expectedH2s` are present in this order.
4. Assert: the header brandmark reads `MakWell by Pushpak Enterprises`; the logo chip `img[alt="MakWell"]` and the hero `img[alt="MakWell TV"]` load (`naturalWidth > 0`).
5. Assert: the `<meta name="theme-color">` content is `#5E2568`.
6. Wait for `#product-grid` to stop showing `Loading products…`.
7. Assert: `#brand-tagline` and `#brand-description` are non-empty and equal `brands/makwell.tagline` / `.description` from Firestore (or the static defaults if those fields are absent).
8. Assert: `#cat-pills` contains an `All` pill (active) plus one pill per active MakWell category.
9. Assert: `#product-grid` contains ≥ 1 `a.product-card`; each card has a category line, an `<h3>` name, a price (`₹<n>` or `Price on request`), and `View details →`. `Could not load products right now.` is NOT shown.
10. Assert (brand correctness): every product shown has `brandId == "makwell"` in Firestore — no Flyvision or Skevia product names appear.
11. Click a non-`All` category pill. Assert: it becomes `.active`, and the grid shows only that category's products or `No products listed yet for MakWell — check back soon.`. Click `All` to restore.
12. Assert: `#contact-location`, `#contact-phone`, `#contact-email` match `siteContent/landing` (`contactLocation`, `contactPhone`, `contactEmail`); defaults are `No. 62/2, 3rd Main Road, New Timber Yard, Unkal, Hubli - 580031, Karnataka`, `+91 99800 00515`, `pushpakenterprises91@gmail.com`.
13. Assert: footer `#year` equals the current year (`2026`).

### TC-02: Links and CTAs
Request every link's resolved URL (HEAD/GET) and assert HTTP 200; for in-page anchors assert the target id exists.

| Button / link | Action taken | Expected result |
|---|---|---|
| `View Products` (hero) | click | scrolls to `#products` |
| `Register a Product` (hero) | click | navigates to `/index.html#register-product`; that element exists on the home page |
| Nav `Products` / `Why MakWell` / `About` / `Support` / `Contact` | click | scrolls to `#products` / `#why` / `#about` / `#services` / `#contact` |
| `Book a Service` | click | `/index.html#book-service`, target exists |
| My Account icon (`aria-label="My Account"`) | request | `/portal.html` returns 200 |
| Service cards (8): `Register a product`, `Book a service`, `Track a service`, `Warranty status`, `Manuals`, `Brochures`, `Support`, `FAQs` | request + check anchor | `/index.html` 200 and `#register-product`, `#book-service`, `#track-service`, `#warranty-check`, `#manuals`, `#brochures`, `#support`, `#faq` each exist on the home page |
| First product card | click | navigates to `/product.html?id=<docId>`, HTTP 200, product name matches the card |
| Brandmark `MakWell by Pushpak Enterprises` | request | `/index.html` 200 |
| Footer `Pushpak Enterprises`, `MakWell`, `Flyvision`, `Skevia`, `Privacy`, `Terms`, `Cookies` | request | all 200; `MakWell` → `/makwell/index.html`, `Flyvision` → `/flyvision/index.html`, `Skevia` → `/skevia/index.html` |
| Footer `Cookie settings` | click | dialog `Cookie settings` opens with focus on the `Analytics` checkbox; Esc closes it |
| `Skip to content` | focus with Tab, Enter | focus moves to `#main` |
| Consent banner `Reject optional` | click | banner closes; `localStorage["pe.consent"]` has `analytics:false` |

### TC-03: Phone width (375px)
1. Set the viewport to 375 × 812 and reload.
2. Assert: `document.documentElement.scrollWidth <= 375` at the top, at `#products`, at `#services`, and at the footer.
3. Assert: the bottom tab bar `nav.tabbar` (`Home`, `Products`, `Support`, `Account`) is visible; `Products` scrolls to `#products`, and `Account` links to `/portal.html`.
4. Assert: hero text, buttons, product cards, and the contact block are readable without zoom (no clipped text, and buttons are fully on-screen).

### TC-04: Negative & edge cases
- Block `firestore.googleapis.com` and reload. Assert: `#product-grid` shows `Could not load products right now.`; the static tagline `Make it happen` and the static contact details still render; the page does not crash. (Console `Load products failed` / `Brand copy not loaded` messages are expected only in this case.)

## Assertions
- [ ] Title `MakWell — Pushpak Enterprises`, H1 `Make it happen, every day.`, HTTP 200.
- [ ] Firestore brand copy, category pills, MakWell-only products, and contact details render.
- [ ] Every internal link returns 200 and every `#anchor` target exists.
- [ ] Brand-switch footer links point to the correct brand folders.
- [ ] No page-level horizontal scroll at 375px; tab bar works.
- [ ] No console errors in DevTools at any step (except TC-04).
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected.

## Screenshots required
- Page initial load (desktop)
- Product grid after Firestore load
- Cookie settings dialog opened
- 375px viewport (hero + product grid)
- Firestore-blocked fallback state

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
