# T054-crm-superadmin-destructive-suspend-technician: Destructive — Suspend / Reinstate technician

| Field | Value |
|---|---|
| Route | `/crm/CRMsuperadmin.html` → nav **Technicians** |
| Source | `crm/CRMsuperadmin.html` (`renderTechniciansOverview` ~5334-5407: `.tech-suspend-btn` with `confirm()`; `getTechniciansCache` / `renderRoutingControlsForCenterRequest` exclude suspended technicians ~6284, ~8334) |
| Flow | Suspend a technician: confirm → Cancel (no change), confirm → OK (suspended), Reinstate (no confirm) |
| Requires auth | yes |
| Required role | superadmin |
| Destructive | yes |
| Estimated steps | 20 |

## Preconditions
- App running at `http://localhost:8080`
- Signed in as `superadmin` (env `QA_CRED_SUPERADMIN_USERNAME` / `QA_CRED_SUPERADMIN_PASSWORD`).
- **Run only against the Firebase emulator or a dedicated test project — never the live makwell-websiteandcrm data.** Suspend writes `technicianAvailability/{uid}`. The page hard-codes the live `makwell-websiteandcrm` config with no emulator switch. If traffic would reach the live project, **mark this task BLOCKED** and stop.
- Technician `QA-AUTO Technician {runId}` (`qa-auto+tech-{runId}@example.test`) exists and is not suspended. T052 TC-02 creates it.
- **Only ever suspend a `QA-AUTO` technician.** Never act on a real technician row.

## Test data
- `techName = "QA-AUTO Technician {runId}"`
- `confirmText = "Suspend QA-AUTO Technician {runId}? They won't be able to change their own availability until reinstated."`

## Steps

### TC-01: Suspend — confirm Cancel leaves state unchanged
1. Click nav **Technicians**. Assert: `#page-title` = `Technicians`, `#page-sub` = `All technician accounts`.
2. Locate the row whose Name = `techName`. Assert: its first action button reads **Suspend**, and Availability is `—` or a non-`Suspended` pill.
3. Click **Suspend**. Assert: the browser confirm text equals `confirmText` exactly.
4. Click **Cancel**. Assert: the button still reads **Suspend** and is enabled, and no `technicianAvailability` write happened (Network tab shows no Firestore commit, or `technicianAvailability/{uid}.suspended` is absent or `false`).

### TC-02: Suspend — confirm OK suspends
1. Click **Suspend** on the same row and accept the confirm.
2. Assert: the table re-renders. The row's Availability shows the red pill `Suspended`, and the button now reads **Reinstate**.
3. Assert in Firestore: `technicianAvailability/{uid}` has `suspended: true` and `updatedAt` set.
4. Reload the page and reopen **Technicians**. Assert: it is still `Suspended` / **Reinstate** (persisted).
5. **Downstream effect:** open nav **Stock Movement → + Transfer**. Assert: the `To` dropdown still lists `QA-AUTO Technician {runId} — Technician`. Transfer does not filter suspended technicians, so record this as observed behaviour. Click **Cancel**. Then, if a seeded unassigned `centerRequests` ticket with status `new` exists, open it from **Service** and assert that `techName` is **absent** from `Select technician…` (suspended technicians are excluded from routing).

### TC-03: Reinstate (no confirm)
1. On **Technicians**, click **Reinstate** on the row.
2. Assert: **no** confirm dialog appears (source only confirms when suspending).
3. Assert: the button returns to **Suspend**, the Availability pill is no longer `Suspended`, and Firestore shows `suspended: false`.

### TC-04: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| `Suspend` | click → cancel confirm | no state change, button stays `Suspend` |
| `Suspend` | click → confirm proceed | Availability `Suspended`, button `Reinstate`, `suspended: true` |
| `Reinstate` | click | no dialog, button `Suspend`, `suspended: false` |
| `Full profile` | click | dialog `QA-AUTO Technician {runId} — full profile` (or the roster-missing message); **Close** closes it |

### TC-05: Negative & edge cases
- Double-click **Suspend** → OK quickly. Assert: exactly one write. The button is disabled after the first click (`btn.disabled = true`), and the final state is `Suspended`, not toggled back.
- Toggle DevTools offline, click **Suspend** → OK. Assert: alert `Could not update this technician. Check the console for details.` and the button is re-enabled. Toggle back online and Reinstate if needed.

## Assertions
- [ ] Confirm text matches `confirmText` exactly.
- [ ] Cancel causes no write. OK sets `suspended: true` and shows `Suspended` / `Reinstate`.
- [ ] Reinstate has no confirm and sets `suspended: false`.
- [ ] Suspended technician is excluded from the Service → Assign technician list.
- [ ] Final state of the QA-AUTO technician is **not suspended** (cleanup).
- [ ] No console errors in DevTools at any step, except `Toggle suspension failed:` in the offline case.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected.

## Screenshots required
- Technicians list initial load
- Suspend confirm dialog
- Row in `Suspended` / `Reinstate` state
- Row after Reinstate

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
