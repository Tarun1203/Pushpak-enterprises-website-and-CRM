# Performance targets and how they are checked

| Metric | Target | Checked by |
|---|---|---|
| Public homepage | < 3 s | `performance.spec.js` (slow 4G, 3.5 s budget incl. test overhead) |
| Brand page | < 3 s | `performance.spec.js` |
| CRM login | < 2 s | `performance.spec.js` |
| CRM dashboard | < 3 s | `performance.spec.js` (4x slower CPU, 6 s budget) |
| Section render, no full-history downloads | "Loading…" clears < 4 s | `performance.spec.js` |
| Large lists | audit log capped at 500, lists paged | `performance.spec.js`, code |
| Mobile usable | 320 px+ | `fit.spec.js`, `mobile.spec.js`, `responsive.spec.js`, `phase10-field.spec.js` |
| Console errors / critical failed resources | 0 | every spec asserts no page errors; `security.spec.js` |

Not measured by the automated suite (needs the live Firebase project): real Firestore query time, Cloud Function cold start, real 3G phones. Measure these during UAT on the live project and write the numbers here: ______ .
