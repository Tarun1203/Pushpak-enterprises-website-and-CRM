# T031-portal-signin-dashboard-as-customer: Customer signs in, sees the dashboard, navigates, signs out

| Field | Value |
|---|---|
| Route | `/portal.html` |
| Source | `portal.html` (inline module script: `finishSignIn`, `loadAll`, `setView`), `functions/index.js` (`ensureCustomerProfile`) |
| Flow | Customer sign-in (email + password with verified phone, and first-time Mobile OTP), Home dashboard, section navigation, sign out |
| Requires auth | yes |
| Required role | customer |
| Destructive | no |
| Estimated steps | 32 |

## Preconditions
- App running at `http://localhost:8080`.
- Run only against the Firebase emulator or a dedicated test project. Never run against the live makwell-websiteandcrm data. `portal.html` hard-codes the `makwell-websiteandcrm` config. Before signing in, confirm in DevTools → Network that Auth, Firestore and callable traffic (`asia-south1-…/ensureCustomerProfile`) go to the emulators (`localhost:9099`, Firestore emulator, `localhost:5001`) or to the dedicated test project. Otherwise STOP and mark BLOCKED.
- Sign in as `customer`. The runner resolves `QA_CRED_CUSTOMER_USERNAME` / `QA_CRED_CUSTOMER_PASSWORD` and signs in on **this page** (`/portal.html` → tab `Email & password`), not `/crm/login.html`.
- The customer account must be phone-verified: Auth user has phone `+91 9000000001` linked (an Auth-emulator / test-project test number), and `users/{uid}` = `{ role: "customer", phone10: "9000000001", name: "QA-AUTO Customer" }`. If the first sign-in shows `Verify your mobile`, complete it with `9000000001` and the OTP. Get the OTP from the Auth emulator (`GET http://localhost:9099/emulator/v1/projects/<projectId>/verificationCodes`) or use the test project's fixed test OTP.
- TC-03 signs in a **new** phone-only user with the Auth emulator's test phone flow (`+91 9000000002`, emulator code / fixed OTP). This WRITES `users/{uid}` via `ensureCustomerProfile`.
- Seed data is optional. Counts are compared before and after, not against fixed numbers.

## Test data
- Customer credentials: resolved by the runner from `QA_CRED_CUSTOMER_USERNAME` / `QA_CRED_CUSTOMER_PASSWORD`. Never write them here.
- `customerPhone = "9000000001"`. The header must show `+91 9000000001`.
- `newPhoneName = "QA-AUTO Phone {runId}"`
- `newPhone = "9000000002"`
- `otp` = emulator-issued code / fixed test OTP for the number in use

## Steps

### TC-01: Happy path — Customer signs in with email & password and lands on Home
1. Navigate to `/portal.html`. Assert: heading `Sign in`.
2. Click tab **`Email & password`**. Fill `Email` and `Password` with the customer credentials. Click **`Sign in`**.
3. Assert: `Loading…` card shows, then `#view-app` becomes visible and `#view-auth` is hidden.
4. Assert: header `#who` is visible with name `QA-AUTO Customer` (or `Customer` if the profile has no name), phone `+91 9000000001`, and a **`Sign out`** link.
5. Assert: heading `#hello` is `Hello, QA-AUTO Customer` and sub-text is `Everything linked to your mobile number.`
6. Assert: three stat cards labelled `Registered products`, `Open service requests` and `All service requests`. Each number is an integer (not `–`) once loading finishes, and `Open` ≤ `All`.
7. Assert: heading `What would you like to do?` with buttons **`Register a product`**, **`Check warranty`**, **`Book a service`**, **`Track a service`**, **`Get support`**.
8. Assert: `#app-msg` is empty (`Could not load your records right now. Please try again.` is NOT shown).
9. Reload the page. Assert: the user is still signed in and Home renders again without showing `Sign in`.

### TC-02: Section navigation (nav tabs and Home action buttons)
| Click | Active nav tab | Visible section heading |
|---|---|---|
| nav `My Products` | `My Products` | `My Products` |
| nav `Register a Product` | `Register a Product` | `Register a Product` (+ `Your details`) |
| nav `Warranty` | `Warranty` | `Warranty` and `Check a serial number` |
| nav `Book a Service` | `Book a Service` | `Book a Service` (+ `Where should we visit?`) |
| nav `My Services` | `My Services` | `My Service Requests` |
| nav `Service History` | `Service History` | `Service History` |
| nav `Support` | `Support` | `Support` and `Open a new ticket` |
| nav `Home` | `Home` | `What would you like to do?` |
| Home `Register a product` | `Register a Product` | `Register a Product` |
| Home `Check warranty` | `Warranty` | `Warranty` |
| Home `Book a service` | `Book a Service` | `Book a Service` |
| Home `Track a service` | `My Services` | `My Service Requests` |
| Home `Get support` | `Support` | `Support` |

For each row, assert that exactly one `app-*` section is visible and only the listed nav tab has the active (dark) style.

Empty states are valid when the customer has no data: `No products are registered with this mobile number yet. Use “Register a Product”.`, `Register a product to see its warranty here.`, `No service requests yet.`, `No products or service visits yet.`, `No support tickets yet.`

### TC-03: Happy path — First-time Mobile OTP sign-in creates the customer profile
1. Click header **`Sign out`**. Assert: `Sign in` view, and `#who` is hidden.
2. Tab **`Mobile OTP`**: `Your name (first time only)` = `newPhoneName`, `Mobile number` = `9000000002`. Click **`Send OTP`**.
3. Assert: green `OTP sent.`, and the label reads `Enter the 6-digit OTP sent to +91 9000000002`.
4. Enter `otp`. Click **`Verify & continue`**.
5. Assert: portal Home is shown, `#hello` = `Hello, QA-AUTO Phone {runId}`, header phone = `+91 9000000002`, and all three stats = `0`.
6. Assert (Firestore emulator UI / admin read): `users/{uid}` has `role: "customer"`, `phone10: "9000000002"`, `name: "QA-AUTO Phone {runId}"`.
7. Click **`Sign out`**. Sign in again with Mobile OTP `9000000002`, leaving `Your name` empty. Assert: the greeting still shows `Hello, QA-AUTO Phone {runId}` (an empty name does not wipe the saved name).
8. Click **`Sign out`**.

### TC-04: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| header `Sign out` | click | `Sign in` view shown, `#who` and `#view-app` hidden; after reload it is still signed out |
| `← Back to website` | click (while signed in) | navigates to `index.html` |
| nav / Home buttons | click | see TC-02 |

### TC-05: Negative & edge cases
- Sign in, then in DevTools → Application delete the IndexedDB `firebaseLocalStorageDb` and reload → `Sign in` view, with no portal content flashing before `Loading…`.
- Signed in, go offline, reload → either the `Loading…` card stays or `Could not finish signing in. Please try again.` shows on the `Sign in` view. The portal content must not render with someone else's data.
- Signed in as the `9000000001` customer, the stats must count only that phone's records. Cross-check one: the `Registered products` count equals the number of `productRegistrations` docs with `customerPhone == "9000000001"` in the emulator.

## Assertions
- [ ] Email/password customer lands on Home with the correct name, `+91 9000000001`, and integer stats.
- [ ] First-time OTP user gets a `users/{uid}` doc with `role: "customer"` and `phone10` taken from the token.
- [ ] All 8 nav tabs and 5 Home action buttons switch to the correct single section.
- [ ] `Sign out` ends the session (persisted across reload).
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx).

## Screenshots required
- Page initial load (signed out)
- Home dashboard after sign-in
- Each nav section once (8)
- Home after the first-time OTP sign-in
- Final signed-out state

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
