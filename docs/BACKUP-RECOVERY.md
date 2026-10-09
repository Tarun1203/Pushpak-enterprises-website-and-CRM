# Backup and recovery

Project: `makwell-websiteandcrm` (Firebase). Everything business-critical is in **Firestore** (records) and **Cloud Storage** (photos, documents). The website/CRM pages are in GitHub and can be redeployed any time.

> Status: **these steps are documented but not yet switched on or test-restored.** Go-live needs items 1–3 done and one restore drill passed (see GO-LIVE.md). This cannot be done from the test suite; it needs your Google Cloud access.

## What to switch on (once)
1. **Point-in-time recovery (PITR)** keeps 7 days of history so you can recover from a mistake:
   `gcloud firestore databases update --database="(default)" --enable-pitr --project makwell-websiteandcrm`
2. **Daily export** to a backup bucket (create `gs://makwell-websiteandcrm-backups`, set a lifecycle rule to delete after 90 days):
   `gcloud firestore export gs://makwell-websiteandcrm-backups/daily/$(date +%F) --project makwell-websiteandcrm`
   Automate with Cloud Scheduler → a Cloud Run job, or run it from an admin PC with Task Scheduler daily.
3. **Storage versioning:** `gcloud storage buckets update gs://makwell-websiteandcrm.firebasestorage.app --versioning`
4. Keep a copy of `firestore.rules`, `storage.rules`, `functions/` in GitHub (already so). Tag every release (DEPLOY-ROLLBACK.md).

## Recovery
| Situation | Do this |
|---|---|
| Someone deleted/changed a few records | Use PITR: export a snapshot from before the change into a *new* database, copy back the records. `gcloud firestore databases clone --source-database="(default)" --snapshot-time=<UTC time> --destination-database=restore-1` |
| Bad data across many records | Import the latest daily export into a new database, compare, copy back. Do **not** import over the live database without a fresh export first. `gcloud firestore import gs://makwell-websiteandcrm-backups/daily/<date> --database=restore-1` |
| Bad rules/functions deployed | Roll back the release (DEPLOY-ROLLBACK.md). |
| Lost photos | Restore the previous object version from Storage versioning. |
| Account compromised | Switch the account off (Users), reset password, check Audit log, revoke sessions (switching off does this). |

## Restore drill (do before go-live, then every quarter)
1. Take an export. 2. Import it to a test database. 3. Check: user count, a service job with photos, a claim, stock levels. 4. Write the date and result here: ______ .

Targets: lose at most 24 hours of data (daily export) or minutes (PITR); service back within 4 hours.
