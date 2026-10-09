# Operational monitoring

Nothing here is switched on by the code; it must be set up once in the Google Cloud / Firebase console for project `makwell-websiteandcrm`. Until it is, failures are only noticed when someone complains.

## Alerts to create (Cloud Monitoring → Alerting → Create policy), notify the Admin email + phone
| Signal | Condition | Why |
|---|---|---|
| Cloud Functions errors | `cloudfunctions.googleapis.com/function/execution_count` with status != ok, more than 5 in 5 minutes | Failed triggers (routing, stock, claims, access switch-off) |
| Function not running | No executions of `escalationSweep` or `documentExpiryCheck` for 25 h | Scheduled jobs stopped |
| Firestore errors | `firestore.googleapis.com/api/request_count` with 5xx/permission-denied spike | Rules or outage problem |
| Auth | Identity Platform sign-in failures spike | Attack or outage |
| Storage | Storage `api/request_count` 5xx | Photo upload failures |
| Budget | Billing budget alert at 50/90/100 % | Blaze plan runaway |

## Daily 2-minute health check (Admin)
1. Open the CRM: no red notice bar; version is the expected one.
2. Firebase Console → Functions → Logs: filter severity Error, last 24 h. Should be empty or explained.
3. Dashboard: SLA escalations and low-stock alerts look sensible (they prove the scheduled jobs ran).
4. Audit log: nothing unexpected.

## In the browser
Every CRM page shows a red bar on unexpected errors and when offline, and logs `[PE-ERR]` in the console (F12) so a person can send a screenshot.

## Automated
GitHub Actions runs the full QA suite on each push and creates an issue "Automated QA: Site/CRM Test Failures" when anything fails.
