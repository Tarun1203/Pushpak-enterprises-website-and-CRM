# Emulator QA (Phase 5 items 2–4)

Runs against the Firebase emulators with the real `firestore.rules`,
`storage.rules` and Cloud Functions. Needs Java 21 and `firebase-tools`.

```
npm install -g firebase-tools
npm --prefix tests/emulator install
npm --prefix functions install
firebase emulators:exec --project demo-pushpak --only firestore,storage "npm --prefix tests/emulator run test:rules"
firebase emulators:exec --project demo-pushpak --only auth,firestore,functions "npm --prefix tests/emulator run test:workflows"
```

- `rules.test.mjs` — field protection, status steps and validation on writes.
- `roles.test.mjs` — what each role (Super Admin, Warehouse, service centers,
  technicians, dealers, distributors, customers, signed-out visitors) can
  read and write.
- `storage.test.mjs` — photo/document uploads and reads.
- `workflows.test.mjs` — whole journeys through rules + Cloud Functions:
  website booking → routing → tracking; ticket lifecycle → server billing →
  wallet credit → claim → payment; dealer order → pricing → credit-checked
  approval → invoice → stock → serial dispatch → delivery → payment; the
  customer portal (verified-phone account, register, warranty, book, track,
  support).

Seed accounts and data: `env.mjs`. Failures are also written to
`results/*.txt` as GitHub annotations.

The Firestore emulator reports a placeholder identity for every write, so
server checks that depend on *who* wrote (roster-checked assignment,
lifecycle step checks, audit entries) are tested through their triggers in
`functions/flow.test.js` instead.
