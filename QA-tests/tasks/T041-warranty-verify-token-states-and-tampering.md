# T041-warranty-verify-token-states-and-tampering: Missing, empty, invalid and tampered tokens and parameters

| Field | Value |
|---|---|
| Route | `/warranty/verify.html` |
| Source | `warranty/verify.html` (inline script: `const token=p.get('token')` … `if(!token){…}`) |
| Flow | Scanning a damaged, forged or edited QR link |
| Requires auth | no |
| Required role | anonymous |
| Destructive | no |
| Estimated steps | 30 |

## Preconditions
- App running at `http://localhost:8080`
- anonymous
- No seed data needed. This task is read-only. The page makes no backend calls.
- Source facts the runner must know before judging results:
  - The script only checks whether `token` is **truthy**. It never compares the token with any stored record. There is no Firestore lookup, no signature check, no format check and no expiry check.
  - `card`, `model` and `valid` are shown as they are, whatever the token state.
  - `brand` is looked up with `brands[key] || brands.makwell`. `key` comes straight from the URL and is not checked with `hasOwnProperty`.

## Test data
- `goodToken = "3f9c2a7e5b1d4c8fa0e6b7d9c1a2f3e4"`
- `shortToken = "x"`
- `nonHexToken = "NOT-A-REAL-TOKEN!!"`
- `tamperedToken = "3f9c2a7e5b1d4c8fa0e6b7d9c1a2f3e5"` (last character of `goodToken` changed)
- `whitespaceToken = "%20"` (one space)
- `longToken = 5000 × "a"`
- `forgedValid = "31 Dec 2099"`, `expiredValid = "01 Jan 2020"`, `garbageValid = "banana"`
- `card = "QA-WC-0001"`, `model = "QA-AUTO-MW-GSR-25L"`

## Steps

### TC-01: Token missing
1. Navigate to `/warranty/verify.html?brand=makwell&card=QA-WC-0001&model=QA-AUTO-MW-GSR-25L&valid=31%20Dec%202027` (no `token`).
2. Assert: `#status` has the classes `status warn` (amber background `#fff5df`) and the text `! QR token missing`.
3. Assert: `#summary` is `Please scan the QR printed on the original warranty document.`.
4. Assert: `#status` does **not** contain `Warranty record found`.
5. Assert (expected, record as a defect if it holds): `#card` = `QA-WC-0001`, `#model` = `QA-AUTO-MW-GSR-25L` and `#warranty` = `Valid until 31 Dec 2027` still render beside the "token missing" warning. A record that has not been verified is shown with a validity date.
6. Navigate to `/warranty/verify.html` (no query at all). Assert: `! QR token missing`, `#brand` = `MakWell`, `#card` = `Verified warranty record`. Record the defect: "Verified" text appears while the token is missing.

### TC-02: Token present but empty or blank
| URL suffix | Expected `#status` | Notes |
|---|---|---|
| `?token=` | `! QR token missing` (class `warn`) | an empty string is falsy |
| `?token` (no `=`) | `! QR token missing` | `get` returns `""` |
| `?token=%20` | **Defect if** `✓ Warranty record found` | a single space is accepted as a valid token |
| `?token=&token=3f9c…f3e4` | `! QR token missing` | `get` returns the first value. Record the actual result. |

### TC-03: Invalid and tampered tokens (no server verification)
For each token value, navigate to `/warranty/verify.html?brand=makwell&card=QA-WC-0001&model=QA-AUTO-MW-GSR-25L&valid=31%20Dec%202027&token=<value>`:

| Token | Correct behaviour | Expected actual (from source) |
|---|---|---|
| `goodToken` | `✓ Warranty record found` | same |
| `tamperedToken` | must NOT say `found`; a "not recognised"-style warning | `✓ Warranty record found` → **DEFECT** |
| `shortToken` `x` | must NOT say `found` | `✓ Warranty record found` → **DEFECT** |
| `nonHexToken` | must NOT say `found` | `✓ Warranty record found` → **DEFECT** |
| `longToken` (5000 chars) | page renders, no hang | `found`. Record load time; it must be < 2 s. |

For each row, assert that no network request is made to validate the token (proves there is no backend check). Capture the request log.

### TC-04: Forged warranty validity (content spoofing)
1. Navigate to `/warranty/verify.html?token=x&brand=makwell&card=FAKE-0001&model=ANY-MODEL&valid=31%20Dec%202099`.
2. Assert, and record as a **DEFECT (high)**: the page shows the official Pushpak/MakWell branding, `✓ Warranty record found`, Card `FAKE-0001` and `Valid until 31 Dec 2099`. Anyone can create a convincing fake warranty confirmation link.
3. `valid=01%20Jan%202020`: assert the page shows `Valid until 01 Jan 2020` with the green `found` status. Record the defect: an expired date is not flagged.
4. `valid=banana`: assert the page shows `Valid until banana`. Record the defect: there is no date validation.

### TC-05: Brand parameter edge cases
| `brand` value | Expected (correct) | What to record |
|---|---|---|
| `unknownbrand` | falls back to `MakWell` and the MakWell logo | pass if so |
| `FLYVISION` (upper case) | Flyvision | source lookup is case-sensitive, so it shows `MakWell`. Record a minor defect. |
| `` (empty) | MakWell | pass if so |
| `__proto__` | MakWell fallback | `brands['__proto__']` is truthy, so `#brand` is blank and `img#logo` src is `.../warranty/undefined` (404). Record the **DEFECT**. |
| `constructor` | MakWell fallback | same prototype lookup: the brand is blank or broken, and the logo is a 404. Record a **DEFECT**. |
| `toString` | MakWell fallback | same as above |

For each row, record `#brand` textContent, `img#logo.src`, the logo HTTP status and any console error.

### TC-06: Negative & edge cases
- Duplicate parameters `?card=A&card=B&token=x`: `#card` shows `A` (first value). Record it.
- Encoded characters `?token=x&card=QA%2BWC%26001`: `#card` shows `QA+WC&001` literally.
- Unicode `?token=x&model=%E0%B2%AE%E0%B2%BE%E0%B2%A6%E0%B2%B0%E0%B2%BF` (Kannada "ಮಾದರಿ"): it renders correctly with no mojibake.
- Very long `card` (2000 × "9"): the text wraps or clips inside the card. The layout must not push the details grid off-screen at 375px width. Record a screenshot.
- Hash only `/warranty/verify.html#token=abc`: the token is not read from the hash, so `! QR token missing`.

## Assertions
- [ ] Missing or empty token shows `! QR token missing` with class `warn`, and the summary text is exact.
- [ ] Every row in TC-03, TC-04 and TC-05 records its actual result. Rows that differ from the "correct behaviour" are filed as defects with screenshots.
- [ ] No validation network call exists for the token. Confirm this by request log.
- [ ] No console errors in DevTools at any step, except those caused by the `__proto__`/`constructor` defect. Record them.
- [ ] No failed network requests (no 4xx/5xx), except the expected `/warranty/undefined` 404 in TC-05. Record it.

## Screenshots required
- Token missing (TC-01) and no query at all
- Tampered token showing `found` (TC-03)
- Forged `Valid until 31 Dec 2099` page (TC-04)
- `brand=__proto__` broken render (TC-05)
- Long-card layout at 375px

## Pass criteria
All TCs above are executed and every result is recorded. The task passes as a test run when every row matches either "correct" or the documented "expected actual". Each "expected actual" that is labelled DEFECT must be filed as a defect.
