# T112-crm-areamanager-nav-sweep: Area Manager dashboard — sidebar nav sweep and placeholder sections

| Field | Value |
|---|---|
| Route | `/crm/CRMareamanager.html` |
| Source | `crm/CRMareamanager.html` |
| Flow | Navigate to every sidebar section; unbuilt sections show the "isn't built yet" placeholder; Sign out |
| Requires auth | yes |
| Required role | areamanager |
| Destructive | no |
| Estimated steps | 22 |

## Preconditions
- App running at `http://localhost:8080`.
- Sign in as `areamanager`. Credentials come from the env vars `QA_CRED_AREAMANAGER_USERNAME` and `QA_CRED_AREAMANAGER_PASSWORD` (or `QA-tests/.qa-catalog/auth.local.json` via `scripts/auth-resolve.mjs`). Never write the values into this file or the report. If they are unset, mark the task **BLOCKED (no areamanager credential)**.
- **Dependency:** you cannot get an areamanager session today, because `crm/login.html` `ROLE_REDIRECTS` has no `areamanager` entry (see T111). If T111 TC-01 fails, mark this task **BLOCKED (depends on T111 — areamanager login gap)**. Do not fake a session.
- Seed data: a user doc `users/{uid}` with `role: "areamanager"` and `accessDisabled` not `true`.
- **Live-project safety gate:** the page hardcodes `projectId: "makwell-websiteandcrm"`. If the sign-in or the `users/{uid}` read would go to the live project and not to a local Firebase emulator or a dedicated test project, mark the task **BLOCKED (would hit live Firebase project)**.

## Test data
- `dashboardUrl = "http://localhost:8080/crm/CRMareamanager.html"`
- `placeholderSmall = "This module is on the roadmap — it'll be built out next, module by module."`
- `placeholderBig(label) = "<label> isn't built yet"`
- `unbuiltSub = "Not built yet"`, `dashboardSub = "Welcome back"`
- Sidebar groups, in order: `Overview`, `My Area`, `Service`, `Inventory (Read-only)`, `Approvals`, `Operations`

## Steps

### TC-01: Happy path — Dashboard renders and sidebar structure is correct
1. Sign in as `areamanager` (after the T111 fix), then navigate to `dashboardUrl`.
2. Assert: `#page-title` is `Dashboard`, `#page-sub` is `Welcome back`, and the `Dashboard` nav item has class `active`.
3. Assert: the sidebar header reads `Pushpak Enterprises` / `Area Service Manager`, and `#user-email` shows the signed-in email.
4. Assert: the 6 group labels appear in the order listed in Test data. Assert there are 14 nav items in total.
5. Assert: `Dashboard` has **no** `soon` badge. Each of the other 13 items shows a `soon` badge.
6. Assert: the stat cards `Status`, `Pending`, `This month` and `Alerts` each show `—` with hint `Module not built yet`. The panel heading `Getting started` is visible.

### TC-02: Nav sweep — every unbuilt section shows the placeholder
For each row, click the nav item and assert all of the following: `#page-title` equals the Label, `#page-sub` equals `Not built yet`, `#content` shows a `.coming-soon` block whose big text is `<Label> isn't built yet` and whose small text is `placeholderSmall`, the clicked item has class `active`, and no other item has it.

| # | Group | Label (click) | Expected big text |
|---|---|---|---|
| 1 | My Area | `Service Centers` | `Service Centers isn't built yet` |
| 2 | My Area | `Technicians` | `Technicians isn't built yet` |
| 3 | My Area | `Coverage Areas` | `Coverage Areas isn't built yet` |
| 4 | Service | `Service Requests` | `Service Requests isn't built yet` |
| 5 | Service | `Assignment & Routing` | `Assignment & Routing isn't built yet` |
| 6 | Service | `SLA & Escalation` | `SLA & Escalation isn't built yet` |
| 7 | Inventory (Read-only) | `Inventory Overview` | `Inventory Overview isn't built yet` |
| 8 | Inventory (Read-only) | `Spare Parts` | `Spare Parts isn't built yet` |
| 9 | Approvals | `Service Center Approvals` | `Service Center Approvals isn't built yet` |
| 10 | Approvals | `Onboarding Approvals` | `Onboarding Approvals isn't built yet` |
| 11 | Operations | `Reports` | `Reports isn't built yet` |
| 12 | Operations | `Performance` | `Performance isn't built yet` |
| 13 | Operations | `Profile` | `Profile isn't built yet` |

After row 13, click **`Dashboard`**. Assert: the title is `Dashboard`, the sub is `Welcome back`, and the 4 stat cards and the `Getting started` panel render again.

Rows 5 and 6 contain `&`. Assert that it renders as a literal `&`, not `&amp;`, in the nav, in `#page-title` and in the placeholder text.

### TC-03: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| Each nav item (14) | click | covered in TC-02 |
| `Sign out` (`#logout-btn`) | click | Redirects to `crm/login.html`, which shows the `CRM login` form and does not auto-redirect (session cleared) |
| `Sign out`, then Back | browser Back to `dashboardUrl` | The guard redirects to `login.html` again and the dashboard is not shown |

### TC-04: Negative & edge cases
- Reload while a placeholder section (for example `Reports`) is active. Assert: the page comes back on `Dashboard` with `Welcome back`. The source does not persist the selected section.
- Click the same nav item twice. Assert: the content is unchanged and there are no duplicate `.coming-soon` blocks.
- Assert: the sidebar does not offer any working write action. No forms or inputs render in any section. The analysis lists no Firestore writes for this page.

## Assertions
- [ ] 14 nav items in 6 groups. Only `Dashboard` has no `soon` badge.
- [ ] Each of the 13 unbuilt sections shows `<Label> isn't built yet` with `Not built yet` as the sub-title.
- [ ] Only one nav item is `active` at a time.
- [ ] `Sign out` ends on `login.html` with the session cleared.
- [ ] No traffic to the live `makwell-websiteandcrm` project. If there is any, the task is BLOCKED.
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx).

## Screenshots required
- Dashboard initial load
- One placeholder section (for example `Service Centers`)
- `Assignment & Routing` placeholder (to check `&` rendering)
- `login.html` after Sign out

## Pass criteria
All TCs pass AND there are no unexpected console or network errors. While the T111 login gap exists, this task is **BLOCKED**, not FAIL.
