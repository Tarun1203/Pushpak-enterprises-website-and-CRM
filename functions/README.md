# Cloud Functions — server-side code generation

`index.js` issues the Service Center Code (`SC-0001`, …) and the Technician
Code (`TC-0001`, …). Clients can no longer set or change either one
(`firestore.rules` rejects it), and the two counters
(`counters/servicecenter-master`, `counters/technician-master`) are writable
only from here.

## One-time setup

1. **Upgrade the Firebase project to the Blaze (pay-as-you-go) plan** — Cloud
   Functions can't be deployed on the free Spark plan. Usage here is a couple
   of tiny invocations per new center/technician, far inside the free tier;
   set a budget alert in Google Cloud Billing anyway.
2. Open Firebase Console → Firestore Database and note the **location**
   (e.g. `asia-south1`). Put it in `REGION` at the top of `index.js`.
3. Install the CLI and sign in: `npm install -g firebase-tools`, `firebase login`.

## Deploy (from the repo root)

```
cd functions && npm install && cd ..
firebase deploy --only functions
firebase deploy --only firestore:rules,storage
```

Deploy the functions **before** (or together with) the new rules and CRM pages.
Until the functions exist, new profiles/technicians simply show "Being
assigned…" and get their code the next time the record is saved after deploy.

## Tests

`cd functions && npm test` (runs the numbering logic against an in-memory fake).
