# T170-warranty-index-smoke: Warranty Card Generator — renders, live preview, brand switch, mobile

| Field | Value |
|---|---|
| Route | `/warranty/index.html` |
| Source | `warranty/index.html` (+ `warranty/warranty.js`) |
| Flow | Smoke — generator loads with demo data, edits update the A5 preview, brand switch, add/remove coverage row, print |
| Requires auth | no |
| Required role | anonymous |
| Destructive | no |
| Estimated steps | 22 |

## Preconditions
- App running at `http://localhost:8080`
- anonymous
- No seed data (page is client-side only; no Firestore)
- Network access to `quickchart.io` (QR image)

## Test data
- `customerName = "QA Test Customer 170"`
- `mobile = "9000000170"`
- `serial = "QA-SERIAL-170"`
- `purchaseDate = "2026-10-01"` → preview `01 Oct 2026`
- `htmlCoverage = "<b>Panel</b> & \"Frame\""` (typed into the first coverage `Component` input)

## Steps

### TC-01: Happy path — Generator loads and the preview follows the inputs
1. Navigate to `http://localhost:8080/warranty/index.html`.
2. Assert: HTTP 200; `document.title` is `Warranty Card Generator — Pushpak Enterprises`; the `<h1>` is `Warranty Card Generator`; the subtitle reads `A5 duplex • dynamic coverage • QR verification`.
3. Assert: the preview shows `WARRANTY CARD` (front) and `TERMS & CONDITIONS` (back); `#cardNoOut` = `WC-2026-000184`; `#customerNameOut` = `Customer Name`; `#brandOut` = `MakWell`; `#brandTagline` = `MAKE IT HAPPEN`.
4. Assert: the coverage table has 5 rows: `Display / Panel`, `Main Board`, `Power Board`, `Speaker`, `Remote`, each `Covered` / `1 Year`.
5. Assert: `#qrImage` and `#qrImageBack` `src` start `https://quickchart.io/qr?` and contain `verify.html%3Ftoken%3D`; the image loads.
6. Set `Customer Name` = `customerName`, `Mobile` = `mobile`, `Serial No.` = `serial`, `Purchase Date` = `purchaseDate`. Assert: `#customerNameOut`, `#mobileOut`, `#serialOut` update immediately; `#purchaseOut` = `01 Oct 2026`.
7. Select `Flyvision` in the Brand select. Assert: `#brandOut` = `Flyvision`, `#brandTagline` = `PRECISION IN MOTION`, and both logos' `src` end `flyvision-logo.jpeg`. Select `Skevia`. Assert: `Skevia` / `A NEW AWAKENING` / `skevia-logo.jpeg`. Select `MakWell` again.
8. Click **`+ Add row`**. Assert: a 6th row `New Component | Covered | 1 Year` appears in both the editor and the preview table.
9. Click the `×` (aria-label `Remove row`) on the 6th row. Assert: back to 5 rows.
10. Type `htmlCoverage` into the first `Component` input. Assert: the preview cell shows the literal text `<b>Panel</b> & "Frame"` and contains no `<b>` element.
11. Stub `window.print` and click **`Print / Save PDF`**. Assert: `window.print` was called once.

### TC-02: Links
The page has no `<a>` links. Assert: every resource it loads (`../assets/pe.css`, `./warranty.css`, `./warranty.js`, the 3 brand logos when switched) returns 200. Request `/warranty/verify.html` (QR target) and assert 200.

### TC-03: Phone width (375px)
1. Set the viewport to 375 × 812 and reload.
2. Assert: `document.documentElement.scrollWidth <= 375`. If the A5 preview is wider than the viewport, it must scroll or scale inside its own container — not the page.
3. Assert: the form fields stack and are readable; the `Brand` select and `Print / Save PDF` stay visible and tappable.

## Assertions
- [ ] Title and H1 `Warranty Card Generator`, HTTP 200.
- [ ] Every input edit reflects in the preview; dates format as `DD Mon YYYY`.
- [ ] Brand switch changes the name, tagline, and logo for all 3 brands.
- [ ] Add/remove row works; coverage text is escaped.
- [ ] Print button invokes `window.print`.
- [ ] No page-level horizontal scroll at 375px.
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx).

## Screenshots required
- Page initial load
- Preview after the test-data edits (MakWell)
- Preview with Flyvision and Skevia selected
- 375px viewport

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
