# T110-crm-areamanager-auth-guard: Area Manager dashboard — auth guard (signed-out and wrong-role redirect)

| Field | Value |
|---|---|
| Route | `/crm/CRMareamanager.html` |
| Source | `crm/CRMareamanager.html` |
| Flow | Unauthenticated visit is redirected to the login wall; signed-in user with a different role is rejected |
| Requires auth | yes |
| Required role | anonymous |
| Destructive | no |
| Estimated steps | 14 |

## Preconditions
- App running at `http://localhost:8080`.
- TC-01: anonymous. Before you start, clear site data for `localhost:8080` (cookies, localStorage, IndexedDB) so no Firebase Auth session is left over.
- TC-02: a non-areamanager CRM account that `crm/login.html` accepts. Use `technician` (it is in `ROLE_REDIRECTS`). The runner gets it from `QA-tests/.qa-catalog/auth.local.json` via `scripts/auth-resolve.mjs`. If no `technician` entry exists there, mark TC-02 **BLOCKED (no wrong-role credential)**. Do not write any credential into this file or the report.
- **Live-project safety gate (applies to every TC):** the page hardcodes the live Firebase config (`projectId: "makwell-websiteandcrm"`). Keep DevTools Network open for the whole run. If any request goes to `identitytoolkit.googleapis.com`, `securetoken.googleapis.com`, `firestore.googleapis.com` or `makwell-websiteandcrm.firebaseapp.com` for project `makwell-websiteandcrm` (and is not routed to a local Firebase emulator), stop immediately and mark the affected TC **BLOCKED (would hit live Firebase project)**. Loading the SDK scripts from `www.gstatic.com/firebasejs/10.13.0/` alone does not count as project traffic.

## Test data
- `guardedUrl = "http://localhost:8080/crm/CRMareamanager.html"`
- `loginUrl = "http://localhost:8080/crm/login.html"`
- `wrongRole = "technician"` (landing page `CRMtechnician.html` according to `ROLE_REDIRECTS`)
- `gateText = "Checking your session…"`

## Steps

### TC-01: Signed-out visit redirects to login
1. Confirm site data for `localhost:8080` is cleared (Preconditions).
2. Navigate to `guardedUrl`.
3. Assert: until auth resolves, the `#gate` overlay with text `Checking your session…` is the only visible content. `#app` (sidebar with "Area Service Manager", the `Dashboard` heading, the `Sign out` button) is not visible.
4. Assert: the browser redirects to `loginUrl` (`crm/login.html`). The page shows heading `CRM login`, the `Email` and `Password` inputs, and the `Sign in` button.
5. Assert: no Area Manager content was rendered at any point. The sidebar text `Area Service Manager` and the stat cards `Status` / `Pending` / `This month` / `Alerts` never appeared.
6. Press browser Back. Assert: you land on `login.html` again, either straight away or after `CRMareamanager.html` redirects again. The dashboard is not shown.

### TC-02: Signed-in user with a different role is rejected and signed out
1. Navigate to `loginUrl`.
2. Sign in as `technician` (credentials resolved by the runner). Click **`Sign in`**.
3. Assert: status `Signed in — redirecting…` appears, then the browser lands on `CRMtechnician.html`.
4. Navigate directly to `guardedUrl`.
5. Assert: `#gate` (`Checking your session…`) shows, then the browser redirects to `crm/login.html`. Area Manager content (`#app`) is never visible.
6. Assert: on `login.html` the user is **signed out**. The `CRM login` form is shown and the page does not auto-redirect to `CRMtechnician.html`. This works because `CRMareamanager.html` calls `signOut(auth)` before it redirects.
7. Assert: `login.html` shows no error banner (`#error-msg` is hidden). The guard redirects to plain `login.html` without `?deactivated=1`.
8. Navigate to `http://localhost:8080/crm/CRMtechnician.html`. Assert: it also redirects to `login.html`, which confirms the session was cleared.

### TC-03: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| `Sign out` (`#logout-btn`) | not reachable in this task | It is behind the guard. It is covered in T112 once an areamanager session is possible. |

### TC-04: Negative & edge cases
- Visit `http://localhost:8080/crm/CRMareamanager.html?x=1` while signed out. Assert: the same redirect to `login.html`.
- An account whose `users/{uid}` doc is missing, or has `accessDisabled === true`: the source signs out and redirects to `login.html` (the same path as TC-02). Run this only if such a fixture exists in an emulator or test project. Otherwise record it as **NOT RUN (no fixture)**.

## Assertions
- [ ] `#app` is never visible to a signed-out visitor.
- [ ] Signed-out visit ends on `crm/login.html`.
- [ ] Wrong-role visit ends on `crm/login.html` with the user signed out.
- [ ] No traffic to the live `makwell-websiteandcrm` project. If there is any, the TC is BLOCKED, not PASS.
- [ ] No console errors in DevTools at any step. The only allowed exception is `Role check failed:`, and only if the Firestore read is denied in an emulator setup.
- [ ] No failed network requests (no 4xx/5xx).

## Screenshots required
- The `Checking your session…` gate (if you can capture it before the redirect)
- `login.html` after the signed-out redirect
- `login.html` after the wrong-role redirect (signed out, no error banner)

## Pass criteria
TC-01 and TC-02 pass, no Area Manager content is ever shown to an unauthorized visitor, AND there are no unexpected console or network errors. Any TC that would send traffic to the live Firebase project is BLOCKED, not PASS.
