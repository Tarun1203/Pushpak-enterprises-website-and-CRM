# T030-portal-auth-guards: Portal sign-in wall, auth validation and staff-account rejection

| Field | Value |
|---|---|
| Route | `/portal.html` |
| Source | `portal.html` (inline module script), `functions/index.js` (`ensureCustomerProfile`), `functions/lookup.js` |
| Flow | Unauthenticated visit shows the in-page sign-in view; signed-in user with a different role is rejected |
| Requires auth | no (starts signed out; TC-05/TC-06 sign in non-customer accounts) |
| Required role | anonymous |
| Destructive | no |
| Estimated steps | 34 |

## Preconditions
- App running at `http://localhost:8080`.
- Browser starts signed out: clear site data for `localhost:8080` (IndexedDB `firebaseLocalStorageDb`) before TC-01.
- Run only against the Firebase emulator or a dedicated test project. Never run against the live makwell-websiteandcrm data. `portal.html` hard-codes the `makwell-websiteandcrm` config and has no `connect*Emulator` calls. Before any sign-in step, open DevTools → Network and confirm that auth and Firestore traffic goes to `localhost:9099` / the Firestore emulator, or to the dedicated test project. If the requests go to `identitytoolkit.googleapis.com` / `firestore.googleapis.com` for project `makwell-websiteandcrm`, STOP and mark this task BLOCKED.
- Phone OTP: use the Auth emulator's test phone numbers. The emulator does not send SMS. Read the code from `GET http://localhost:9099/emulator/v1/projects/<projectId>/verificationCodes`. In a dedicated test project, use the fixed OTP configured under Authentication → Sign-in method → Phone numbers for testing.
- Seeded accounts in the Auth emulator / test project:
  - A staff account (role `servicecenter` from the auth catalog) whose `users/{uid}.role` is `servicecenter`, **with phone `+91 9000000009` linked**. The `phone_number` claim is checked before the role, so a staff account without a phone shows the "Verify your mobile" view instead.
  - An email/password account with **no phone linked** and no `users/{uid}` doc (used in TC-06). Create it during the test with `Create a new account` (see Test data).
- Only TC-06 writes to Firestore (`ensureCustomerProfile` is never reached, but creating the account writes to Auth).

## Test data
- `invalidPhoneShort = "12345"`
- `invalidPhoneStart = "5000000001"` (first digit must be 6–9)
- `validTestPhone = "9000000002"` (Auth-emulator / test-project test number)
- `badOtpShort = "12"`
- `wrongOtp = "000000"`. This must not be the fixed OTP for `validTestPhone`.
- `fixedOtp` = the emulator-issued code / test-project fixed code for `+91 9000000002`
- `emailEmpty = ""`, `passEmpty = ""`
- `wrongEmail = "qa-auto-nobody@example.test"`, `wrongPass = "WrongPass#1"`
- `signupName = "QA-AUTO Unverified {runId}"`, `signupEmail = "qa-auto-unverified+{runId}@example.test"`, `signupPass = "QaAuto#2026"`
- `shortPass = "abc"`
- Staff credentials: resolved by the runner for role `servicecenter`. Never write them here.

## Steps

### TC-01: Signed-out visit shows the sign-in view, not the portal
1. Navigate to `/portal.html`.
2. Assert: document title is `My Account — Pushpak Enterprises`, header shows `Pushpak Enterprises` / `My Account`, and the link `← Back to website` points to `index.html`.
3. Assert: `Loading…` card is replaced by the `#view-auth` card with heading `Sign in` and sub-text `Track your products, warranty and service requests in one place.`
4. Assert: URL is still `/portal.html` (no redirect).
5. Assert: `#view-app`, `#view-verify` are hidden; header `#who` block (name / phone / `Sign out`) is hidden; nav tabs `Home`, `My Products`, `Register a Product` are not visible.
6. Assert: tab `Mobile OTP` is active, showing `Your name (first time only)`, `Mobile number` with the fixed `+91` prefix, and button **`Send OTP`**.

### TC-02: Auth tab switching
1. Click tab **`Email & password`**.
2. Assert: fields `Your name (when creating an account)`, `Email`, `Password` and buttons **`Sign in`**, **`Create a new account`**, **`Forgot password?`** are visible. The phone fields are hidden. The note `New email accounts verify their mobile number once with an OTP, …` is visible.
3. Type `x` in `Email`, then click **`Sign in`** with an empty password so `#auth-msg` shows an error. Click tab **`Mobile OTP`**.
4. Assert: phone fields are visible again and `#auth-msg` is empty (tab switch clears the message).

### TC-03: Mobile OTP validation
| Action | Input | Expected `#auth-msg` (red) |
|---|---|---|
| Click **`Send OTP`** | `Mobile number = ""` | `Enter a valid 10-digit mobile number.` |
| Click **`Send OTP`** | `Mobile number = "12345"` | `Enter a valid 10-digit mobile number.` |
| Click **`Send OTP`** | `Mobile number = "5000000001"` | `Enter a valid 10-digit mobile number.` |
| Click **`Send OTP`** | `Mobile number = "9000000002"` | green `OTP sent.`; step 2 shows `Enter the 6-digit OTP sent to +91 9000000002` |
| Click **`Verify & continue`** | `OTP = "12"` | `Enter the 6-digit OTP.` |
| Click **`Verify & continue`** | `OTP = "000000"` | `That OTP is not correct.` |
| Click **`Use a different number`** | — | step 1 visible again, OTP field cleared, `#auth-msg` empty |

Do NOT enter `fixedOtp` here. Completing the phone sign-in is covered in T031.

### TC-04: Email & password validation
Click tab **`Email & password`** first.

| Action | Input | Expected `#auth-msg` |
|---|---|---|
| Click **`Sign in`** | Email `""`, Password `""` | `Enter your email and password.` |
| Click **`Sign in`** | `qa-auto-nobody@example.test` / `WrongPass#1` | `Email or password is not correct.` |
| Click **`Create a new account`** | Name `""`, any email/password | `Enter your name to create an account.` |
| Click **`Create a new account`** | Name `QA-AUTO X`, Email `""`, Password `""` | `Enter an email and a password.` |
| Click **`Create a new account`** | Name `QA-AUTO X`, Email `not-an-email`, Password `QaAuto#2026` | `Enter a valid email address.` |
| Click **`Create a new account`** | Name `QA-AUTO X`, Email `qa-auto-short+{runId}@example.test`, Password `abc` | `Choose a password of at least 6 characters.` |
| Click **`Forgot password?`** | Email `""` | `Enter your email above first.` |
| Click **`Forgot password?`** | Email `qa-auto-nobody@example.test` | green `If that email has an account, a reset link is on its way.` |

### TC-05: Staff account is signed out with "use the CRM login"
1. On `/portal.html`, tab **`Email & password`**, enter the staff (`servicecenter`) credentials resolved by the runner. Click **`Sign in`**.
2. Assert: `Loading…` card appears briefly, then the `#view-auth` card is shown again.
3. Assert: `#auth-msg` reads exactly `That is a staff account — please use the CRM login instead.`
4. Assert: `#view-app` never became visible (no `Home` nav, no `Hello` heading), and header `#who` is hidden.
5. Reload the page. Assert: the sign-in view is shown (the session was signed out, so there is no auto sign-in).
6. Assert: no `users/{uid}` change for the staff uid (role is still `servicecenter`, and `phone10` / `contact` were not added).
7. Variant: if the staff account has no linked phone, expect the `Verify your mobile` view instead. Record that, click **`Sign out`** (`#v-signout`), and mark TC-05 BLOCKED (seed gap), not failed.

### TC-06: Email account without a verified phone gets the "Verify your mobile" wall
1. Tab **`Email & password`**: Name `signupName`, Email `signupEmail`, Password `signupPass`. Click **`Create a new account`**.
2. Assert: heading `Verify your mobile` is shown with sub-text `We link your account to your mobile number — the one on your product registration and service requests.`
3. Assert: portal content (`#view-app`) is hidden and `#who` is hidden.
4. Click **`Send OTP`** with `Mobile number = "12345"`. Assert `#verify-msg`: `Enter a valid 10-digit mobile number.`
5. Click **`Sign out`** (`#v-signout`). Assert: the `Sign in` view is shown.
6. Reload. Assert: the `Sign in` view is still shown.

### TC-07: Button coverage (signed out)
| Button | Action taken | Expected result |
|---|---|---|
| `Mobile OTP` | click | phone step 1 visible, email fields hidden |
| `Email & password` | click | email fields visible, phone fields hidden |
| `Send OTP` (`#p-send`) | click with valid number | button disabled while sending, then step 2 |
| `Use a different number` | click | back to step 1 |
| `← Back to website` | click | navigates to `index.html` |

### TC-08: Negative & edge cases
- Mobile number `+91 90000-00002` (with prefix, space, dash) → **`Send OTP`** accepts it (normalized to `9000000002`), and step 2 shows `+91 9000000002`.
- Go offline (DevTools → Offline), tab `Email & password`, sign in with `wrongEmail`/`wrongPass` → `#auth-msg`: `No connection. Check your internet and try again.` Go back online afterwards.
- Click **`Send OTP`** for the same test number 6+ times quickly → either `OTP sent.` or `Too many attempts. Please wait a while and try again.` No other text is allowed.

## Assertions
- [ ] Signed-out visit renders `Sign in` in place at `/portal.html` (no redirect).
- [ ] Protected content (`#view-app`, nav tabs, `#who`) is never visible while signed out, unverified, or staff.
- [ ] Every validation message matches the exact text in the tables above.
- [ ] Staff account: exact message `That is a staff account — please use the CRM login instead.` and the session is ended.
- [ ] Unverified email account: `Verify your mobile` view, and `Sign out` returns to `Sign in`.
- [ ] No console errors except the `console.error` the page logs for the Firebase auth errors it deliberately triggers in TC-03, TC-04 and TC-08.
- [ ] No failed network requests (no 4xx/5xx) except the expected Auth 400s for wrong password / wrong OTP / invalid email / weak password.

## Screenshots required
- Page initial load (signed out)
- `Email & password` tab
- Each validation error state in TC-03 and TC-04
- Staff rejection message (TC-05)
- `Verify your mobile` view (TC-06)

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
