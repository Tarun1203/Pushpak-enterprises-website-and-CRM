# T160-skevia-index-smoke: Skevia brand page — renders, Firestore content, links, mobile

| Field | Value |
|---|---|
| Route | `/skevia/index.html` |
| Source | `skevia/index.html` |
| Flow | Smoke — brand landing page loads, Firestore brand/products/contact render, every link resolves |
| Requires auth | no |
| Required role | anonymous |
| Destructive | no |
| Estimated steps | 24 |

## Preconditions
- App running at `http://localhost:8080`
- anonymous
- Firestore project `makwell-websiteandcrm` reachable; seed data: `brands/skevia` doc, ≥ 1 `productCategories` doc with `brandId == "skevia"` and `status == "active"`, ≥ 1 `products` doc with `brandId == "skevia"`, `siteContent/landing` doc
- Browser localStorage cleared

## Test data
- `brandId = "skevia"`, `brandName = "Skevia"`
- `expectedTitle = "Skevia — Pushpak Enterprises"`
- `expectedH1 = "A new awakening, at home."`
- `expectedH2s = ["The Skevia range.", "Built to be backed.", "About Skevia", "After you buy.", "Get in touch"]`
- `staticTagline = "A new awakening"`; `staticDescription` starts `Skevia, a product by MakWell`
- `heroImg = "../assets/products/hero-tv-skevia.webp"`; `logoImg = "../assets/logos/skevia-logo.jpeg"`
- `phoneViewport = 375 × 812`

## Steps

### TC-01: Happy path — Page loads with Firestore content
1. Navigate to `http://localhost:8080/skevia/index.html`.
2. Assert: HTTP 200; `document.title` is `Skevia — Pushpak Enterprises`; the single `<h1>` is `A new awakening, at home.`.
3. Assert: all `expectedH2s` are present in this order.
4. Assert: the header brandmark reads `Skevia by Pushpak Enterprises`; the logo chip `img[alt="Skevia"]` and the hero `img[alt="Skevia TV"]` load (`naturalWidth > 0`); the nav item reads `Why Skevia`.
5. Wait for `#product-grid` to stop showing `Loading products…`.
6. Assert: `#brand-tagline` and `#brand-description` are non-empty and equal `brands/skevia.tagline` / `.description` from Firestore (or the static defaults).
7. Assert: `#cat-pills` contains an `All` pill (active) plus one pill per active Skevia category.
8. Assert: `#product-grid` contains ≥ 1 `a.product-card` (category, `<h3>` name, price `₹<n>` or `Price on request`, `View details →`); OR, if no Skevia products are seeded, `No products listed yet for Skevia — check back soon.`. `Could not load products right now.` is NOT shown.
9. Assert (brand correctness): every product shown has `brandId == "skevia"` — no MakWell or Flyvision products appear.
10. Click a non-`All` category pill. Assert: it becomes `.active` and the grid filters accordingly. Click `All` to restore.
11. Assert: the contact block matches `siteContent/landing` (defaults: `No. 62/2, 3rd Main Road, New Timber Yard, Unkal, Hubli - 580031, Karnataka`, `+91 99800 00515`, `pushpakenterprises91@gmail.com`).
12. Assert: footer `#year` equals `2026`.

### TC-02: Links and CTAs
Request every link's resolved URL and assert HTTP 200; for in-page anchors assert the target id exists.

| Button / link | Action taken | Expected result |
|---|---|---|
| `View Products` (hero) | click | scrolls to `#products` |
| `Register a Product` (hero) | click | `/index.html#register-product`; target exists |
| Nav `Products` / `Why Skevia` / `About` / `Support` / `Contact` | click | scrolls to `#products` / `#why` / `#about` / `#services` / `#contact` |
| `Book a Service` | click | `/index.html#book-service`, target exists |
| My Account icon | request | `/portal.html` returns 200 |
| Service cards (8) | request + check anchor | `/index.html` 200; `#register-product`, `#book-service`, `#track-service`, `#warranty-check`, `#manuals`, `#brochures`, `#support`, `#faq` exist |
| First product card (if any) | click | `/product.html?id=<docId>` HTTP 200, shows the same product |
| Brandmark `Skevia by Pushpak Enterprises` | request | `/index.html` 200 |
| Footer `Pushpak Enterprises`, `MakWell`, `Flyvision`, `Skevia`, `Privacy`, `Terms`, `Cookies` | request | all 200; `Skevia` → `/skevia/index.html` (self), `MakWell` → `/makwell/index.html`, `Flyvision` → `/flyvision/index.html` |
| Footer `Cookie settings` | click | `Cookie settings` dialog opens; Esc closes |
| `Skip to content` | Tab, Enter | focus moves to `#main` |

### TC-03: Phone width (375px)
1. Set the viewport to 375 × 812 and reload.
2. Assert: `document.documentElement.scrollWidth <= 375` at the top, at `#products`, at `#services`, and at the footer.
3. Assert: `nav.tabbar` (`Home`, `Products`, `Support`, `Account`) is visible and each item works.
4. Assert: hero, product cards, service cards, and the contact block are readable with no clipped text.

### TC-04: Negative & edge cases
- Block `firestore.googleapis.com` and reload. Assert: `#product-grid` shows `Could not load products right now.`; the static tagline `A new awakening` and the contact defaults remain; no crash.

## Assertions
- [ ] Title `Skevia — Pushpak Enterprises`, H1 `A new awakening, at home.`, HTTP 200.
- [ ] Firestore brand copy, Skevia-only products (or the Skevia empty note), and contact details render.
- [ ] Every internal link returns 200 and every `#anchor` target exists.
- [ ] Brand-switch links point to the correct brand folders; Skevia logo/hero assets are used.
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
