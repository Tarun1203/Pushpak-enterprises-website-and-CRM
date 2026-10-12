# T200-cookies-smoke: Cookie Policy — renders, cookie settings, links, mobile

| Field | Value |
|---|---|
| Route | `/cookies.html` |
| Source | `cookies.html` |
| Flow | Smoke — legal page renders, `Open cookie settings` works and persists consent, links resolve |
| Requires auth | no |
| Required role | anonymous |
| Destructive | no |
| Estimated steps | 18 |

## Preconditions
- App running at `http://localhost:8080`
- anonymous
- Browser localStorage cleared (no `pe.consent`)

## Test data
- `expectedTitle = "Cookie Policy — Pushpak Enterprises"`
- `expectedH1 = "Cookie Policy"`
- `expectedH2s = ["1. What are cookies and similar storage?", "2. What we store", "3. Your choices", "4. Third parties", "5. Changes"]`
- `consentKey = "pe.consent"`

## Steps

### TC-01: Happy path — Page renders and consent can be set
1. Navigate to `http://localhost:8080/cookies.html`.
2. Assert: HTTP 200; `document.title` is `Cookie Policy — Pushpak Enterprises`; `<h1>` is `Cookie Policy`; all `expectedH2s` are present in this order.
3. Assert: `Last updated: 11 October 2026` is visible; the legal tab `Cookie Policy` has `aria-current="page"`.
4. Assert: the storage table has the columns `Name / source | Purpose | Category | Lasts` and 3 rows: `pe.consent`, `firebase:authUser…`, `reCAPTCHA`.
5. Assert: the consent banner `Your privacy choices` is visible with `Reject optional`, `Choose`, `Accept all`.
6. Click **`Open cookie settings`**. Assert: a dialog (`role="dialog"`, `aria-modal="true"`) titled `Cookie settings` opens; `Essential` is checked and disabled; `Analytics` and `Preferences` are unchecked; focus is on the `Analytics` checkbox.
7. Tick `Analytics`, then click **`Save my choices`**. Assert: the dialog and the banner both close; `localStorage["pe.consent"]` parses to `{v:1, essential:true, analytics:true, preferences:false, at:<ISO date>}`.
8. Reload. Assert: no banner appears. Click footer **`Cookie settings`**. Assert: `Analytics` is pre-checked. Click **`Reject optional`**. Assert: stored `analytics:false, preferences:false`.
9. Reopen the settings and press **Escape**. Assert: the dialog closes and focus returns to the button that opened it.
10. Assert: footer `#year` = `2026`.

### TC-02: Links
| Link | Action taken | Expected result |
|---|---|---|
| Brandmark `Pushpak Enterprises Building Brands. Delivering Trust.` | request | `/index.html` 200 |
| `Back to home` | click | `/index.html` 200 |
| Tabs `Privacy Policy` / `Terms & Conditions` / `Cookie Policy` | request | `/privacy.html`, `/terms.html`, `/cookies.html` all 200 |
| In-body `Privacy Policy` | click | `/privacy.html#third`; element `#third` exists |
| `pushpakenterprises91@gmail.com` | read href | `mailto:pushpakenterprises91@gmail.com` |
| `+91 99800 00515` | read href | `tel:+919980000515` |
| Footer `Privacy` / `Terms` / `Cookies` | request | all 200 |
| Banner `Cookie Policy` / `Privacy Policy` links | request | both 200 |
| `Skip to content` | Tab, Enter | focus moves to `#main` |

### TC-03: Phone width (375px)
1. Set the viewport to 375 × 812, clear localStorage, and reload.
2. Assert: `document.documentElement.scrollWidth <= 375`; the storage table scrolls inside `.legal-table` only; body text is readable without zoom.
3. Assert: the consent banner does not cover the footer (the body gets bottom padding); the settings dialog fits within 375px and all 3 action buttons are reachable.

## Assertions
- [ ] Title `Cookie Policy — Pushpak Enterprises`, H1 and 5 numbered H2s present.
- [ ] Cookie settings dialog opens, saves, rejects, and closes with Esc; `pe.consent` persists.
- [ ] All internal links return 200; `privacy.html#third` exists.
- [ ] No page-level horizontal scroll at 375px.
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx).

## Screenshots required
- Page initial load with the consent banner
- Cookie settings dialog opened
- 375px viewport

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
