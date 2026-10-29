# Authentication and access

## Two sign-in routes

| Who | How | Where |
|---|---|---|
| Staff, dealers, distributors | Email + password (Firebase Auth `signInWithEmailAndPassword`) | `crm/login.html` |
| Customers | Phone number + OTP (invisible reCAPTCHA, `signInWithPhoneNumber`) | `portal.html` ("My Service") |

Anonymous visitors can use the public site: browse, book a service request, track a ticket and use the map. They cannot read anything private.

## How the CRM decides what you can open

1. After sign-in, `login.html` reads `users/{uid}`.
2. No document, or no `role` field → "Your account has no role assigned yet", and it signs you out. (This is exactly what broke the QA account in October 2026: its `users` document was an empty placeholder.)
3. The `role` picks the dashboard: `CRMsuperadmin.html`, `CRMwarehouse.html`, `CRMareamanager.html`, `CRMservicecenter.html`, `CRMtechnician.html`, `CRMdealer.html`, `CRMdistributor.html`. Every dashboard checks the role again on load.
4. The browser is never the authority. Every read and write is checked again by `firestore.rules` and `storage.rules`.

## Roles

| Role | Scope |
|---|---|
| `superadmin` | Everything; the only role that creates Super Admin accounts |
| `warehouse` | Admin-tier for operational data (inventory, claims, products) |
| `areamanager` | Super Admin powers **inside** `districtsCovered` only. Cannot change billing, a ticket's district, or their own districts |
| `servicecenter` | Its own center: requests, technicians, spares, billing view |
| `technician` | Its own jobs |
| `dealer`, `distributor` | Their own orders, sales and customers |
| `customer` | Self-registered through the portal; reads only what matches their verified phone |

## Rule helpers (`firestore.rules`)

- `hasAuth()` is any sign-in, customers included. It is not used to grant CRM access.
- `isSignedIn()` is a signed-in, **non-customer** account that is not switched off. Almost every staff rule gates on it, so a customer account can never act as staff.
- `isCustomer()`, `isAdmin()` (superadmin + warehouse), `isSuperAdmin()`, `isAreaManager()`, `inMyArea(district)`, `isStaff()`.
- `callerActive()` reads `accessDisabled` from the same `users/{uid}` document as the role, so a switched-off account stops working at once.

## Switching an account off

Super Admin can switch any account off or on (`disabledByAdmin`, audited). The `syncAccess_*` functions also set `accessDisabled` from a technician's Suspended / Terminated / Resigned status, a center that is `INACTIVE`, or an expired contract. The rules enforce it.

## Customers

`ensureCustomerProfile` creates `users/{uid}` with `role: customer`. The phone is taken from the verified sign-in token (`phone10`), never from the page. Staff, dealer and distributor accounts cannot be turned into customers, or the other way round. Customers read their own tickets by matching `customerPhone` to their verified phone.

## Passwords

Temporary passwords for new accounts are generated with a cryptographic random source. Password resets use Firebase's email flow (`sendPasswordResetEmail`). Do not store real passwords in the repo or in chat; CI uses the `QA_EMAIL`, `QA_PASSWORD` and `QA_ROLE` GitHub secrets.

## Setting up the QA account

1. Create the user in Firebase Authentication.
2. Create `users/<that uid>` with at least `role: "servicecenter"` (plus `name`, `email`, `createdAt` to match a normal account).
3. Make sure it is not switched off and its `serviceCenterProfiles/<uid>` is not `INACTIVE`.
4. Set `QA_EMAIL`, `QA_PASSWORD`, `QA_ROLE=servicecenter` as GitHub Actions secrets.
