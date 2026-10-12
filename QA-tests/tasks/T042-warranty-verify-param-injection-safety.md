# T042-warranty-verify-param-injection-safety: No query parameter value is rendered as HTML or executed

| Field | Value |
|---|---|
| Route | `/warranty/verify.html` |
| Source | `warranty/verify.html` (inline script uses `textContent` for brand/card/model/warranty/status/summary; `img.src` comes only from the `brands` map) |
| Flow | A hostile QR or link carries markup or script in brand, card, model, token or valid |
| Requires auth | no |
| Required role | anonymous |
| Destructive | no |
| Estimated steps | 26 |

## Preconditions
- App running at `http://localhost:8080`
- anonymous
- Read-only. No backend.
- Before each navigation, install a probe with `page.addInitScript(() => { window.__xss = 0; window.alert = () => { window.__xss = 1 }; })`. Fail on any `dialog` event.

## Test data
URL-encode each payload with `encodeURIComponent` before you put it in the query:
- `P1 = "<img src=x onerror=window.__xss=1>"`
- `P2 = "<script>window.__xss=1</script>"`
- `P3 = "\"><svg onload=window.__xss=1>"`
- `P4 = "javascript:window.__xss=1"`
- `P5 = "<b>bold</b>"` (harmless markup that must still be shown as literal text)
- `P6 = "../../assets/logos/flyvision-logo.jpeg"` (path injection attempt on `brand`)
- `P7 = "&lt;b&gt;x&lt;/b&gt;"` (pre-escaped entities that must not be double-decoded)
- `goodToken = "3f9c2a7e5b1d4c8fa0e6b7d9c1a2f3e4"`

## Steps

### TC-01: Payload in each text parameter
For each parameter `card`, `model` and `valid`, and for each payload `P1`, `P2`, `P3`, `P5` and `P7`:
1. Navigate to `/warranty/verify.html?token=3f9c2a7e5b1d4c8fa0e6b7d9c1a2f3e4&<param>=<encoded payload>`.
2. Assert: the target cell's `textContent` equals the raw payload exactly. For `valid`, the cell is `#warranty` and must read `Valid until ` + payload.
3. Assert: the target cell's `innerHTML` contains no element children (`cell.children.length === 0`). Angle brackets appear as `&lt;` / `&gt;` in `innerHTML`.
4. Assert: `window.__xss === 0`, no dialog opened, and `document.querySelectorAll('.details img, .details svg, .details script').length === 0`.
5. Assert: no network request goes to a path ending `/x` (that request would mean `P1` was parsed as an `<img>`).

### TC-02: Payload in `brand`
For each of `P1`, `P2`, `P3`, `P4` and `P6`:
1. Navigate to `/warranty/verify.html?token=3f9c…f3e4&brand=<encoded payload>`.
2. Assert: `#brand` = `MakWell` (fallback), and `img#logo.src` ends with `/assets/logos/makwell-logo.jpeg`. The payload must never appear in `src`.
3. Assert: `window.__xss === 0`.

### TC-03: Payload in `token`
1. Navigate with `token=<P1 encoded>`, then `token=<P2 encoded>`.
2. Assert: the token is not rendered anywhere in the DOM (`document.body.innerText` does not contain `onerror` or `script`).
3. Assert: `#status` = `✓ Warranty record found`. This is a truthy token; the lack of validation is covered by T041 and is not an XSS failure.
4. Assert: `window.__xss === 0`.

### TC-04: All parameters at once
1. Navigate to `/warranty/verify.html?brand=<P3>&card=<P1>&model=<P2>&valid=<P3>&token=<P1>` (all encoded).
2. Assert: `window.__xss === 0`, no dialog, and the cells show the literal payloads (brand shows `MakWell`).
3. Assert: `document.title` is still `Warranty Verification — Pushpak Enterprises`.
4. Assert: the DOM node count of `.verify-card` is unchanged from a clean load (`?token=…` only). Compare `querySelectorAll('.verify-card *').length`.

### TC-05: Button / link coverage under payload
| Element | Action taken | Expected result |
|---|---|---|
| **Contact Pushpak Enterprises →** | click on the TC-04 page | navigates to `/index.html#contact`. The `href` is static (`../index.html#contact`) and never derived from parameters. |

### TC-06: Negative & edge cases
- Unencoded payload typed raw into the address bar (`?card=<b>x</b>`): the browser encodes it, and `#card` shows `<b>x</b>` literally.
- Null byte `card=%00`: it renders as an empty or replacement character, with no console error.
- `card=%E0%A4` (invalid UTF-8): `URLSearchParams` decodes it to U+FFFD. The page renders without a console error.
- Check for a CSP: record whether the response carries a `Content-Security-Policy` header or `<meta http-equiv>`. Its absence is a hardening observation, not a failure.

## Assertions
- [ ] Every injected value appears only as literal text (`textContent`), never as parsed elements.
- [ ] `window.__xss` stays `0` and no dialog fires across all TCs.
- [ ] `brand` can only select from `makwell` / `flyvision` / `skevia`. A payload never reaches `img.src`.
- [ ] `token` is never echoed into the DOM.
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx), and no request for `/x` or any payload-derived URL.

## Screenshots required
- Page with all payloads (TC-04) showing literal text
- `card=<P1>` cell close-up
- `brand=<P6>` showing the MakWell fallback

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
