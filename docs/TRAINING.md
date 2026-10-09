# Training and onboarding

## Training data (never use real customers)
- Make one **test** account per role (admin, service center, technician, warehouse, dealer, distributor) with emails like `training.technician@yourdomain` and clearly "TRAINING" in the name.
- Create 2 test service centers, 3 technicians (one on leave, one suspended), 10 spare parts, 3 products with warranty plans, 5 customer registrations, and 5 requests in different statuses.
- Brand all training records with the text "TRAINING" so they can be found and deleted before go-live.
- Delete training users/records (or switch the training accounts off) before real data starts.

## New-user onboarding (30 minutes each)
1. Account created by Admin; first login; change password; confirm the correct dashboard opens.
2. Walk through that role's section in SOP.md using the training data.
3. Do the role's table in UAT.md.
4. Show the red notice bar (offline / error) and what to do about it (TROUBLESHOOTING.md).
5. Show where to get help (Admin contact, this folder).

## Role sessions
| Role | Must be able to do after training |
|---|---|
| Admin | Create/switch off users, masters, approve claims, read audit log, run backup check, release steps |
| Service Center | Accept, assign, schedule, spares, verify and close, print voucher |
| Technician | Phone workflow end to end, offline behaviour, spare bag, closure with photos |
| Warehouse | Receive, approve, dispatch with docket and challan, returns |
| Dealer / Distributor | Place and track orders, view invoices, register customer products |

## Check for understanding
Each trainee completes their UAT table with no help; trainer signs it.
