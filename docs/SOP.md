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
5. Close: pick the outcome, write what you did, add photos. **Customer confirmation:** tap *Send code to customer*; the customer reads out the 4-digit code (from SMS / WhatsApp, or the My Service page on the website). No phone or no code? Switch to *Customer signature*, let them sign on your screen and type their name. If Head Office has made this required, the job will not close without it.
6. No signal? The red banner says so. Do not keep tapping Save; wait for "Back online", then check the job before repeating.

## Warehouse
1. Receive: Stock → Receive: add items and quantity, then confirm. Check the count against the delivery challan.
2. Spare requests: open → check item/quantity/linked job → Approve or Reject (give a reason).
3. Dispatch: enter transporter, docket/LR number, vehicle, date, photo of the docket → Dispatch → print the dispatch challan.
4. Returns: receive defective parts, mark received, record the condition.
5. Never edit stock to "fix" numbers without a reason; use an adjustment with a note.

## Customer help (phone/WhatsApp)
Ask for the card number or phone number; look up the registration in Customer 360; read out status and appointment; send the voucher text with the WhatsApp button.

## Who pays (rate card)
Warehouse → **Service Charge Rates**: under each rate there is **Who pays**. *As per warranty* (default) = Head Office pays in warranty, the customer after. *Company pays* = always free to the customer (e.g. Skevia demo / installation, or free installation on certain MakWell models — use the Size / Model rows set under Categories). *Customer pays* = the customer always pays. Service center billing and the technician's automatic credit follow this setting.

## Who pays — by brand
Warehouse → Service Charge Rates → **Who pays — by brand**. For each brand choose, separately for Installation / Demo and for Repair / Service: **Company pays** (free to the customer; the center / technician claims it from Head Office), **Customer pays**, **As per warranty**, or **Use the rate card rows**. A brand rule beats the rate-card row. Example: Skevia → Company pays for both. The website's Book a Service form then tells the customer the visit is free.

## Store & service-center finder (website map)
Super Admin → Service Operations → **Store & Service Locations**. **Import service centers** copies name, phone, address and map position from each service center's full profile (new ones are shown only if the profile status is Active). **+ Add location** for stores. For the map pin, open the place in Google Maps on a computer and paste the full link from the address bar (or right-click the spot and copy the coordinates); short maps.app.goo.gl links carry no position. **Hide** takes a place off the website without deleting it. Public business details only — never a staff member's personal number.

## Area Service Manager
Super Admin creates the account (Users → Add → role **Area Manager**) and lists the **districts** they manage. The manager then sees only those districts: service centers, technicians (roster and direct), coverage gaps, every ticket, SLA, stock (read-only), spare requests (read-only), approvals, reports and performance.
1. **Assignment & Routing:** website requests nobody was matched to → *Route* → a service center, or straight to a technician for areas with no center. Tickets marked *Needs reassignment* are listed below.
2. **Service Requests:** *Assign / reassign* a technician, or move the ticket to another service center (the old one is cancelled, the number stays the same).
3. **SLA & Escalation:** late tickets first. Breaches are also sent to you automatically.
4. **Approvals:** approve / reject / suspend centers in your districts; approve or reject new technicians.
Tickets are matched to a district from the Pincode Master. After setting this up, Super Admin → Pincode Master → **Fill districts on open tickets** once.

## Customer messages and closing (Super Admin)
Service Operations → **Customer Messages & Closing**.
- **Require the customer's confirmation to close a job:** switch on only after the latest functions are published.
- **Automatic SMS / WhatsApp (MSG91):** sign up at msg91.com, register a template for each message (SMS: DLT; WhatsApp: Meta approval), paste each template ID here, switch the message on, then *Send messages*. The MSG91 auth key goes on the server (`functions/.env`, `MSG91_AUTHKEY=...`, then publish the functions) — never into the website or this screen. *Recent messages* shows what was sent, skipped or failed.

See TROUBLESHOOTING.md when something does not work.
