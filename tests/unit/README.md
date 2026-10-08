# Frontend unit tests

Run from the repository root:

```
npm install
npm run test:unit
```

- `trade.test.mjs`, `stock.test.mjs` — the shared CRM screens in `crm/*.js`
  (orders, invoices, accounts, finished-goods stock, serial lookup, spare
  stock requests, RMA) rendered into a DOM (linkedom) against an in-memory
  Firestore (`stubs/firebase-firestore.mjs`). They check what is shown,
  what is written, and that customer/dealer text is never rendered as HTML.
- `links.test.mjs` — every local link, image, script, stylesheet and page
  reference exists with the exact file-name case (GitHub Pages is
  case-sensitive), and every #anchor exists. Outside addresses are checked
  in `tests/e2e/external-links.spec.js`.
- `pages.test.mjs` — every HTML page: inline scripts parse, Firebase imports
  are real SDK exports from one SDK version, local module imports exist,
  and the helper files shared with Cloud Functions are identical.

The Firebase CDN URLs are mapped to the stubs by `loader.mjs`; nothing here
talks to the real Firebase project. Backend tests live in `functions/`
(`cd functions && npm test`).
