# T130-crm-bug-tracker-smoke: Bug Tracker — page renders, data sources, empty state, title escaping

| Field | Value |
|---|---|
| Route | `/crm/bug-tracker.html` |
| Source | `crm/bug-tracker.html` |
| Flow | Smoke — load bug list (GitHub API → `crm/bug-data.json` fallback), filter, empty state, safe rendering |
| Requires auth | no |
| Required role | anonymous |
| Destructive | no |
| Estimated steps | 26 |

## Preconditions
- App running at `http://localhost:8080`
- anonymous (no sign-in; page has no Firebase auth guard)
- `crm/bug-data.json` present in the repo (static QA snapshot, `issues[]` array; currently contains issue `#5` "Automated QA: Site/CRM Test Failures")
- Browser localStorage cleared for the origin (removes `pushpak_bug_snapshot` so the "Changed" count starts at 0)
- Runner can intercept network requests (Playwright `page.route`) for TC-03 / TC-04

## Test data
- `noMatchQuery = "zzqa-no-such-bug-130"`
- `xssTitle = "<img src=x onerror=\"window.__qaXss=1\"> QA <b>bold</b> & 'quote'"`
- `xssLabel = "module:<script>window.__qaXss=2</script>"`
- `fixtureIssue` (single-item array used for TC-04) =
  `{"number":9130,"title":<xssTitle>,"state":"open","html_url":"https://github.com/Tarun1203/Pushpak-enterprises-website-and-CRM/issues/9130","labels":[{"name":"high"},{"name":<xssLabel>}],"body":"","user":{"login":"qa-bot"},"created_at":"2026-10-01T00:00:00Z","updated_at":"2026-10-02T00:00:00Z"}`
- GitHub API URL pattern: `https://api.github.com/repos/Tarun1203/Pushpak-enterprises-website-and-CRM/issues*`
- Snapshot URL pattern: `**/crm/bug-data.json`

## Steps

### TC-01: Happy path — Page loads and shows the bug list
1. Navigate to `http://localhost:8080/crm/bug-tracker.html`.
2. Assert: the document response is HTTP 200 and `document.title` is `Pushpak Enterprises — Bug Tracker`.
3. Assert: eyebrow text `Pushpak Enterprises · QA` and title text `Bug Tracker` are visible (the page has no `<h1>`; the title is `div.title`).
4. Assert: the table header row reads `Bug | Severity | Status | Module | Reporter | Updated`.
5. Wait until `#rows` no longer contains `Loading…`. Assert: either (a) live mode — `#msg` is empty and ≥ 1 row exists, or (b) fallback mode — `#msg` shows the amber notice starting `Live GitHub API is unavailable (` and ending `Showing the latest automated QA snapshot.` and ≥ 1 row exists. Record which mode occurred.
6. Assert: stat cards `Total`, `Open`, `In Progress`, `Fixed / Closed`, `Critical / High`, `Changed` all show a number (not `—`); `Total` equals the number of rendered rows when filters are at defaults.
7. Assert: each bug title link starts with `#<number> · ` and has `target="_blank"` and an `href` beginning `https://github.com/Tarun1203/Pushpak-enterprises-website-and-CRM/issues/`.
8. Select `closed` in the `#state` select. Assert: every row's Status pill is `CLOSED`. Reset to `All states`.
9. Select `Severity` in `#sort`. Assert: rows are ordered CRITICAL → HIGH → MEDIUM → LOW.
10. Click **`↻ Refresh`**. Assert: `#msg` briefly shows `Checking latest QA bug data…`, then the list re-renders with the same `Total`.

### TC-02: Button & link coverage
| Button / link | Action taken | Expected result |
|---|---|---|
| `↻ Refresh` (`#refresh`) | click | data reloads, no console error (TC-01 step 10) |
| `+ Report Bug` (`#newBug`) | read `href` (do not follow) | `href` is `https://github.com/Tarun1203/Pushpak-enterprises-website-and-CRM/issues/new?template=bug_report.md`, `target="_blank"`, `rel="noopener"` |
| `CRM Dashboard` | request `href` `CRMsuperadmin.html` | resolves to `/crm/CRMsuperadmin.html` with HTTP 200 (page then shows its own login guard — not a 404) |

### TC-03: Empty states
1. With data loaded, type `noMatchQuery` into `#q` (placeholder `Search bugs, modules, labels…`).
2. Assert: the table shows exactly one row with text `No bugs match the current filters.`. Clear `#q`; rows return.
3. Intercept the GitHub API pattern → respond HTTP 403. Intercept the snapshot pattern → respond 200 with `{"generated_at":"2026-10-11T00:00:00Z","source":"GitHub Issues","issues":[]}`. Reload.
4. Assert: `#msg` shows `Live GitHub API is unavailable (GitHub API 403). Showing the latest automated QA snapshot.`; all six stat cards show `0`; the table shows `No bugs match the current filters.`.
5. Intercept both the API and the snapshot → HTTP 404. Reload.
6. Assert: `#msg` shows the red error `Could not load bugs: snapshot 404.` and `#rows` is empty (no `Loading…` left behind). No uncaught exception in the console.

### TC-04: Issue titles and labels are HTML-escaped
1. Intercept the GitHub API pattern → respond 200 with `[fixtureIssue]`. Reload the page.
2. Assert: the first row's link text is literally `#9130 · <img src=x onerror="window.__qaXss=1"> QA <b>bold</b> & 'quote'` (angle brackets shown as text).
3. Assert: the row contains no `<img>` element and no `<b>` element inside `td.bug`; `window.__qaXss` is `undefined`.
4. Assert: the Module cell shows the literal text `<script>window.__qaXss=2</script>` and no `<script>` element was inserted into `#rows`.
5. Assert: no alert dialog opened at any point.
6. Repeat steps 1–5 with the API → 403 and the snapshot → `{"issues":[fixtureIssue]}`. Assert: the same escaped output in fallback mode.

### TC-05: Phone width (375px)
1. Set the viewport to 375 × 812 and reload with no interception.
2. Assert: `document.documentElement.scrollWidth <= 375` (no page-level horizontal scroll). The table (min-width 1000px) scrolls only inside its `.table` container.
3. Assert: the header stacks vertically, stat cards display in 2 columns, `#q` spans the full toolbar width, and `↻ Refresh`, `+ Report Bug`, `CRM Dashboard` are fully visible and tappable.

## Assertions
- [ ] Title `Pushpak Enterprises — Bug Tracker`, HTTP 200.
- [ ] List loads from the live API or falls back to `crm/bug-data.json` with the amber notice.
- [ ] Filter empty state shows `No bugs match the current filters.`.
- [ ] An empty snapshot renders zeroed stats; a total failure shows `Could not load bugs: …` with no crash.
- [ ] Titles, labels, and modules render as text; no injected element or script executes.
- [ ] `CRM Dashboard` link does not 404; `+ Report Bug` points to the GitHub bug template.
- [ ] No page-level horizontal scroll at 375px.
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx) except the deliberately intercepted ones in TC-03/TC-04 and a GitHub API 403 rate-limit in TC-01 (fallback mode).

## Screenshots required
- Page initial load (note live vs fallback mode)
- Filter empty state
- Empty-snapshot state and total-failure error state
- Escaped XSS fixture row
- 375px viewport

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
