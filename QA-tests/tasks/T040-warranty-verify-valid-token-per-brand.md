# T040-warranty-verify-valid-token-per-brand: Warranty QR verification, valid-token rendering for each brand

| Field | Value |
|---|---|
| Route | `/warranty/verify.html` |
| Source | `warranty/verify.html` (inline script at the end of `<body>`), `warranty/verify.css`; token generator `warranty/warranty.js` (`getToken()`, `qrUrl()`) |
| Flow | A customer scans the warranty-card QR and sees the public warranty record |
| Requires auth | no |
| Required role | anonymous |
| Destructive | no |
| Estimated steps | 22 |

## Preconditions
- App running at `http://localhost:8080`
- anonymous (no sign-in, no CRM session cookies)
- No seed data needed. The page is fully static. It loads no Firebase SDK and makes no Firestore or API calls. Every value it shows comes from the URL query string. This task is read-only and safe to run anywhere.
- Network guard: record every request. Only these are expected: `verify.html`, `../assets/pe.css`, `verify.css` and one logo under `/assets/logos/`. A request to `firestore.googleapis.com`, `*.cloudfunctions.net` or any other host is unexpected, so record it as a finding.

## Test data
- `token = "3f9c2a7e5b1d4c8fa0e6b7d9c1a2f3e4"` (32 hex characters, the same shape `warranty.js` `getToken()` produces: `crypto.randomUUID()` with the dashes removed)
- `card = "QA-WC-0001"`
- `model = "QA-AUTO-MW-GSR-25L"`
- `valid = "31 Dec 2027"`
- Brand keys: `makwell`, `flyvision`, `skevia`
- Expected brand mapping (from the source `brands` map):

| `brand` | Brand text (`#brand`) | Logo `src` ends with |
|---|---|---|
| `makwell` | `MakWell` | `/assets/logos/makwell-logo.jpeg` |
| `flyvision` | `Flyvision` | `/assets/logos/flyvision-logo.jpeg` |
| `skevia` | `Skevia` | `/assets/logos/skevia-logo.jpeg` |

## Steps

### TC-01: Happy path, full QR link for MakWell
1. Navigate to `/warranty/verify.html?brand=makwell&card=QA-WC-0001&model=QA-AUTO-MW-GSR-25L&token=3f9c2a7e5b1d4c8fa0e6b7d9c1a2f3e4&valid=31%20Dec%202027`.
2. Assert: the document title is `Warranty Verification — Pushpak Enterprises`.
3. Assert: the header shows the text `WARRANTY VERIFICATION` and `img#logo` with `src` ending `/assets/logos/makwell-logo.jpeg`, `naturalWidth > 0` (the image loaded) and alt `Brand logo`.
4. Assert: `#status` has the classes `status ok` and the text `✓ Warranty record found`.
5. Assert: `h1#product` is `Warranty Record`, and `#summary` is `This QR identifies a Pushpak Enterprises warranty record.`.
6. Assert the details grid:
   - Brand `#brand` = `MakWell`
   - Warranty Card `#card` = `QA-WC-0001`
   - Model `#model` = `QA-AUTO-MW-GSR-25L`
   - Warranty `#warranty` = `Valid until 31 Dec 2027`
7. Assert: the support box shows `Need help?`, `Pushpak Enterprises`, `9980000515` and `Pushpakenterprises91@gmail.com`.
8. Assert: the privacy note starts with `For customer privacy, complete address, mobile number, service history and internal CRM information are not displayed on this public page.`.
9. Assert: the page shows no customer name, mobile number or address anywhere.
10. Click **Contact Pushpak Enterprises →**. Assert: the URL becomes `/index.html#contact` and the contact section is in view.

### TC-02: Brand switching (Flyvision, Skevia)
For each row of the brand table:
1. Navigate to the TC-01 URL with `brand=<key>`.
2. Assert: `#brand` shows the expected text and `img#logo` `src` ends with the expected file. The logo loads (`naturalWidth > 0`).
3. Assert: `#status` is still `✓ Warranty record found` with class `ok`.

### TC-03: Minimal real QR link (token only)
The QR printed by `warranty/index.html` (`qrUrl()`) encodes only `verify.html?token=<token>`. No brand, card, model or valid date is added.
1. Navigate to `/warranty/verify.html?token=3f9c2a7e5b1d4c8fa0e6b7d9c1a2f3e4`.
2. Assert: `#status` is `✓ Warranty record found` (class `ok`).
3. Assert the defaults:
   - `#brand` = `MakWell`, and the logo is `makwell-logo.jpeg`
   - `#card` = `Verified warranty record`
   - `#model` = `See registered product record`
   - `#warranty` = `Warranty status available in the registered record`
4. Record as an observation: a real printed QR shows no card-specific data. The customer gets a generic page whatever card they scan.

### TC-04: Button / link coverage
| Element | Action taken | Expected result |
|---|---|---|
| **Contact Pushpak Enterprises →** | click | navigates to `/index.html#contact` |
| `img#logo` | none | it loads the brand logo and no request returns 404 |

### TC-05: Responsive layout
1. Set the viewport to 375×812 and load the TC-01 URL.
2. Assert: the `.details` grid is 1 column, and `.verify-brand` stacks the logo above the `WARRANTY VERIFICATION` text.
3. Assert: there is no horizontal scrollbar.

## Assertions
- [ ] `#status` reads `✓ Warranty record found` with class `ok` whenever `token` is non-empty.
- [ ] Brand, card, model and warranty cells show the exact query values (TC-01) or the exact defaults (TC-03).
- [ ] The logo matches the brand key, and every logo request returns 200.
- [ ] No personal data (name, mobile, address) is rendered.
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx), and no request to any Firebase or third-party host.

## Screenshots required
- Page initial load (TC-01, MakWell)
- Flyvision and Skevia variants (TC-02)
- Minimal token-only QR view (TC-03)
- Mobile 375px layout (TC-05)

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
