# Standard operating procedures (SOP)

Short, role by role. Screens are named as they appear in the CRM.

## Admin (Head Office)
**Daily:** open Dashboard → check red notices, Spare Stock Requests, Claims waiting approval, SLA escalations.
**New user:** Users → Add → role → save. The person signs in with the email; ask them to change the password at first login.
**Switch someone off** (leaves, suspended, contract ended): set their status to Suspended/Terminated (technicians: Service Center → Technicians) or switch the account off. Their access stops within a minute, including data access, not only the login screen.
**Masters** (pincodes, territories, products, categories, spares, warranty plans): change here only. Do not create duplicates; the system warns.
**Claims & payments:** open the claim → check tickets → Approve (amount) → record payment (method and reference). Print the claim voucher for records.
**Weekly:** Administration → Audit log (type in the box to find a job, claim or person) → look for unexpected role/status changes. Check Known issues.
**Before a release:** follow DEPLOY-ROLLBACK.md. **Monthly:** run a backup restore check (BACKUP-RECOVERY.md).

## Service Center
1. Requests → open → Accept. Assign a technician (the list shows who is on leave, off today or not authorized for the brand).
2. Set the appointment (only inside the technician's working hours, not on closures).
3. If a part is needed: Request spare, or transfer from center stock to the technician.
4. When the technician finishes: Verify the repair → Close. Print the service voucher if the customer wants a copy.
5. Keep working hours, holidays and technician list up to date; wrong data causes wrong bookings.

## Technician (phone)
1. Sign in → My Jobs. Set your availability (Available / On break / Offline).
2. Open job → Accept → Appointment → travel → At customer.
3. Diagnose; photograph the serial number. Need a part? Request Spare (or draw from your center's stock).
4. Use a part: Consume Spare (never guess the number). Finish the repair.
5. Close: pick the outcome, write what you did, add photos. Show the customer the voucher; get their signature if they want a printout.
6. No signal? The red banner says so. Do not keep tapping Save; wait for "Back online", then check the job before repeating.

## Warehouse
1. Receive: Stock → Receive: add items and quantity, then confirm. Check the count against the delivery challan.
2. Spare requests: open → check item/quantity/linked job → Approve or Reject (give a reason).
3. Dispatch: enter transporter, docket/LR number, vehicle, date, photo of the docket → Dispatch → print the dispatch challan.
4. Returns: receive defective parts, mark received, record the condition.
5. Never edit stock to "fix" numbers without a reason; use an adjustment with a note.

## Customer help (phone/WhatsApp)
Ask for the card number or phone number; look up the registration in Customer 360; read out status and appointment; send the voucher text with the WhatsApp button.

See TROUBLESHOOTING.md when something does not work.
