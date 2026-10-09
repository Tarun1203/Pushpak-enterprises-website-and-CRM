# Deployment, version and rollback

## What gets deployed where
| Part | Where | How |
|---|---|---|
| Website + CRM pages | GitHub Pages (this repo, `main`) | Push to `main`; Pages publishes in about a minute |
| Cloud Functions, Firestore rules, Storage rules | Firebase project `makwell-websiteandcrm` | `set FUNCTIONS_DISCOVERY_TIMEOUT=60` then `firebase deploy --only functions,firestore:rules,storage` |

## Release checklist
1. All checks green on GitHub (Actions → Automated Site QA and CI). The go-live gate says GO or GO WITH KNOWN ISSUES (`node scripts/qa/go-live-gate.mjs`).
2. Decide the version number (e.g. 1.0.1). Run `node scripts/stamp-release.mjs 1.0.1` and commit.
3. Tag it: `git tag -a v1.0.1 -m "Release 1.0.1"` and `git push origin v1.0.1`.
4. Deploy Firebase (command above) **before** pushing pages that need new rules/functions.
5. Push pages. Open the CRM: the version shows at the bottom of the sidebar (e.g. `v1.0.1 (a1b2c3d)`). That is how you know which build is live.
6. Smoke test: sign in as each role, open one record, print one voucher.
7. Write the release in KNOWN-ISSUES.md if anything is deliberately left.

## Rollback
- **Pages:** `git revert <bad commit>` then push (do not force-push). Pages republishes the previous behaviour.
- **Rules:** `git checkout <last good tag> -- firestore.rules storage.rules` then `firebase deploy --only firestore:rules,storage`.
- **Functions:** `git checkout <last good tag> -- functions` then `firebase deploy --only functions`. (Firebase Console → Functions also shows the previous revision in Cloud Run if you need it urgently.)
- **Data damaged by the bad release:** BACKUP-RECOVERY.md.
- After rollback: check the version at the bottom of the sidebar and run the smoke test.

Order matters: rules and functions are backward compatible by design, so deploy them first and pages last; on rollback do pages first.
