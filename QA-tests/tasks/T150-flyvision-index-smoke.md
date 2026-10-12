# T150-flyvision-index-smoke: Flyvision brand page — renders, Firestore content, links, mobile

| Field | Value |
|---|---|
| Route | `/flyvision/index.html` |
| Source | `flyvision/index.html` |
| Flow | Smoke — brand landing page loads, Firestore brand/products/contact render, every link resolves |
| Requires auth | no |
| Required role | anonymous |
| Destructive | no |
| Estimated steps | 24 |

## Preconditions
- App running at `http://localhost:8080`
- anonymous
- Firestore project `makwell-websiteandcrm` reachable; seed data: `brands/flyvision` doc, ≥ 1 `productCategories` doc with `brandId == "flyvision"` and `status == "active"`, ≥ 1 `products` doc with `brandId == "flyvision"`, `siteContent/landing` doc
- Browser localStorage cleared (so the `Your privacy choices` consent banner appears)

## Test data
- `brandId = "flyvision"`, `brandName = "Flyvision"`
- `expectedTitle = "Flyvision — Pushpak Enterprises"`
- `expectedH1 = "See beyond the everyday."`
- `expectedH2s = ["The Flyvision range.", "Built to be backed.", "About Flyvision", "After you buy.", "Get in touch"]`
- `staticTagline = "Precision in motion"`; `staticDescription` starts `Flyvision's appliance range`
- `heroImg = "../assets/products/hero-tv-flyvision.webp"`; `logoImg = "../assets/logos/flyvision-logo.jpeg"`
- `phoneViewport = 375 × 812`

## Steps

### TC-01: Happy path — Page loads with Firestore content
1. Navigate to `http://localhost:8080/flyvision/index.html`.
2. Assert: HTTP 200; `document.title` is `Flyvision — Pushpak Enterprises`; the single `<h1>` is `See beyond the everyday.`.
3. Assert: all `expectedH2s` are present in this order.
4. Assert: the header brandmark reads `Flyvision by Pushpak Enterprises`; the logo chip `img[alt="Flyvision"]` and the hero `img[alt="Flyvision TV"]` load (`naturalWidth > 0`).
5. Assert: no MakWell or Skevia branding leaks into the page body: the nav item reads `Why Flyvision`, and the logo `src` ends `flyvision-logo.jpeg`.
6. Wait for `#product-grid` to stop showing `Loading products…`.
7. Assert: `#brand-tagline` and `#brand-description` are non-empty and equal `brands/flyvision.tagline` / `.description` from Firestore (or the static defaults if those fields are absent).
8. Assert: `#cat-pills` contains an `All` pill (active) plus one pill per active Flyvision category.
9. Assert: `#product-grid` contains ≥ 1 `a.product-card` with a category, an `<h3>` name, a price (`₹<n>` or `Price on request`), and `View details →`; OR, if no Flyvision products are seeded, the text `No products listed yet for Flyvision — check back soon.`. `Could not load products right now.` is NOT shown.
10. Assert (brand correctness): every product shown has `brandId == "flyvision"` in Firestore — no MakWell or Skevia products appear.
11. Click a non-`All` category pill. Assert: it becomes `.active` and the grid filters to that category (or shows the Flyvision empty note). Click `All` to restore.
12. Assert: `#contact-location`, `#contact-phone`, `#contact-email` match `siteContent/landing` (defaults: `No. 62/2, 3rd Main Road, New Timber Yard, Unkal, Hubli - 580031, Karnataka`, `+91 99800 00515`, `pushpakenterprises91@gmail.com`).
13. Assert: footer `#year` equals `2026`.

### TC-02: Links and CTAs
Request every link's resolved URL and assert HTTP 200; for in-page anchors assert the target id exists.

| Button / link | Action taken | Expected result |
|---|---|---|
| `View Products` (hero) | click | scrolls to `#products` |
| `Register a Product` (hero) | click | `/index.html#register-product`; target exists |
| Nav `Products` / `Why Flyvision` / `About` / `Support` / `Contact` | click | scrolls to `#products` / `#why` / `#about` / `#services` / `#contact` |
| `Book a Service` | click | `/index.html#book-service`, target exists |
| My Account icon | request | `/portal.html` returns 200 |
| Service cards (8): `Register a product`, `Book a service`, `Track a service`, `Warranty status`, `Manuals`, `Brochures`, `Support`, `FAQs` | request + check anchor | `/index.html` 200; `#register-product`, `#book-service`, `#track-service`, `#warranty-check`, `#manuals`, `#brochures`, `#support`, `#faq` exist |
| First product card (if any) | click | `/product.html?id=<docId>` HTTP 200, shows the same product |
| Brandmark `Flyvision by Pushpak Enterprises` | request | `/index.html` 200 |
| Footer `Pushpak Enterprises`, `MakWell`, `Flyvision`, `Skevia`, `Privacy`, `Terms`, `Cookies` | request | all 200; `Flyvision` → `/flyvision/index.html` (self), `MakWell` → `/makwell/index.html`, `Skevia` → `/skevia/index.html` |
| Footer `Cookie settings` | click | `Cookie settings` dialog opens; Esc closes and returns focus |
| `Skip to content` | Tab, Enter | focus moves to `#main` |

### TC-03: Phone width (375px)
1. Set the viewport to 375 × 812 and reload.
2. Assert: `document.documentElement.scrollWidth <= 375` at the top, at `#products`, at `#services`, and at the footer.
3. Assert: `nav.tabbar` (`Home`, `Products`, `Support`, `Account`) is visible and each item works.
4. Assert: hero, product cards, service cards, and the contact block are readable with no clipped text.

### TC-04: Negative & edge cases
- Block `firestore.googleapis.com` and reload. Assert: `#product-grid` shows `Could not load products right now.`; the static tagline `Precision in motion` and the static contact details remain; no crash.

## Assertions
- [ ] Title `Flyvision — Pushpak Enterprises`, H1 `See beyond the everyday.`, HTTP 200.
- [ ] Firestore brand copy, Flyvision-only products (or the Flyvision empty note), and contact details render.
- [ ] Every internal link returns 200 and every `#anchor` target exists.
- [ ] Brand-switch links point to the correct brand folders; Flyvision logo/hero assets are used.
- [ ] No page-level horizontal scroll at 375px.
- [ ] No console errors in DevTools at any step (except TC-04).
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected.

## Screenshots required
- Page initial load
- Product grid after Firestore load
- Cookie settings dialog opened
- 375px viewport
- Firestore-blocked fallback state

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
