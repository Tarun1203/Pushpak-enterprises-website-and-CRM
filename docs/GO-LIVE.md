# Go-live checklist

Run `node scripts/qa/go-live-gate.mjs` (CI runs it on every push). It prints one of:
- 🟢 **GO**: everything below is true.
- 🟡 **GO WITH KNOWN ISSUES**: nothing critical, but you still have items to confirm or accept (listed by the gate).
- 🔴 **NO-GO**: a critical check or test failed. Do not enter real data.

## 🔴 Must be zero (the gate checks these automatically)
Exposed credentials · privilege escalation (rules tests) · cross-user and cross-center leakage (rules tests) · negative inventory · duplicate server IDs · broken authentication (login/role/switch-off tests) · broken pages (every dashboard opens in 7 browsers/devices) · console errors.

## 🟡 Must be documented → KNOWN-ISSUES.md
Minor UI issues · browser limits · offline limits · non-critical performance · future enhancements.

## 🟢 Must be confirmed by you
Set each to `true` in `docs/go-live-confirmations.json` only after checking it yourself on the real system:
Firebase production project · Firestore rules · Storage rules · Cloud Functions · Firebase Auth · GitHub Pages · domain · SSL · **backup on and a restore drill passed** (BACKUP-RECOVERY.md) · **monitoring alerts created** (MONITORING.md) · Admin, Service Center, Technician and Warehouse accounts · master, product and spare data · **UAT signed off** (UAT.md) · training data removed (TRAINING.md).

## Day-one routine
Sign in as Admin → health check (MONITORING.md) → watch the first 10 real jobs end to end → review the Audit log at the end of the day.
