const { onDocumentWritten, onDocumentWrittenWithAuthContext, onDocumentCreated, onDocumentCreatedWithAuthContext, onDocumentUpdatedWithAuthContext, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const crypto = require('crypto');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { assignCodeIfMissing } = require('./codes');
const { buildAuditEntries } = require('./audit');
const { computeIntakeWarranty, isPossibleDuplicate } = require('./intake');
const { findCandidates, pickLeastLoaded } = require('./routing');
const { rankTechnicians } = require('./technicianMatch');
const Appointment = require('./appointment');
const { checkTransition, checkSpareTransition } = require('./lifecycle');
const Billing = require('./billing');
const Feedback = require('./feedback');
const ProfileGuard = require('./profileGuard');
const TradePricing = require('./tradePricing');
const Finance = require('./finance');
const Stock = require('./stock');
const Spares = require('./spares');
const Rma = require('./rma');
const Approvals = require('./approvals');
const Lookup = require('./lookup');
const Customer = require('./customer');

initializeApp();
const db = getFirestore();

// IMPORTANT: must match the location of your Firestore database
// (Firebase Console -> Firestore Database -> the location shown at the
// top, e.g. asia-south1 for Mumbai). A mismatch makes the deploy fail.
const REGION = 'asia-south1';

// Clients can no longer set these codes (firestore.rules rejects it), so
// this is the only place they are issued. Triggering on every write —
// not just creation — also gives records created before this existed
// (which have no code) one the next time they are touched.
exports.assignServiceCenterCode = onDocumentWritten(
  { document: 'serviceCenterProfiles/{uid}', region: REGION },
  async (event) => {
    const after = event.data && event.data.after;
    if (!after || !after.exists || after.get('serviceCenterCode')) return;
    await assignCodeIfMissing(db, after.ref, {
      field: 'serviceCenterCode', counterId: 'servicecenter-master', prefix: 'SC-'
    });
  }
);

exports.assignTechnicianCode = onDocumentWritten(
  { document: 'centerTechnicians/{techId}', region: REGION },
  async (event) => {
    const after = event.data && event.data.after;
    if (!after || !after.exists || after.get('technicianCode')) return;
    await assignCodeIfMissing(db, after.ref, {
      field: 'technicianCode', counterId: 'technician-master', prefix: 'TC-'
    });
  }
);

// ---------------------------------------------------------------
// Tamper-proof audit trail for security-sensitive changes: role and
// status changes, account creation/deletion. The caller identity comes
// from the Firestore auth context (event.authId), which a client cannot
// forge — unlike the entries the dashboards write themselves.
// Only the fields in audit.js are watched, so the code-assignment
// functions above (which write code fields) never produce entries.
// ---------------------------------------------------------------
async function writeAudit(coll, event) {
  if (event.authType === 'system' || !event.authId) return;
  const change = event.data;
  if (!change) return;
  const before = change.before && change.before.exists ? change.before.data() : null;
  const after = change.after && change.after.exists ? change.after.data() : null;
  const entries = buildAuditEntries(coll, event.params.docId, before, after);
  if (!entries.length) return;
  let email = '';
  try { email = ((await db.collection('users').doc(event.authId).get()).get('email')) || ''; } catch (e) { /* best effort */ }
  const batch = db.batch();
  for (const e of entries) {
    batch.set(db.collection('auditLogs').doc(), {
      ...e, performedBy: email, performedByUid: event.authId, createdAt: FieldValue.serverTimestamp()
    });
  }
  await batch.commit();
}

for (const [name, coll] of [['auditUsers', 'users'], ['auditServiceCenters', 'serviceCenterProfiles'], ['auditTechnicians', 'centerTechnicians']]) {
  exports[name] = onDocumentWrittenWithAuthContext(
    { document: `${coll}/{docId}`, region: REGION },
    (event) => writeAudit(coll, event)
  );
}

// ---------------------------------------------------------------
// Request intake: when a service request is created — from the public
// "Book a Service" page or by a Service Center — the server records a
// first warranty read (`intakeWarranty`) and flags possible duplicate
// tickets (`possibleDuplicateOf`). Both fields are server-only
// (firestore.rules rejects client writes to them), so a customer or
// staff browser cannot fake an in-warranty result or hide a duplicate.
// The billing decision at closure still writes `warrantyStatus`, using
// part-level component cover, and remains the authoritative one.
// ---------------------------------------------------------------
const REQUEST_COLLECTIONS = ['publicServiceRequests', 'centerRequests'];

async function findRegistration(ticket) {
  const regs = db.collection('productRegistrations');
  if (ticket.linkedRegistrationId) {
    const q = await regs.where('registrationId', '==', ticket.linkedRegistrationId).limit(1).get();
    if (!q.empty) return q.docs[0].data();
  }
  if (ticket.serialNumber) {
    const q = await regs.where('serialNumber', '==', ticket.serialNumber).limit(1).get();
    if (!q.empty) return q.docs[0].data();
    const norm = Stock.normalizeSerial(ticket.serialNumber);
    if (norm && norm !== ticket.serialNumber) {
      const q2 = await regs.where('serialNumber', '==', norm).limit(1).get();
      if (!q2.empty) return q2.docs[0].data();
    }
  }
  return null;
}

async function findDuplicates(ticket, selfRef) {
  const found = [];
  const filter = ticket.serialNumber
    ? ['serialNumber', ticket.serialNumber]
    : (ticket.customerPhone ? ['customerPhone', ticket.customerPhone] : null);
  if (!filter) return found;
  for (const coll of REQUEST_COLLECTIONS) {
    const snap = await db.collection(coll).where(filter[0], '==', filter[1]).limit(25).get();
    snap.forEach((d) => {
      if (d.ref.path === selfRef.path) return;
      const data = d.data();
      const candidate = {
        id: d.id, status: data.status, serialNumber: data.serialNumber,
        customerPhone: data.customerPhone, category: data.category,
        createdAtMs: data.createdAt && data.createdAt.toMillis ? data.createdAt.toMillis() : 0
      };
      if (isPossibleDuplicate(candidate, { ...ticket, id: selfRef.id })) found.push(data.requestId || d.id);
    });
  }
  return found.slice(0, 5);
}

for (const coll of REQUEST_COLLECTIONS) {
  exports[`enrich_${coll}`] = onDocumentCreated(
    { document: `${coll}/{docId}`, region: REGION },
    async (event) => {
      const snap = event.data;
      if (!snap) return;
      const ticket = snap.data();
      if (ticket.intakeWarranty) return; // already processed (retry)
      const [reg, duplicates] = await Promise.all([findRegistration(ticket), findDuplicates(ticket, snap.ref)]);
      await snap.ref.update({
        intakeWarranty: computeIntakeWarranty(reg, ticket),
        possibleDuplicateOf: duplicates
      });
    }
  );
}

// ---------------------------------------------------------------
// Routing: a website request is sent to a service center as soon as it
// is created, instead of waiting for an admin to open the Routing
// screen. pincode -> territory -> center (see routing.js for the
// rules). Requests it cannot place are marked `routing.status =
// 'manual'` with a reason, for a person to route. Idempotent: the
// centerRequests doc id is derived from the request's id, and the
// transaction re-checks that nothing has routed it already.
// ---------------------------------------------------------------
const OPEN_TICKET_STATUSES = ['new', 'assigned', 'accepted', 'on_the_way', 'at_customer', 'in_progress', 'waiting_spare'];

async function loadCenters() {
  const users = await db.collection('users').where('role', '==', 'servicecenter').get();
  const centers = users.docs.map((d) => ({ uid: d.id, ...d.data() }));
  if (centers.length) {
    const profiles = await db.getAll(...centers.map((c) => db.collection('serviceCenterProfiles').doc(c.uid)));
    profiles.forEach((p, i) => { centers[i].profileStatus = p.exists ? p.get('status') : undefined; });
  }
  return centers;
}

async function openTicketCount(uid) {
  const snap = await db.collection('centerRequests').where('serviceCenterUid', '==', uid).limit(500).get();
  return snap.docs.filter((d) => OPEN_TICKET_STATUSES.includes(d.get('status'))).length;
}

exports.routePublicServiceRequest = onDocumentCreated(
  { document: 'publicServiceRequests/{docId}', region: REGION },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const ticket = snap.data();
    if (ticket.status !== 'new' || ticket.routing) return;

    const pincode = String(ticket.pincode || '').trim();
    const [centers, pinSnap] = await Promise.all([
      loadCenters(),
      pincode ? db.collection('pincodes').doc(pincode).get() : Promise.resolve(null)
    ]);
    const pin = pinSnap && pinSnap.exists ? pinSnap.data() : null;
    const today = new Date().toISOString().slice(0, 10);
    const result = findCandidates(ticket, centers, pin, today);

    let chosen = null;
    if (result.method && result.candidates.length) {
      let counts = {};
      if (result.candidates.length > 1) {
        const entries = await Promise.all(result.candidates.map(async (c) => [c.uid, await openTicketCount(c.uid)]));
        counts = Object.fromEntries(entries);
      }
      chosen = pickLeastLoaded(result.candidates, counts);
    }

    const pubRef = snap.ref;
    if (!chosen) {
      await pubRef.update({
        routing: {
          status: 'manual', reason: result.reason || 'no_match',
          candidateUids: result.candidates.map((c) => c.uid).slice(0, 10),
          at: FieldValue.serverTimestamp()
        }
      });
      return;
    }

    const centerName = chosen.name || chosen.email || '';
    const productLabel = ticket.product || `${ticket.brand || ''} ${ticket.category || ''}`.trim() || '-';
    const centerReqRef = db.collection('centerRequests').doc(`route_${pubRef.id}`);
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(pubRef);
      if (!fresh.exists || fresh.get('status') !== 'new' || fresh.get('routing')) return;
      const routing = { status: 'routed', method: result.method, candidates: result.candidates.length, at: FieldValue.serverTimestamp() };
      tx.set(centerReqRef, {
        requestId: ticket.requestId || pubRef.id,
        serviceCenterUid: chosen.uid,
        serviceCenterName: centerName,
        customerName: ticket.customerName || '',
        customerPhone: ticket.customerPhone || '',
        address: ticket.address || '',
        city: ticket.city || '',
        pincode: ticket.pincode || '',
        product: productLabel,
        brand: ticket.brand || '',
        category: ticket.category || '',
        modelNo: ticket.modelNo || '',
        serialNumber: ticket.serialNumber || '',
        purchaseDate: ticket.purchaseDate || null,
        linkedRegistrationId: ticket.linkedRegistrationId || null,
        type: ticket.requestType === 'installation' ? 'installation' : 'service',
        issue: ticket.issueDescription || '',
        status: 'new',
        sourceRequestId: pubRef.id,
        routing,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
      tx.set(centerReqRef.collection('statusLog').doc(), {
        status: 'new', note: `Routed to ${centerName} (${result.method} match)`,
        changedByEmail: 'system', createdAt: FieldValue.serverTimestamp()
      });
      tx.update(pubRef, {
        serviceCenterUid: chosen.uid, serviceCenterName: centerName,
        status: 'assigned_to_center', routing, updatedAt: FieldValue.serverTimestamp()
      });
      tx.set(pubRef.collection('statusLog').doc(), {
        status: 'assigned_to_center', note: `Routed to ${centerName} (${result.method} match)`,
        changedByEmail: 'system', createdAt: FieldValue.serverTimestamp()
      });
      tx.set(db.collection('notifications').doc(), {
        recipientType: 'uid', recipientValue: chosen.uid,
        title: 'New service request routed to you',
        message: `${ticket.customerName || 'A customer'} - ${productLabel}`,
        read: false, createdAt: FieldValue.serverTimestamp()
      });
    });
  }
);


// ---------------------------------------------------------------
// Technician assignment check. A service center picks a technician for
// its own ticket from the browser, which could write any uid. When the
// caller IS the ticket's service center, the technician must be on that
// center's roster and eligible (not suspended / terminated / on leave /
// contract expired / declared-unauthorized for the brand). If not, the
// assignment is reverted and `assignmentRejected` explains why. Admins
// (Super Admin / Warehouse) may assign anyone and are not checked.
// ---------------------------------------------------------------
async function checkAssignment(ticket, techUid) {
  const rosterSnap = await db.collection('centerTechnicians')
    .where('serviceCenterUid', '==', ticket.serviceCenterUid).where('technicianUid', '==', techUid).limit(1).get();
  if (rosterSnap.empty) return 'technician is not on this center\'s roster';
  const rosterDoc = rosterSnap.docs[0];
  const [userSnap, availSnap] = await Promise.all([
    db.collection('users').doc(techUid).get(),
    db.collection('technicianAvailability').doc(techUid).get()
  ]);
  const ranked = rankTechnicians({
    ticket, roster: [{ id: rosterDoc.id, ...rosterDoc.data() }],
    users: { [techUid]: userSnap.exists ? userSnap.data() : {} },
    avail: availSnap.exists ? { [techUid]: availSnap.data() } : {},
    openCounts: {}, today: new Date().toISOString().slice(0, 10)
  });
  return ranked[0].eligible ? null : `technician is not eligible: ${ranked[0].excludedReason}`;
}

async function enforceAssignment(event, ticket, before) {
  if (!event.authId || event.authId !== ticket.serviceCenterUid) return;
  const techUid = ticket.technicianUid;
  if (!techUid || (before && before.technicianUid === techUid)) return;
  const reason = await checkAssignment(ticket, techUid);
  if (!reason) return;
  const revert = {
    technicianUid: before ? before.technicianUid || null : null,
    technicianName: before ? before.technicianName || null : null,
    assignmentRejected: { technicianUid: techUid, reason, at: FieldValue.serverTimestamp() }
  };
  if (!before || !before.technicianUid) revert.status = before ? before.status : 'new';
  // On an update the event carries a before/after pair, not the document
  // itself — take the reference from the 'after' side.
  const ref = event.data.after ? event.data.after.ref : event.data.ref;
  await ref.update(revert);
}

exports.checkAssignmentOnCreate = onDocumentCreatedWithAuthContext(
  { document: 'centerRequests/{docId}', region: REGION },
  async (event) => { if (event.data) await enforceAssignment(event, event.data.data(), null); }
);

exports.checkAssignmentOnUpdate = onDocumentUpdatedWithAuthContext(
  { document: 'centerRequests/{docId}', region: REGION },
  async (event) => {
    if (!event.data) return;
    await enforceAssignment(event, event.data.after.data(), event.data.before.data());
  }
);

// ---------------------------------------------------------------
// Appointment check. When a ticket's scheduledDate / scheduledStartTime
// / scheduledEndTime changes (from any dashboard), the slot is validated
// here: real date, not in the past, inside working hours, sensible
// length, the technician not on approved leave, and no overlap with
// that technician's other bookings across centerRequests AND
// serviceJobs. A bad slot is reverted and `scheduleRejected` explains
// why. A lock document per technician+date, written inside the
// transaction, serializes two people booking the same slot at once.
// ---------------------------------------------------------------
const SCHEDULE_COLLECTIONS = ['centerRequests', 'serviceJobs'];
const slotOf = (d) => ({ date: (d && d.scheduledDate) || '', start: (d && d.scheduledStartTime) || '', end: (d && d.scheduledEndTime) || '' });
const sameSlot = (a, b) => a.date === b.date && a.start === b.start && a.end === b.end;
const millis = (t) => (t && t.toMillis ? t.toMillis() : 0);

async function enforceSchedule(coll, event, before) {
  if (!event.authId || !event.data) return;
  const afterSnap = before ? event.data.after : event.data;
  const after = afterSnap.data();
  const prevSlot = slotOf(before);
  const slot = slotOf(after);
  if (sameSlot(prevSlot, slot)) return;
  // Our own revert changes the slot too; don't re-check it.
  if (after.scheduleRejected && millis(after.scheduleRejected.at) !== millis(before && before.scheduleRejected && before.scheduleRejected.at)) return;

  const ref = afterSnap.ref;
  const techUid = after.technicianUid || '';
  const lockRef = db.collection('scheduleLocks').doc(`${techUid || 'none'}_${slot.date || 'none'}`);

  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    if (!fresh.exists || !sameSlot(slotOf(fresh.data()), slot)) return; // a newer write will be checked on its own
    await tx.get(lockRef);

    let reason = Appointment.validateSlot(slot, Date.now());
    if (!reason && slot.date && slot.start && techUid) {
      const rosterQ = await tx.get(db.collection('centerTechnicians').where('technicianUid', '==', techUid).limit(1));
      const leave = rosterQ.empty ? [] : (rosterQ.docs[0].get('leaveRecords') || []);
      if (Appointment.onApprovedLeave(leave, slot.date)) reason = 'The technician is on approved leave on that date.';
      if (!reason) {
        const others = [];
        for (const c of SCHEDULE_COLLECTIONS) {
          const q = await tx.get(db.collection(c).where('technicianUid', '==', techUid).where('scheduledDate', '==', slot.date));
          q.forEach((d) => {
            if (c === coll && d.id === ref.id) return;
            const o = d.data();
            others.push({ date: o.scheduledDate, start: o.scheduledStartTime, end: o.scheduledEndTime, status: o.status,
              label: o.customerName || o.requestId || o.jobId || d.id });
          });
        }
        const clash = Appointment.findConflict(slot, others);
        if (clash) reason = `The technician is already booked ${clash.start}-${clash.end} that day (${clash.label}).`;
      }
    }

    if (reason) {
      tx.update(ref, {
        scheduledDate: before ? (before.scheduledDate || null) : null,
        scheduledStartTime: before ? (before.scheduledStartTime || null) : null,
        scheduledEndTime: before ? (before.scheduledEndTime || null) : null,
        scheduleRejected: { reason, attempted: slot, at: FieldValue.serverTimestamp() }
      });
    } else if (fresh.get('scheduleRejected')) {
      tx.update(ref, { scheduleRejected: FieldValue.delete() });
    }
    tx.set(lockRef, { ticket: ref.path, at: FieldValue.serverTimestamp() });
  });
}

for (const coll of SCHEDULE_COLLECTIONS) {
  exports[`checkScheduleOnCreate_${coll}`] = onDocumentCreatedWithAuthContext(
    { document: `${coll}/{docId}`, region: REGION },
    (event) => enforceSchedule(coll, event, null)
  );
  exports[`checkScheduleOnUpdate_${coll}`] = onDocumentUpdatedWithAuthContext(
    { document: `${coll}/{docId}`, region: REGION },
    (event) => enforceSchedule(coll, event, event.data && event.data.before ? event.data.before.data() : null)
  );
}

// ---------------------------------------------------------------
// Job lifecycle. The technician flow (accept -> on the way -> at
// customer -> in progress -> completed) used to exist only in the
// browser; the rules let a technician write any status. Now a status
// change by a technician or service center is checked here: it must be
// a legal move (lifecycle.js), and "completed" must carry the closure
// code, action taken and parts used, under the closer's own account.
// An illegal change is reverted and `lifecycleRejected` says why.
// Super Admin / Warehouse may move a ticket anywhere (verify, close,
// reopen). Writes with no matching user account (the Cloud Functions
// themselves) are not checked.
// ---------------------------------------------------------------
for (const coll of ['centerRequests', 'serviceJobs']) {
  exports[`checkLifecycle_${coll}`] = onDocumentUpdatedWithAuthContext(
    { document: `${coll}/{docId}`, region: REGION },
    async (event) => {
      if (!event.authId || !event.data) return;
      const before = event.data.before.data();
      const after = event.data.after.data();
      if (before.status === after.status) return;
      const actor = await db.collection('users').doc(event.authId).get();
      if (!actor.exists || ['superadmin', 'warehouse'].includes(actor.get('role'))) return;
      const reason = checkTransition(before, after, event.authId);
      if (!reason) return;
      await event.data.after.ref.update({
        status: before.status,
        lifecycleRejected: { from: before.status, to: after.status, reason, at: FieldValue.serverTimestamp() }
      });
    }
  );
}

// ---------------------------------------------------------------
// Spare request pipeline: new -> approved -> picking -> packing ->
// dispatched -> in transit -> received (or back order). Applies to
// everyone with an account, Warehouse and Super Admin included, because
// the pipeline order IS the control. "Dispatched" must carry the
// transporter and docket. A bad move is reverted with `pipelineRejected`.
// The dispatch screens move the stock and set the status in ONE
// transaction, so the stock and the status can't drift apart.
// ---------------------------------------------------------------
exports.checkSparePipeline = onDocumentUpdatedWithAuthContext(
  { document: 'spareRequests/{docId}', region: REGION },
  async (event) => {
    if (!event.authId || !event.data) return;
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (before.status === after.status) return;
    const actor = await db.collection('users').doc(event.authId).get();
    if (!actor.exists) return; // the Cloud Functions' own writes
    const reason = checkSpareTransition(before, after);
    if (!reason) return;
    await event.data.after.ref.update({
      status: before.status,
      pipelineRejected: { from: before.status, to: after.status, reason, at: FieldValue.serverTimestamp() }
    });
  }
);

// ---------------------------------------------------------------
// Billing at closure. When a TECHNICIAN completes their own ticket, the
// server (not their browser) decides the warranty verdict, looks the
// charge up on the rate card, and — for an in-warranty job — credits
// their wallet exactly once (the credit's id is derived from the job,
// so a retry cannot double it). Tickets completed by a service center
// keep the existing billing-page flow. `billingComputedAt` makes the
// step idempotent; an illegal completion (see checkLifecycle_*) is
// never billed.
// ---------------------------------------------------------------
async function closureContext(ticketRef, ticket) {
  // Same lookup as at intake: the registration the booking was linked to
  // first (a product registered without a serial has no other key), then
  // the serial number.
  const reg = await findRegistration(ticket);
  const partNames = [];
  const returns = await db.collection('returns').where('sourceJobId', '==', ticketRef.id).get();
  for (const r of returns.docs) {
    const partId = r.get('partId');
    if (!partId) continue;
    const part = await db.collection('spareParts').doc(partId).get();
    if (part.exists && part.get('name')) partNames.push(part.get('name'));
  }
  let centerUid = ticket.serviceCenterUid || null;
  if (!centerUid && ticket.technicianUid) {
    const u = await db.collection('users').doc(ticket.technicianUid).get();
    centerUid = u.exists ? u.get('linkedServiceCenterUid') || null : null;
  }
  const keys = Billing.rateLookupKeys(ticket, centerUid);
  const rateSnaps = await Promise.all(keys.map((k) => db.collection('serviceChargeRates').doc(k).get()));
  const amounts = {};
  rateSnaps.forEach((snap, i) => { if (snap.exists) amounts[keys[i]] = snap.get('amount'); });
  return { reg, partNames, rate: Billing.pickRate(keys, amounts) };
}

for (const coll of ['centerRequests', 'serviceJobs']) {
  exports[`billOnClose_${coll}`] = onDocumentUpdated(
    { document: `${coll}/{docId}`, region: REGION },
    async (event) => {
      if (!event.data) return;
      const before = event.data.before.data();
      const after = event.data.after.data();
      if (before.status === 'completed' || after.status !== 'completed') return;
      if (after.billingComputedAt) return;
      if (!after.closedByUid || after.closedByUid !== after.technicianUid) return; // center-closed: billing page handles it
      if (checkTransition(before, after, after.closedByUid)) return; // illegal completion, being reverted
      const ref = event.data.after.ref;
      const { reg, partNames, rate } = await closureContext(ref, after);
      const verdict = Billing.computeClosureWarranty(reg, after, partNames);
      const label = after.jobId || after.requestId || ref.id;

      await db.runTransaction(async (tx) => {
        const fresh = await tx.get(ref);
        if (!fresh.exists || fresh.get('status') !== 'completed' || fresh.get('billingComputedAt')) return;
        const update = { billingComputedAt: FieldValue.serverTimestamp() };
        if (verdict.inWarranty === true) {
          update.warrantyStatus = 'in_warranty';
          if (rate > 0) {
            update.serviceCharge = rate;
            if (coll === 'centerRequests') {
              update.billingType = 'claim'; update.billingStatus = 'ready_to_claim'; update.billingTotal = 0;
              update.billedAt = FieldValue.serverTimestamp();
            }
            tx.create(db.collection('walletTransactions').doc(`credit_${coll}_${ref.id}`), {
              technicianUid: after.technicianUid, amount: rate, type: 'service_charge_credit',
              sourceJobId: ref.id, sourceJobCollection: coll, sourceJobLabel: label,
              serialNumber: after.serialNumber || null, status: 'unclaimed',
              createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
            });
          }
        } else if (verdict.inWarranty === false) {
          update.warrantyStatus = 'out_of_warranty';
        }
        tx.update(ref, update);
        const ticketId = after.requestId || after.jobId;
        if (update.warrantyStatus && ticketId && after.customerPhone) {
          tx.set(db.collection('publicTicketStatus').doc(ticketId), { warrantyStatus: update.warrantyStatus }, { merge: true });
        }
      });
    }
  );
}

// ---------------------------------------------------------------
// Claims. When a claim is filed, the wallet credits / tickets it lists
// are locked to it in one transaction (each must be the claimant's own
// and still open), so the same credit or ticket can never be in two
// claims; if any can't be locked the claim is rejected straight away
// with the reason. Free-form claims (with a bill photo) are marked
// 'manual'. Then: Warehouse verifies an approved amount (firestore.rules
// caps it at what the locked items add up to), Super Admin pays — never
// the same person who verified — and the payment record is written here
// from the approved amount. Rejecting releases the items. Every status
// change goes into the claim's history.
// ---------------------------------------------------------------
async function itemsFor(tx, claim) {
  if (Array.isArray(claim.walletTxnIds) && claim.walletTxnIds.length) {
    const refs = claim.walletTxnIds.slice(0, 50).map((id) => db.collection('walletTransactions').doc(String(id)));
    return { kind: 'wallet', refs, snaps: await tx.getAll(...refs) };
  }
  if (Array.isArray(claim.ticketIds) && claim.ticketIds.length) {
    const refs = claim.ticketIds.slice(0, 50).map((id) => db.collection('centerRequests').doc(String(id)));
    return { kind: 'ticket', refs, snaps: await tx.getAll(...refs) };
  }
  return { kind: 'manual', refs: [], snaps: [] };
}

exports.checkClaim = onDocumentCreated(
  { document: 'claims/{docId}', region: REGION },
  async (event) => {
    if (!event.data) return;
    const ref = event.data.ref;
    await db.runTransaction(async (tx) => {
      const claim = (await tx.get(ref)).data();
      if (!claim || claim.lock) return;
      const { kind, refs, snaps } = await itemsFor(tx, claim);
      const items = snaps.filter((x) => x.exists).map((x) => ({ id: x.id, ...x.data() }));
      const at = FieldValue.serverTimestamp();
      if (kind === 'manual') {
        tx.update(ref, {
          lock: { status: 'manual', at },
          claimCheck: { kind: 'manual', status: 'manual', claimed: Number(claim.amount) || 0, verified: null, issues: [], at }
        });
        return;
      }
      const lock = Billing.lockCheck(claim, items, kind);
      const check = kind === 'wallet' ? Billing.verifyWalletClaim(claim, items) : Billing.verifyTicketClaim(claim, items);
      if (!lock.ok) {
        tx.update(ref, {
          status: 'rejected', rejectReason: `Not accepted: ${lock.reason}`, lock: { status: 'failed', reason: lock.reason, at },
          claimCheck: { ...check, at }
        });
        return;
      }
      refs.forEach((r) => tx.update(r, kind === 'wallet'
        ? { status: 'claimed', claimId: claim.claimId || ref.id, claimDocId: ref.id, updatedAt: at }
        : { billingStatus: 'claimed', claimId: claim.claimId || ref.id, claimDocId: ref.id, updatedAt: at }));
      tx.update(ref, { lock: { status: 'locked', at }, claimCheck: { ...check, verified: lock.total, at } });
    });
  }
);

exports.claimUpdated = onDocumentUpdatedWithAuthContext(
  { document: 'claims/{docId}', region: REGION },
  async (event) => {
    if (!event.data) return;
    const before = event.data.before.data(), after = event.data.after.data();
    if (before.status === after.status) return;
    const ref = event.data.after.ref;
    const note = after.status === 'rejected' ? (after.rejectReason || '') : after.status === 'verified' ? (after.verifyNote || '') : after.status === 'settled' ? (after.paymentRef || '') : '';
    const jobs = [ref.update({ history: FieldValue.arrayUnion({ from: before.status || null, to: after.status, byUid: event.authId || null, note, at: Timestamp.now() }) })];
    if (after.status === 'rejected' && after.lock && after.lock.status === 'locked') {
      // Release whatever this claim had locked, so it can be claimed again.
      jobs.push(db.runTransaction(async (tx) => {
        const { kind, refs, snaps } = await itemsFor(tx, after);
        snaps.forEach((snap, i) => {
          if (!snap.exists || snap.get('claimDocId') !== ref.id) return;
          tx.update(refs[i], kind === 'wallet'
            ? { status: 'unclaimed', claimId: null, claimDocId: null, updatedAt: FieldValue.serverTimestamp() }
            : { billingStatus: 'ready_to_claim', claimId: null, claimDocId: null, updatedAt: FieldValue.serverTimestamp() });
        });
        tx.update(ref, { lock: { status: 'released', at: FieldValue.serverTimestamp() } });
      }));
    }
    if (after.status === 'settled') {
      jobs.push(db.runTransaction(async (tx) => {
        const payRef = db.collection('payments').doc(`claim_${ref.id}`);
        const existing = await tx.get(payRef);
        const { kind, refs, snaps } = await itemsFor(tx, after);
        if (existing.exists) return;
        tx.create(payRef, {
          sourceType: 'claim', sourceId: ref.id, sourceRef: after.claimId || ref.id, description: after.description || '',
          payeeUid: after.claimantUid || null, payeeName: after.claimantName || '',
          amount: after.approvedAmount, method: after.paymentMethod || '', referenceNumber: after.paymentRef || '', paidDate: after.paidDate || '',
          verifiedByUid: after.verifiedByUid || null, paidByUid: after.paidByUid || event.authId || null, createdAt: FieldValue.serverTimestamp()
        });
        if (kind === 'wallet') snaps.forEach((snap, i) => { if (snap.exists && snap.get('claimDocId') === ref.id) tx.update(refs[i], { status: 'paid', paidAt: FieldValue.serverTimestamp() }); });
      }));
      if (after.claimantUid) {
        jobs.push(db.collection('notifications').add({
          recipientType: 'uid', recipientValue: after.claimantUid, title: 'Claim paid',
          message: `${after.claimId || ref.id}: ₹${after.approvedAmount} paid${after.paymentMethod ? ' by ' + after.paymentMethod : ''}${after.paymentRef ? ' (ref ' + after.paymentRef + ')' : ''}.`,
          read: false, createdAt: FieldValue.serverTimestamp()
        }));
      }
    }
    if (after.status === 'rejected' && after.claimantUid) {
      jobs.push(db.collection('notifications').add({
        recipientType: 'uid', recipientValue: after.claimantUid, title: 'Claim rejected',
        message: `${after.claimId || ref.id}: ${after.rejectReason || 'rejected'}`, read: false, createdAt: FieldValue.serverTimestamp()
      }));
    }
    await Promise.all(jobs);
  }
);

// ---------------------------------------------------------------
// Center billing. A service center no longer writes a ticket's warranty
// verdict, charges or billing status itself: it files a billingRequest
// (in-warranty claim, or out-of-warranty with what the customer paid)
// and this checks it against the server's own warranty verdict and the
// rate card (Billing.billingDecision) before writing the billing fields.
// ---------------------------------------------------------------
exports.applyBillingRequest = onDocumentUpdated(
  { document: 'centerRequests/{docId}', region: REGION },
  async (event) => {
    if (!event.data) return;
    const before = event.data.before.data(), after = event.data.after.data();
    const ms = (r) => (r && r.requestedAt && r.requestedAt.toMillis ? r.requestedAt.toMillis() : 0);
    if (!ms(after.billingRequest) || ms(after.billingRequest) === ms(before.billingRequest)) return;
    const ref = event.data.after.ref;
    const req = after.billingRequest;
    if (req.byUid !== after.serviceCenterUid) {
      await ref.update({ billingRejected: { reason: 'Only the ticket\'s service center can bill it.', at: FieldValue.serverTimestamp() } });
      return;
    }
    const { reg, partNames, rate } = await closureContext(ref, after);
    const verdict = Billing.computeClosureWarranty(reg, after, partNames).inWarranty;
    await db.runTransaction(async (tx) => {
      const fresh = (await tx.get(ref)).data();
      const decision = Billing.billingDecision(fresh, verdict, req, rate);
      if (decision.error) {
        tx.update(ref, { billingRejected: { reason: decision.error, at: FieldValue.serverTimestamp() } });
        return;
      }
      tx.update(ref, { ...decision.update, billingRejected: null, billedAt: FieldValue.serverTimestamp(), billingDecidedAt: FieldValue.serverTimestamp() });
      const ticketId = fresh.requestId || fresh.jobId;
      if (ticketId && fresh.customerPhone) {
        tx.set(db.collection('publicTicketStatus').doc(ticketId), { warrantyStatus: decision.update.warrantyStatus }, { merge: true });
      }
    });
  }
);

// ---------------------------------------------------------------
// Customer feedback. The customer submits a rating from the public
// Track page (firestore.rules lets them create exactly one record per
// closed ticket, with the phone number matching the ticket). This copies
// the ticket's service center / technician onto the record, shows the
// rating on the ticket itself, and alerts the center and Warehouse when
// the rating is low. Nobody in the CRM can edit or create feedback.
// ---------------------------------------------------------------
exports.processFeedback = onDocumentCreated(
  { document: 'serviceFeedback/{ticketId}', region: REGION },
  async (event) => {
    if (!event.data) return;
    const fb = event.data.data();
    const mirror = await db.collection('publicTicketStatus').doc(event.params.ticketId).get();
    if (!mirror.exists) return;
    const m = mirror.data();
    const ticketRef = db.collection(m.source === 'serviceJobs' ? 'serviceJobs' : 'centerRequests').doc(m.sourceDocId);
    const ticketSnap = await ticketRef.get();
    if (!ticketSnap.exists) return;
    const ticket = ticketSnap.data();
    // The mirror is staff-written, so re-check against the real ticket.
    if (!Feedback.ticketAcceptsFeedback(ticket, event.params.ticketId, fb.customerPhone)) {
      await event.data.ref.delete();
      return;
    }
    const enrich = Feedback.enrichmentFor(ticket, m, ticketRef.parent.id, ticketRef.id);
    await Promise.all([
      event.data.ref.update(enrich),
      ticketRef.update({ customerFeedback: { rating: fb.rating, comment: fb.comment || '', at: FieldValue.serverTimestamp() } })
    ]);
    if (Feedback.isLowRating(fb.rating)) {
      const text = `${fb.rating}/5 on ${enrich.requestId || event.params.ticketId}${fb.comment ? ': ' + String(fb.comment).slice(0, 120) : ''}`;
      const targets = [{ recipientType: 'role', recipientValue: 'warehouse' }];
      if (enrich.serviceCenterUid) targets.push({ recipientType: 'uid', recipientValue: enrich.serviceCenterUid });
      await Promise.all(targets.map((t) => db.collection('notifications').add({
        ...t, title: 'Low customer rating', message: text, read: false, createdAt: FieldValue.serverTimestamp()
      })));
    }
  }
);

// ---------------------------------------------------------------
// Service center profile guard. A center edits its own profile, but
// only Super Admin verifies its documents: if the center's own save
// marks a document verified (or swaps the file/dates of one Super
// Admin already verified), that part is put back. When a center changes
// its bank, GST, PAN or legal name, Super Admin is notified, since
// payouts go to those details.
// ---------------------------------------------------------------
exports.guardServiceCenterProfile = onDocumentUpdatedWithAuthContext(
  { document: 'serviceCenterProfiles/{uid}', region: REGION },
  async (event) => {
    if (!event.data || !event.authId) return; // the functions' own writes
    const before = event.data.before.data();
    const after = event.data.after.data();
    const actor = await db.collection('users').doc(event.authId).get();
    const role = actor.exists ? actor.get('role') : null;
    const jobs = [];
    // Super Admin may change anything. Warehouse may verify (stamped with
    // who and when) but not swap a verified file; the center itself may
    // do neither.
    if (role !== 'superadmin') {
      const guard = ProfileGuard.guardDocuments(before.documents, after.documents, {
        canVerify: role === 'warehouse', actorUid: event.authId, actorEmail: actor.exists ? actor.get('email') || '' : ''
      });
      if (guard.changed) {
        jobs.push(event.data.after.ref.update({
          documents: guard.documents,
          ...(role === 'warehouse' ? {} : { documentsRejected: { reason: 'Only Head Office can verify documents, and a verified document can\'t be replaced.', at: FieldValue.serverTimestamp() } })
        }));
      }
    }
    const changedFields = event.authId === event.params.uid ? ProfileGuard.sensitiveChanges(before, after) : [];
    if (changedFields.length) {
      const name = after.displayName || after.legalBusinessName || after.serviceCenterCode || event.params.uid;
      jobs.push(db.collection('notifications').add({
        recipientType: 'role', recipientValue: 'superadmin',
        title: 'Service center changed payout/tax details',
        message: `${name} changed: ${changedFields.join(', ')}. Please re-check before the next payout.`,
        read: false, createdAt: FieldValue.serverTimestamp()
      }));
    }
    await Promise.all(jobs);
  }
);

// ---------------------------------------------------------------
// Dealer / distributor orders. The buyer only sends products and
// quantities; the price of every line, GST and the totals are worked out
// here from the seller's private price list (see tradePricing.js), so a
// browser can never set its own price. An order with a missing price or
// GST rate is marked incomplete and can't be approved (firestore.rules)
// until the seller fills the gap and presses Re-price. Every status
// change is recorded with who made it.
// ---------------------------------------------------------------
async function priceTradeOrder(collectionName, ref, order) {
  const parties = TradePricing.partiesFor(collectionName, order);
  const lines = Array.isArray(order.lines) ? order.lines : [];
  const modelIds = [...new Set(lines.map((l) => l && l.modelId).filter((id) => typeof id === 'string' && id))].slice(0, TradePricing.MAX_LINES);
  const models = {};
  const prices = {};
  if (modelIds.length && parties.buyer) {
    const modelSnaps = await db.getAll(...modelIds.map((id) => db.collection('productModels').doc(id)));
    const productIds = [...new Set(modelSnaps.filter((m) => m.exists && m.get('productId')).map((m) => m.get('productId')))];
    const productSnaps = productIds.length ? await db.getAll(...productIds.map((id) => db.collection('products').doc(id))) : [];
    const productNames = {};
    productSnaps.forEach((p) => { if (p.exists) productNames[p.id] = p.get('name') || ''; });
    modelSnaps.forEach((m) => {
      if (!m.exists) return;
      const d = m.data();
      const name = [productNames[d.productId], d.modelNumber].filter(Boolean).join(' — ') || m.id;
      models[m.id] = { label: name, gstRate: typeof d.gstRate === 'number' ? d.gstRate : null, status: d.status || 'active', hsn: d.hsnCode || '' };
    });
    const priceRefs = [];
    modelIds.forEach((id) => {
      priceRefs.push(db.collection('priceLists').doc(TradePricing.priceDocId(parties.seller, parties.buyer, id)));
      priceRefs.push(db.collection('priceLists').doc(TradePricing.priceDocId(parties.seller, parties.defaultKey, id)));
    });
    const priceSnaps = await db.getAll(...priceRefs);
    priceSnaps.forEach((p) => { if (p.exists && typeof p.get('price') === 'number') prices[p.id] = p.get('price'); });
  }
  const result = TradePricing.priceOrder(lines, models, prices, parties);
  await ref.update({
    pricedLines: result.pricedLines,
    totals: result.totals,
    pricing: { ...result.pricing, seller: parties.seller, at: FieldValue.serverTimestamp() }
  });
  return result;
}

for (const coll of ['dealerOrders', 'distributorOrders']) {
  exports[`priceOnCreate_${coll}`] = onDocumentCreated(
    { document: `${coll}/{orderId}`, region: REGION },
    async (event) => {
      if (!event.data) return;
      const order = event.data.data();
      if (!Array.isArray(order.lines)) return; // older free-text orders
      const result = await priceTradeOrder(coll, event.data.ref, order);
      const parties = TradePricing.partiesFor(coll, order);
      const who = coll === 'distributorOrders' ? 'Distributor' : 'Dealer';
      const buyerName = order.dealerName || order.distributorEmail || order.dealerEmail || '';
      const amount = result.totals ? TradePricing.formatINR(result.totals.total) : 'price incomplete';
      await db.collection('notifications').add({
        ...(parties.seller === 'company'
          ? { recipientType: 'role', recipientValue: 'warehouse' }
          : { recipientType: 'uid', recipientValue: parties.seller }),
        title: `New ${who.toLowerCase()} order to approve`,
        message: `${order.orderId || event.params.orderId} from ${buyerName || who} — ${amount}`,
        read: false, createdAt: FieldValue.serverTimestamp()
      });
    }
  );

  exports[`orderUpdated_${coll}`] = onDocumentUpdatedWithAuthContext(
    { document: `${coll}/{orderId}`, region: REGION },
    async (event) => {
      if (!event.data) return;
      const before = event.data.before.data();
      const after = event.data.after.data();
      const jobs = [];
      // Re-price on request, only while the order still awaits approval.
      const askedBefore = before.repriceRequestedAt ? before.repriceRequestedAt.toMillis() : 0;
      const askedAfter = after.repriceRequestedAt ? after.repriceRequestedAt.toMillis() : 0;
      if (askedAfter && askedAfter !== askedBefore && after.status === 'placed' && Array.isArray(after.lines)) {
        jobs.push(priceTradeOrder(coll, event.data.after.ref, after));
      }
      const companySold = TradePricing.partiesFor(coll, after).seller === 'company';
      const ms = (t) => (t && t.toMillis ? t.toMillis() : 0);
      if (Array.isArray(after.lines) && after.status === 'confirmed'
          && ((before.status === 'placed') || (ms(after.stockRecheckAt) && ms(after.stockRecheckAt) !== ms(before.stockRecheckAt)))) {
        jobs.push(reserveForOrder(coll, event.data.after.ref));
      }
      if (Array.isArray(after.lines) && before.status === 'confirmed' && after.status === 'cancelled') {
        jobs.push(releaseReservation(event.data.after.ref));
      }
      const reqAt = after.dispatchRequest && after.dispatchRequest.requestedAt;
      if (after.status === 'confirmed' && ms(reqAt) && ms(reqAt) !== ms(before.dispatchRequest && before.dispatchRequest.requestedAt)) {
        jobs.push(processDispatch(coll, event.data.after.ref));
      }
      if (Array.isArray(after.lines) && before.status === 'dispatched' && after.status === 'delivered') {
        jobs.push(processDelivery(coll, event.data.after.ref));
      }
      if (companySold && before.status === 'placed' && after.status === 'confirmed' && Array.isArray(after.lines) && after.totals) {
        jobs.push(createInvoice(coll, event.data.after.ref, after, event.authId));
      }
      if (companySold && before.status !== 'cancelled' && after.status === 'cancelled' && after.invoiceId) {
        jobs.push(cancelInvoice(after.invoiceId, after.statusNote || 'Order cancelled'));
      }
      if (before.status !== after.status) {
        jobs.push(event.data.after.ref.update({
          statusHistory: FieldValue.arrayUnion({
            from: before.status || null, to: after.status || null,
            byUid: event.authId || (after.status === 'dispatched' && after.dispatch ? after.dispatch.byUid || null : null),
            note: after.statusNote || '', at: Timestamp.now()
          })
        }));
      }
      await Promise.all(jobs);
    }
  );
}

// ---------------------------------------------------------------
// Trade finance (company sales to Direct dealers and distributors).
// An approved order gets a GST invoice, numbered per financial year
// (PE/2026-27/00001), due after the account's payment terms. Each
// invoice, cancellation and payment is a line in the account's ledger,
// and tradeAccounts/{uid}.outstanding / oldestUnpaidDue are kept in step
// in the same transaction. firestore.rules reads those two fields to
// block approving an order over the credit limit or while an invoice is
// overdue (Super Admin may override with a reason). None of these
// documents can be written from a browser.
// ---------------------------------------------------------------
function oldestUnpaidDue(invoices) {
  let oldest = null;
  invoices.forEach((inv) => {
    if (inv.status === 'cancelled' || !(Finance.toPaise(inv.balance) > 0) || !inv.dueDate) return;
    const due = inv.dueDate.toDate ? inv.dueDate.toDate() : inv.dueDate;
    if (!oldest || due < oldest) oldest = due;
  });
  return oldest ? Timestamp.fromDate(oldest) : null;
}

async function createInvoice(coll, orderRef, order, approverUid) {
  const parties = TradePricing.partiesFor(coll, order);
  const buyerUid = parties.buyer;
  const invRef = db.collection('invoices').doc(`inv_${coll}_${orderRef.id}`);
  const [profileSnap, buyerSnap] = await Promise.all([
    db.collection('settings').doc('companyProfile').get(),
    db.collection('users').doc(buyerUid).get()
  ]);
  const company = profileSnap.exists ? profileSnap.data() : {};
  const buyer = buyerSnap.exists ? buyerSnap.data() : {};
  const sellerState = company.stateCode || Finance.stateCodeFromGstin(company.gstin) || null;
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(invRef);
    if (existing.exists) return;
    const acctRef = db.collection('tradeAccounts').doc(buyerUid);
    const acctSnap = await tx.get(acctRef);
    const acct = acctSnap.exists ? acctSnap.data() : {};
    const buyerState = Finance.stateCodeFromGstin(buyer.gstin) || acct.stateCode || null;
    const gst = Finance.splitGst(order.pricedLines, sellerState, buyerState);
    const now = new Date();
    const fy = Finance.fiscalYear(now);
    const counterRef = db.collection('invoiceCounters').doc(fy);
    const counterSnap = await tx.get(counterRef);
    const seq = (counterSnap.exists ? counterSnap.get('value') || 0 : 0) + 1;
    const invoiceNo = Finance.invoiceNumber(company.invoicePrefix || 'PE', fy, seq);
    const terms = Number.isInteger(acct.paymentTermsDays) ? acct.paymentTermsDays : Finance.DEFAULT_TERMS_DAYS;
    const dueDate = Finance.addDays(now, terms);
    const total = gst.totals.total;
    tx.set(counterRef, { value: seq }, { merge: true });
    tx.set(invRef, {
      invoiceNo, fy, seq,
      invoiceDate: Timestamp.fromDate(now), dueDate: Timestamp.fromDate(dueDate), paymentTermsDays: terms,
      orderCollection: coll, orderDocId: orderRef.id, orderId: order.orderId || orderRef.id,
      buyerUid, buyerType: coll === 'distributorOrders' ? 'distributor' : 'dealer',
      buyer: { name: buyer.name || order.dealerName || order.distributorName || '', email: buyer.email || order.dealerEmail || order.distributorEmail || '',
               gstin: buyer.gstin || '', address: buyer.address || '', stateCode: buyerState },
      seller: { legalName: company.legalName || 'Pushpak Enterprises', gstin: company.gstin || '', address: company.address || '',
                stateCode: sellerState, phone: company.phone || '', email: company.email || '', bankDetails: company.bankDetails || '' },
      lines: gst.lines, totals: gst.totals, interState: gst.interState, buyerStateKnown: gst.buyerStateKnown,
      paid: 0, balance: total, status: 'unpaid',
      creditOverride: order.creditOverride ? { byUid: approverUid || null, reason: order.statusNote || '' } : null,
      approvedByUid: approverUid || null, createdAt: FieldValue.serverTimestamp()
    });
    tx.set(db.collection('ledgerEntries').doc(), {
      accountUid: buyerUid, type: 'invoice', invoiceId: invRef.id, ref: invoiceNo,
      debit: total, credit: 0, note: `Order ${order.orderId || orderRef.id}`, at: FieldValue.serverTimestamp()
    });
    const currentOldest = acct.oldestUnpaidDue ? acct.oldestUnpaidDue.toDate() : null;
    tx.set(acctRef, {
      outstanding: Finance.toRupees(Finance.toPaise(acct.outstanding || 0) + Finance.toPaise(total)),
      oldestUnpaidDue: Timestamp.fromDate(currentOldest && currentOldest < dueDate ? currentOldest : dueDate),
      accountType: coll === 'distributorOrders' ? 'distributor' : 'dealer',
      name: buyer.name || buyer.email || '', lastInvoiceAt: FieldValue.serverTimestamp()
    }, { merge: true });
    tx.update(orderRef, { invoiceId: invRef.id, invoiceNo });
  });
}

async function cancelInvoice(invoiceId, reason) {
  const invRef = db.collection('invoices').doc(invoiceId);
  await db.runTransaction(async (tx) => {
    const invSnap = await tx.get(invRef);
    if (!invSnap.exists || invSnap.get('status') === 'cancelled') return;
    const inv = invSnap.data();
    const acctRef = db.collection('tradeAccounts').doc(inv.buyerUid);
    const [acctSnap, others] = await Promise.all([
      tx.get(acctRef), tx.get(db.collection('invoices').where('buyerUid', '==', inv.buyerUid))
    ]);
    const acct = acctSnap.exists ? acctSnap.data() : {};
    const remaining = others.docs.filter((d) => d.id !== invoiceId).map((d) => d.data());
    tx.update(invRef, { status: 'cancelled', cancelledAt: FieldValue.serverTimestamp(), cancelReason: reason });
    tx.set(db.collection('ledgerEntries').doc(), {
      accountUid: inv.buyerUid, type: 'invoice_cancelled', invoiceId, ref: inv.invoiceNo,
      debit: 0, credit: inv.totals.total, note: reason, at: FieldValue.serverTimestamp()
    });
    tx.set(acctRef, {
      outstanding: Finance.toRupees(Finance.toPaise(acct.outstanding || 0) - Finance.toPaise(inv.totals.total)),
      oldestUnpaidDue: oldestUnpaidDue(remaining)
    }, { merge: true });
  });
}

exports.applyTradePayment = onDocumentCreated(
  { document: 'tradePayments/{paymentId}', region: REGION },
  async (event) => {
    if (!event.data) return;
    const payRef = event.data.ref;
    await db.runTransaction(async (tx) => {
      const paySnap = await tx.get(payRef);
      const pay = paySnap.data();
      if (pay.processedAt) return;
      const acctRef = db.collection('tradeAccounts').doc(pay.accountUid);
      const [acctSnap, invSnap] = await Promise.all([
        tx.get(acctRef), tx.get(db.collection('invoices').where('buyerUid', '==', pay.accountUid))
      ]);
      const acct = acctSnap.exists ? acctSnap.data() : {};
      const invoices = invSnap.docs.map((d) => ({ id: d.id, ref: d.ref, ...d.data() }))
        .filter((i) => i.status !== 'cancelled')
        .sort((a, b) => a.invoiceDate.toMillis() - b.invoiceDate.toMillis());
      const result = Finance.allocatePayment(pay.amount, invoices.map((i) => ({ id: i.id, balance: i.balance })));
      const byId = Object.fromEntries(invoices.map((i) => [i.id, i]));
      result.allocations.forEach((a) => {
        const inv = byId[a.invoiceId];
        const paid = Finance.toRupees(Finance.toPaise(inv.paid || 0) + Finance.toPaise(a.amount));
        const balance = Finance.toRupees(Finance.toPaise(inv.totals.total) - Finance.toPaise(paid));
        inv.balance = balance;
        tx.update(inv.ref, { paid, balance, status: balance <= 0 ? 'paid' : 'partial', lastPaymentAt: FieldValue.serverTimestamp() });
      });
      tx.set(db.collection('ledgerEntries').doc(), {
        accountUid: pay.accountUid, type: 'payment', paymentId: payRef.id, ref: pay.reference || pay.mode || '',
        debit: 0, credit: pay.amount, note: `${pay.mode || 'Payment'} received ${pay.receivedOn || ''}`.trim(), at: FieldValue.serverTimestamp()
      });
      tx.set(acctRef, {
        outstanding: Finance.toRupees(Finance.toPaise(acct.outstanding || 0) - Finance.toPaise(pay.amount)),
        oldestUnpaidDue: oldestUnpaidDue(invoices)
      }, { merge: true });
      const allocations = result.allocations.map((a) => ({ ...a, invoiceNo: byId[a.invoiceId].invoiceNo || '' }));
      tx.update(payRef, { allocations, unallocated: result.unallocated, processedAt: FieldValue.serverTimestamp() });
    });
  }
);

// ---------------------------------------------------------------
// Finished-goods stock (stock.js). Warehouse receives stock with one
// serial per unit; an approved order reserves stock (or waits for it);
// dispatch is done here, not in the browser: the seller enters a serial
// for every unit and this checks each one is in stock at that location
// and of the right model, then moves stock, serials and the order to
// 'dispatched' in one transaction. Goods delivered to a distributor
// become that distributor's stock. All stock documents are server-only.
// ---------------------------------------------------------------
function stockRef(location, modelId) { return db.collection('productStock').doc(Stock.stockDocId(location, modelId)); }

async function reserveForOrder(coll, orderRef) {
  let location = null;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) return;
    const o = snap.data();
    if (o.status !== 'confirmed' || !Array.isArray(o.lines) || o.stockStatus === 'ready' || o.stockStatus === 'dispatched') return;
    location = Stock.locationForSeller(TradePricing.partiesFor(coll, o).seller);
    const modelIds = [...new Set(o.lines.map((l) => l.modelId))];
    const snaps = await tx.getAll(...modelIds.map((m) => stockRef(location, m)));
    const stock = {};
    snaps.forEach((s, i) => { stock[modelIds[i]] = s.exists ? s.data() : { onHand: 0, reserved: 0 }; });
    const plan = Stock.planReservation(o.lines, stock, o.stockAllocation || {});
    Object.entries(plan.add).forEach(([m, n]) => {
      tx.set(stockRef(location, m), { location, modelId: m, reserved: FieldValue.increment(n), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });
    tx.update(orderRef, { stockLocation: location, stockAllocation: plan.allocation, stockStatus: plan.ready ? 'ready' : 'waiting' });
  });
}

async function releaseReservation(orderRef) {
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    const o = snap.data();
    if (!o || o.status !== 'cancelled' || !o.stockLocation || !o.stockAllocation) return;
    Object.entries(o.stockAllocation).forEach(([m, n]) => {
      if (n > 0) tx.set(stockRef(o.stockLocation, m), { reserved: FieldValue.increment(-n), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });
    tx.update(orderRef, { stockAllocation: {}, stockStatus: 'released' });
  });
  const o = (await orderRef.get()).data();
  if (o && o.stockLocation) await allocateWaiting(o.stockLocation);
}

// Gives newly free stock at a location to orders waiting for it, oldest first.
async function allocateWaiting(location) {
  for (const coll of ['dealerOrders', 'distributorOrders']) {
    const snap = await db.collection(coll).where('stockLocation', '==', location).where('stockStatus', '==', 'waiting').get();
    const docs = snap.docs.sort((a, b) => (a.get('createdAt') ? a.get('createdAt').toMillis() : 0) - (b.get('createdAt') ? b.get('createdAt').toMillis() : 0));
    for (const d of docs) await reserveForOrder(coll, d.ref);
  }
}

async function processDispatch(coll, orderRef) {
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    const o = snap.data();
    const req = o && o.dispatchRequest;
    if (!o || o.status !== 'confirmed' || !req || !req.requestedAt) return;
    const key = req.requestedAt.toMillis();
    if (o.dispatchProcessedFor === key) return;
    const fail = (reason) => tx.update(orderRef, { dispatchRejected: { reason, at: Timestamp.now() }, dispatchProcessedFor: key });
    if (!Array.isArray(o.lines)) return fail('Older orders without a price list are dispatched the old way.');
    if (o.stockStatus !== 'ready') return fail('Not all the stock for this order is reserved yet — receive stock or press Check stock.');
    const location = o.stockLocation;
    const lines = (o.pricedLines && o.pricedLines.length ? o.pricedLines : o.lines);
    const serialsByModel = {};
    let count = 0;
    Object.entries(req.serials || {}).forEach(([m, list]) => {
      serialsByModel[m] = (Array.isArray(list) ? list : []).map(Stock.normalizeSerial);
      count += serialsByModel[m].length;
    });
    if (count > Stock.MAX_RECEIPT_SERIALS) return fail('Too many serials in one dispatch.');
    const allSerials = [...new Set([].concat(...Object.values(serialsByModel)))].filter((x) => Stock.SERIAL_RE.test(x));
    const serialSnaps = allSerials.length ? await tx.getAll(...allSerials.map((x) => db.collection('unitSerials').doc(x))) : [];
    const serialDocs = {};
    serialSnaps.forEach((s) => { serialDocs[s.id] = s.exists ? s.data() : null; });
    const err = Stock.validateDispatchSerials(lines, serialsByModel, serialDocs, location);
    if (err) return fail(err);
    const parties = TradePricing.partiesFor(coll, o);
    const buyerName = coll === 'distributorOrders' ? (o.distributorName || o.distributorEmail || '') : (o.dealerName || o.dealerEmail || '');
    lines.forEach((l) => {
      tx.set(stockRef(location, l.modelId), { onHand: FieldValue.increment(-l.qty), reserved: FieldValue.increment(-l.qty), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });
    allSerials.forEach((x) => {
      tx.update(db.collection('unitSerials').doc(x), {
        status: 'dispatched', location: 'transit', fromLocation: location,
        soldToUid: parties.buyer, soldToType: coll === 'distributorOrders' ? 'distributor' : 'dealer', soldToName: buyerName,
        orderCollection: coll, orderDocId: orderRef.id, orderId: o.orderId || orderRef.id, invoiceNo: o.invoiceNo || null,
        dispatchedAt: FieldValue.serverTimestamp(),
        history: FieldValue.arrayUnion({ event: 'dispatched', to: parties.buyer, orderId: o.orderId || orderRef.id, at: Timestamp.now() })
      });
    });
    tx.set(db.collection('productMovements').doc(), {
      type: 'dispatch', location, orderCollection: coll, orderDocId: orderRef.id, orderId: o.orderId || orderRef.id,
      lines: lines.map((l) => ({ modelId: l.modelId, qty: l.qty })), serialCount: allSerials.length,
      byUid: req.byUid || null, at: FieldValue.serverTimestamp()
    });
    tx.update(orderRef, {
      status: 'dispatched', statusNote: '',
      dispatch: { transporter: req.transporter || '', docket: req.docket || '', vehicle: req.vehicle || '', date: new Date().toISOString().slice(0, 10), byUid: req.byUid || null },
      dispatchedSerials: serialsByModel, stockAllocation: {}, stockStatus: 'dispatched',
      dispatchRejected: null, dispatchProcessedFor: key
    });
  });
}

async function processDelivery(coll, orderRef) {
  let distLocation = null;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    const o = snap.data();
    if (!o || o.status !== 'delivered' || o.deliveryProcessed || !o.dispatchedSerials) return;
    const parties = TradePricing.partiesFor(coll, o);
    const toDistributor = coll === 'distributorOrders';
    const dest = toDistributor ? Stock.locationForSeller(parties.buyer) : `dealer_${parties.buyer}`;
    const lines = (o.pricedLines && o.pricedLines.length ? o.pricedLines : o.lines) || [];
    Object.values(o.dispatchedSerials).forEach((list) => (list || []).forEach((x) => {
      tx.update(db.collection('unitSerials').doc(x), {
        status: toDistributor ? 'in_stock' : 'delivered', location: dest, deliveredAt: FieldValue.serverTimestamp(),
        history: FieldValue.arrayUnion({ event: 'delivered', to: parties.buyer, orderId: o.orderId || orderRef.id, at: Timestamp.now() })
      });
    }));
    if (toDistributor) {
      distLocation = dest;
      lines.forEach((l) => {
        tx.set(stockRef(dest, l.modelId), { location: dest, modelId: l.modelId, onHand: FieldValue.increment(l.qty), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      });
      tx.set(db.collection('productMovements').doc(), {
        type: 'receive', location: dest, fromLocation: o.stockLocation || 'warehouse', orderCollection: coll, orderDocId: orderRef.id,
        orderId: o.orderId || orderRef.id, lines: lines.map((l) => ({ modelId: l.modelId, qty: l.qty })), at: FieldValue.serverTimestamp()
      });
    }
    tx.update(orderRef, { deliveryProcessed: true });
  });
  if (distLocation) await allocateWaiting(distLocation);
}

exports.processStockReceipt = onDocumentCreated(
  { document: 'stockReceipts/{receiptId}', region: REGION },
  async (event) => {
    if (!event.data) return;
    const ref = event.data.ref;
    let accepted = false;
    await db.runTransaction(async (tx) => {
      const r = (await tx.get(ref)).data();
      if (!r || r.processedAt) return;
      const reject = (reason) => tx.update(ref, { status: 'rejected', reason, processedAt: FieldValue.serverTimestamp() });
      const serials = (Array.isArray(r.serials) ? r.serials : []).map(Stock.normalizeSerial);
      const bad = Stock.validateReceiptSerials(serials);
      if (bad) return reject(bad);
      const [modelSnap, ...serialSnaps] = await tx.getAll(db.collection('productModels').doc(String(r.modelId || '-')), ...serials.map((x) => db.collection('unitSerials').doc(x)));
      if (!modelSnap.exists) return reject('That product model no longer exists.');
      const dupes = serialSnaps.filter((s) => s.exists).map((s) => s.id);
      if (dupes.length) return reject(`Already received before: ${dupes.slice(0, 10).join(', ')}${dupes.length > 10 ? ` and ${dupes.length - 10} more` : ''}. Nothing from this receipt was added.`);
      serials.forEach((x) => tx.set(db.collection('unitSerials').doc(x), {
        serial: x, modelId: r.modelId, status: 'in_stock', location: 'warehouse', receiptId: ref.id,
        receivedAt: FieldValue.serverTimestamp(), supplier: r.supplier || '',
        history: [{ event: 'received', at: Timestamp.now(), receiptId: ref.id }]
      }));
      tx.set(stockRef('warehouse', r.modelId), { location: 'warehouse', modelId: r.modelId, onHand: FieldValue.increment(serials.length), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      tx.set(db.collection('productMovements').doc(), {
        type: 'receive', location: 'warehouse', receiptId: ref.id, lines: [{ modelId: r.modelId, qty: serials.length }],
        byUid: r.createdByUid || null, at: FieldValue.serverTimestamp()
      });
      tx.update(ref, { status: 'accepted', quantity: serials.length, processedAt: FieldValue.serverTimestamp() });
      if (r.brandReturnId) {
        // Replacement units the brand sent back against a brand return.
        tx.set(db.collection('brandReturns').doc(String(r.brandReturnId)), {
          replacementsReceived: FieldValue.increment(serials.length),
          replacementReceiptIds: FieldValue.arrayUnion(ref.id), updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
      }
      accepted = true;
    });
    if (accepted) await allocateWaiting('warehouse');
  }
);

// A product registration with a serial is checked against the unit's
// record: was it received, has it left the warehouse, and (for a dealer's
// own registration) was it sold to that dealer. The result is shown to
// staff; it doesn't block the registration.
exports.checkRegistrationSerial = onDocumentCreated(
  { document: 'productRegistrations/{regId}', region: REGION },
  async (event) => {
    if (!event.data) return;
    const reg = event.data.data();
    const serial = Stock.normalizeSerial(reg.serialNumber || reg.serialNo || '');
    if (!serial) return;
    const unitRef = db.collection('unitSerials').doc(serial);
    const lockRef = db.collection('registrationSerials').doc(serial);
    await db.runTransaction(async (tx) => {
      const unitSnap = await tx.get(unitRef);
      const lockSnap = await tx.get(lockRef);
      // One registration per serial number, whichever way it was made
      // (portal, dealer, website). The first to arrive owns the serial; a
      // later one is flagged for Head Office instead of silently doubling up.
      const lockedBy = lockSnap.exists ? lockSnap.get('registrationId') : null;
      const duplicate = !!lockedBy && lockedBy !== reg.registrationId;
      if (!lockSnap.exists) tx.create(lockRef, { registrationId: reg.registrationId || event.params.regId, docId: event.params.regId, at: FieldValue.serverTimestamp() });
      let check;
      if (duplicate) check = { status: 'duplicate_serial', note: `This serial number is already registered (${lockedBy}).` };
      else if (!unitSnap.exists) check = { status: 'not_found', note: 'This serial was never received into Head Office stock.' };
      else {
        const u = unitSnap.data();
        if (u.registrationId && u.registrationId !== event.params.regId) check = { status: 'already_registered', note: `Already registered (${u.registrationId}).` };
        else if (u.status === 'in_stock' && u.location === 'warehouse') check = { status: 'not_sold', note: 'This unit is still in the Head Office warehouse.' };
        else if (reg.dealerUid && u.soldToUid && u.soldToUid !== reg.dealerUid) check = { status: 'other_dealer', note: `Sold to ${u.soldToName || 'another account'}, not this dealer.` };
        else check = { status: 'verified', note: `Sold to ${u.soldToName || '—'}${u.invoiceNo ? ' on invoice ' + u.invoiceNo : ''}.`, modelId: u.modelId };
        if (check.status === 'verified' || check.status === 'other_dealer') {
          tx.update(unitRef, { registrationId: event.params.regId, registeredAt: FieldValue.serverTimestamp(),
            history: FieldValue.arrayUnion({ event: 'registered', registrationId: event.params.regId, at: Timestamp.now() }) });
        }
      }
      const regUpdate = { serialCheck: { ...check, serial, at: FieldValue.serverTimestamp() } };
      if (reg.serialNumber !== serial) regUpdate.serialNumber = serial; // stored in one form, so every lookup matches
      tx.update(event.data.ref, regUpdate);
    });
  }
);

// ---------------------------------------------------------------
// Spare-part stock at service centers and technicians (spares.js).
// They can't write stock directly any more (firestore.rules); they file a
// stockOps document and this applies it in one transaction: checks who
// they are and the job it's for, refuses anything that would take stock
// below zero, writes the stock and its ledger line together, and for a
// part used on a job opens the defective return (due back at Head Office
// by the end of the following month — sent in one monthly batch).
// Adding stock to yourself waits for Warehouse approval.
// ---------------------------------------------------------------
async function applySparesOp(ref) {
  let notifyApproval = null;
  await db.runTransaction(async (tx) => {
    const opSnap = await tx.get(ref);
    const op = opSnap.data();
    if (!op || !['pending', 'approved'].includes(op.status)) return;
    const reject = (reason) => { tx.update(ref, { status: 'rejected', reason, processedAt: FieldValue.serverTimestamp() }); };
    if (!Spares.OP_TYPES.includes(op.type)) return reject('Unknown operation.');
    const bad = Spares.validateOpLines(op.lines);
    if (bad) return reject(bad);
    const lines = op.lines.map((l) => ({ partId: l.partId, qty: l.qty }));

    // ---- reads ----
    const actorSnap = await tx.get(db.collection('users').doc(op.byUid));
    const actorUser = actorSnap.exists ? actorSnap.data() : {};
    const role = actorUser.role;
    if (!['servicecenter', 'technician'].includes(role)) return reject('Only service centers and technicians use this.');
    let job = null;
    if (op.job && op.job.id) {
      if (!['centerRequests', 'serviceJobs'].includes(op.job.coll)) return reject('Unknown job.');
      const jobSnap = await tx.get(db.collection(op.job.coll).doc(op.job.id));
      if (!jobSnap.exists) return reject('That job no longer exists.');
      job = jobSnap.data();
    }
    const actor = { role, uid: op.byUid };
    if (op.type === 'consume') {
      if (!job) return reject('A part can only be used against a job.');
      if (role === 'technician' && job.technicianUid !== op.byUid) return reject('That job isn\'t assigned to you.');
      if (role === 'servicecenter' && job.serviceCenterUid !== op.byUid) return reject('That job isn\'t your center\'s.');
    }
    if (op.type === 'transfer_to_technician') {
      if (role !== 'servicecenter') return reject('Only a service center can send parts to a technician.');
      actor.techUid = op.techUid;
      const techSnap = await tx.get(db.collection('users').doc(String(op.techUid || '-')));
      const linked = techSnap.exists && techSnap.get('linkedServiceCenterUid') === op.byUid;
      const onJob = job && job.serviceCenterUid === op.byUid && job.technicianUid === op.techUid;
      if (!linked && !onJob) return reject('That technician isn\'t linked to your center.');
    }
    if (op.type === 'draw_from_center') {
      if (role !== 'technician') return reject('Only a technician draws parts from a center.');
      actor.centerUid = (job && job.technicianUid === op.byUid && job.serviceCenterUid) || actorUser.linkedServiceCenterUid || null;
      if (!actor.centerUid) return reject('You aren\'t linked to a service center.');
    }
    if (['remove', 'add_request'].includes(op.type) && String(op.reason || '').trim().length < 3) return reject('Give a reason.');
    if (op.type === 'send_back' && role !== 'servicecenter') return reject('Only a service center sends stock back.');
    if (op.type === 'add_request' && op.status === 'pending') {
      tx.update(ref, { status: 'awaiting_approval', role });
      notifyApproval = { role, who: actorUser.name || actorUser.email || op.byUid };
      return;
    }
    const changes = Spares.stockChanges(op.type, lines, actor);
    const invIds = [...new Set(changes.map((c) => Spares.invDocId(c.loc, c.uid, c.partId)))];
    const partIds = [...new Set(lines.map((l) => l.partId))];
    const [invSnaps, partSnaps] = await Promise.all([
      tx.getAll(...invIds.map((id) => db.collection('inventory').doc(id))),
      tx.getAll(...partIds.map((id) => db.collection('spareParts').doc(id)))
    ]);
    const partNames = {};
    for (const p of partSnaps) { if (!p.exists) return reject('A part on this request isn\'t in the part master.'); partNames[p.id] = p.get('name') || p.id; }
    const current = {};
    invSnaps.forEach((s) => { current[s.id] = s.exists ? (s.get('quantity') || 0) : 0; });
    const applied = Spares.applyChanges(changes, current, partNames);
    if (applied.error) return reject(applied.error);
    const now = new Date();
    let counterRef = null, seq = 0;
    if (op.type === 'consume' || op.type === 'send_back') {
      counterRef = db.collection('counters').doc(`return-${Spares.yyyymmIST(now)}`);
      const c = await tx.get(counterRef);
      seq = c.exists ? (c.get('value') || 0) : 0;
    }

    // ---- writes ----
    invIds.forEach((id) => {
      const c = changes.find((x) => Spares.invDocId(x.loc, x.uid, x.partId) === id);
      tx.set(db.collection('inventory').doc(id), {
        partId: c.partId, location: c.loc, [c.loc === 'servicecenter' ? 'serviceCenterUid' : 'technicianUid']: c.uid,
        quantity: applied.next[id], updatedAt: FieldValue.serverTimestamp(), lastOpId: ref.id
      }, { merge: true });
    });
    const MOVE_TYPE = { consume: 'consume', remove: 'writeoff', send_back: 'return', add_request: 'receive', transfer_to_technician: 'issue', draw_from_center: 'transfer' };
    lines.forEach((l) => {
      const from = changes.find((c) => c.partId === l.partId && c.delta < 0);
      const to = changes.find((c) => c.partId === l.partId && c.delta > 0);
      tx.set(db.collection('stockMovements').doc(), {
        type: MOVE_TYPE[op.type], partId: l.partId, partName: partNames[l.partId], quantity: l.qty,
        location: (from || to).loc, from: from ? Spares.invDocId(from.loc, from.uid, '').slice(0, -1) : null, to: to ? Spares.invDocId(to.loc, to.uid, '').slice(0, -1) : null,
        serviceCenterUid: (from && from.loc === 'servicecenter' ? from.uid : null) || (to && to.loc === 'servicecenter' ? to.uid : null) || (role === 'technician' ? actorUser.linkedServiceCenterUid || null : null),
        technicianUid: (from && from.loc === 'technician' ? from.uid : null) || (to && to.loc === 'technician' ? to.uid : null),
        reason: op.reason || (op.job ? `${op.type} — ${(job && (job.requestId || job.jobId)) || op.job.id}` : op.type),
        opId: ref.id, sourceJobId: op.job ? op.job.id : null, byUid: op.byUid,
        approvedByUid: op.decidedByUid || null, createdAt: FieldValue.serverTimestamp()
      });
    });
    const returnIds = [];
    if (op.type === 'consume') {
      const jobLabel = (job && (job.requestId || job.jobId)) || op.job.id;
      const centerUid = role === 'servicecenter' ? op.byUid : (job.serviceCenterUid || actorUser.linkedServiceCenterUid || null);
      const due = Timestamp.fromDate(Spares.defectiveDueDate(now));
      lines.forEach((l) => {
        seq += 1;
        const rid = Spares.returnId(now, seq, role === 'servicecenter' ? 'ServiceCenter' : 'Technician');
        returnIds.push(rid);
        tx.set(db.collection('returns').doc(), {
          returnId: rid, partId: l.partId, partName: partNames[l.partId], quantity: l.qty,
          source: `${role === 'servicecenter' ? 'Service Center' : 'Technician'} - ${actorUser.email || actorUser.name || op.byUid}`,
          ...(role === 'technician' ? { technicianUid: op.byUid } : {}),
          ...(centerUid ? { serviceCenterUid: centerUid } : {}),
          reason: `Replaced on job ${jobLabel}`, sourceJobId: op.job.id, sourceJobCollection: op.job.coll, opId: ref.id,
          // The defective part is still out with the center (or handed to
          // it by the technician); it goes to Head Office in the center's
          // monthly batch. A technician with no center sends it directly.
          status: role === 'technician' ? (centerUid ? 'sent_to_center' : 'requested') : 'awaiting_return',
          defectiveDueBy: due, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
        });
      });
      if (op.spareRequestId) {
        tx.set(db.collection('spareRequests').doc(op.spareRequestId), { consumedAt: FieldValue.serverTimestamp(), consumedQty: lines[0].qty, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
    }
    if (op.type === 'send_back') {
      lines.forEach((l) => {
        seq += 1;
        const rid = Spares.returnId(now, seq, 'ServiceCenter');
        returnIds.push(rid);
        tx.set(db.collection('returns').doc(), {
          returnId: rid, partId: l.partId, partName: partNames[l.partId], quantity: l.qty,
          source: `Service Center - ${actorUser.email || op.byUid}`, serviceCenterUid: op.byUid,
          reason: op.reason || 'Sent back to Head Office', opId: ref.id, status: 'requested',
          createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
        });
      });
    }
    if (counterRef) tx.set(counterRef, { value: seq }, { merge: true });
    tx.update(ref, { status: 'done', returnIds, processedAt: FieldValue.serverTimestamp() });
  });
  if (notifyApproval) {
    await db.collection('notifications').add({
      recipientType: 'role', recipientValue: 'warehouse', title: 'Stock add request to approve',
      message: `${notifyApproval.who} (${notifyApproval.role === 'servicecenter' ? 'service center' : 'technician'}) asked to add stock — see Spare Stock Requests.`,
      read: false, createdAt: FieldValue.serverTimestamp()
    });
  }
}

exports.sparesOpCreated = onDocumentCreated(
  { document: 'stockOps/{opId}', region: REGION },
  async (event) => { if (event.data) await applySparesOp(event.data.ref); }
);
exports.sparesOpDecided = onDocumentUpdated(
  { document: 'stockOps/{opId}', region: REGION },
  async (event) => {
    if (!event.data) return;
    const before = event.data.before.data(), after = event.data.after.data();
    if (before.status === 'awaiting_approval' && after.status === 'approved') await applySparesOp(event.data.after.ref);
  }
);

// Low-stock alert: when Head Office stock of a spare drops to or below its
// reorder level (from above it), Warehouse is notified once.
exports.lowStockAlert = onDocumentWritten(
  { document: 'inventory/{invId}', region: REGION },
  async (event) => {
    const after = event.data && event.data.after.exists ? event.data.after.data() : null;
    if (!after || after.location !== 'warehouse' || !after.partId) return;
    const before = event.data.before.exists ? event.data.before.data() : {};
    const part = await db.collection('spareParts').doc(after.partId).get();
    const level = part.exists ? Number(part.get('reorderLevel') || 0) : 0;
    if (!level) return;
    const was = typeof before.quantity === 'number' ? before.quantity : Infinity;
    if (after.quantity <= level && was > level) {
      await db.collection('notifications').add({
        recipientType: 'role', recipientValue: 'warehouse', title: 'Spare part low on stock',
        message: `${part.get('name') || after.partId}${part.get('partCode') ? ' (' + part.get('partCode') + ')' : ''}: ${after.quantity} left, reorder level ${level}.`,
        read: false, createdAt: FieldValue.serverTimestamp()
      });
    }
  }
);

// ---------------------------------------------------------------
// RMA: replacing a customer's defective unit (rma.js). Warehouse raises
// and approves it (choosing the product model); the replacement is
// dispatched here, not in the browser: the serial must be in Head Office
// stock, of the RMA's model and not reserved for an order. The new unit
// gets a warranty registration carrying the original purchase date, so
// its warranty ends when the original's would have. When the defective
// unit arrives back it is held as defective stock, ready to go to the
// brand in a brand return.
// ---------------------------------------------------------------
async function processRmaDispatch(ref) {
  await db.runTransaction(async (tx) => {
    const rma = (await tx.get(ref)).data();
    const req = rma && rma.dispatchRequest;
    if (!rma || !req || !req.requestedAt) return;
    const key = req.requestedAt.toMillis();
    if (rma.dispatchProcessedFor === key) return;
    const fail = (reason) => tx.update(ref, { rmaRejected: { reason, at: FieldValue.serverTimestamp() }, dispatchProcessedFor: key });
    const serial = Stock.normalizeSerial(req.replacementSerial);
    const serialRef = db.collection('unitSerials').doc(Stock.SERIAL_RE.test(serial) ? serial : '-');
    const stockDocRef = stockRef('warehouse', String(rma.modelId || '-'));
    const original = Stock.normalizeSerial(rma.serialNumber || '');
    const [serialSnap, stockSnap, regSnap, origSnap] = await Promise.all([
      tx.get(serialRef), tx.get(stockDocRef),
      original ? tx.get(db.collection('productRegistrations').where('serialNumber', '==', rma.serialNumber).limit(1)) : Promise.resolve(null),
      original && Stock.SERIAL_RE.test(original) ? tx.get(db.collection('unitSerials').doc(original)) : Promise.resolve(null)
    ]);
    const err = Rma.checkReplacement(rma, serial, serialSnap.exists ? serialSnap.data() : null, stockSnap.exists ? stockSnap.data() : null);
    if (err) return fail(err);
    const origReg = regSnap && !regSnap.empty ? regSnap.docs[0] : null;
    const warranty = Rma.carriedWarranty(origReg ? origReg.data() : null);
    tx.set(stockDocRef, { onHand: FieldValue.increment(-1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.update(serialRef, {
      status: 'dispatched', location: 'customer', fromLocation: 'warehouse', soldToType: 'rma', soldToName: rma.customerName || '',
      rmaId: rma.rmaId || ref.id, replacesSerial: original || null, dispatchedAt: FieldValue.serverTimestamp(),
      history: FieldValue.arrayUnion({ event: 'rma_replacement', rmaId: rma.rmaId || ref.id, replaces: original || null, at: Timestamp.now() })
    });
    if (origSnap && origSnap.exists) {
      tx.update(origSnap.ref, { status: 'rma_return_pending', replacedBySerial: serial,
        history: FieldValue.arrayUnion({ event: 'replaced', rmaId: rma.rmaId || ref.id, by: serial, at: Timestamp.now() }) });
    }
    let newRegId = null;
    if (origReg) {
      const o = origReg.data();
      const newReg = db.collection('productRegistrations').doc();
      newRegId = newReg.id;
      tx.set(newReg, {
        registrationId: `${o.registrationId || origReg.id}-R`, customerName: o.customerName || rma.customerName || '', customerPhone: o.customerPhone || rma.customerPhone || '',
        product: o.product || rma.product || '', brand: o.brand || '', category: o.category || '', modelNo: o.modelNo || rma.modelNo || '',
        serialNumber: serial, purchaseDate: warranty.purchaseDate, warrantyMonths: warranty.warrantyMonths,
        ...(o.dealerUid ? { dealerUid: o.dealerUid, dealerName: o.dealerName || '' } : {}),
        source: 'rma', rmaId: rma.rmaId || ref.id, replacesSerial: original, replacesRegistrationId: origReg.id, createdAt: FieldValue.serverTimestamp()
      });
      tx.update(origReg.ref, { replacedBySerial: serial, replacedAt: FieldValue.serverTimestamp(), rmaId: rma.rmaId || ref.id });
    }
    tx.set(db.collection('productMovements').doc(), {
      type: 'rma_replacement', location: 'warehouse', lines: [{ modelId: rma.modelId, qty: 1 }], serial, rmaId: rma.rmaId || ref.id,
      byUid: req.byUid || null, at: FieldValue.serverTimestamp()
    });
    tx.update(ref, {
      status: 'replacement_dispatched', replacementSerial: serial, rmaRejected: null, dispatchProcessedFor: key,
      dispatch: { transporter: req.transporter || '', docket: req.docket || '', date: new Date().toISOString().slice(0, 10), byUid: req.byUid || null },
      replacementRegistrationId: newRegId,
      warrantyCarried: warranty ? { ...warranty } : null
    });
  });
}

async function processRmaReceive(ref) {
  await db.runTransaction(async (tx) => {
    const rma = (await tx.get(ref)).data();
    if (!rma || rma.status !== 'replacement_dispatched' || !rma.receiveRequest) return;
    const original = Stock.normalizeSerial(rma.serialNumber || '');
    const unitRef = Stock.SERIAL_RE.test(original) ? db.collection('unitSerials').doc(original) : db.collection('unitSerials').doc(`RMA-${ref.id}`);
    await tx.get(unitRef);
    tx.set(unitRef, {
      serial: Stock.SERIAL_RE.test(original) ? original : (rma.serialNumber || `RMA-${ref.id}`), modelId: rma.modelId,
      status: 'defective', location: 'warehouse_defective', rmaId: rma.rmaId || ref.id, defectiveSince: FieldValue.serverTimestamp(),
      history: FieldValue.arrayUnion({ event: 'defective_received', rmaId: rma.rmaId || ref.id, at: Timestamp.now() })
    }, { merge: true });
    tx.set(stockRef('warehouse', rma.modelId), { location: 'warehouse', modelId: rma.modelId, defective: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.update(ref, { status: 'defective_received', defectiveUnitId: unitRef.id, defectiveReceivedAt: FieldValue.serverTimestamp() });
  });
}

exports.rmaUpdated = onDocumentUpdatedWithAuthContext(
  { document: 'rmaRequests/{rmaId}', region: REGION },
  async (event) => {
    if (!event.data) return;
    const before = event.data.before.data(), after = event.data.after.data();
    const ref = event.data.after.ref;
    const ms = (x) => (x && x.requestedAt && x.requestedAt.toMillis ? x.requestedAt.toMillis() : 0);
    const jobs = [];
    if (ms(after.dispatchRequest) && ms(after.dispatchRequest) !== ms(before.dispatchRequest)) jobs.push(processRmaDispatch(ref));
    if (ms(after.receiveRequest) && ms(after.receiveRequest) !== ms(before.receiveRequest)) jobs.push(processRmaReceive(ref));
    if (before.status !== after.status) {
      jobs.push(ref.update({ history: FieldValue.arrayUnion({ from: before.status || null, to: after.status,
        byUid: event.authId || (after.dispatch && after.status === 'replacement_dispatched' ? after.dispatch.byUid : null),
        note: after.rejectReason || after.approveNote || '', at: Timestamp.now() }) }));
    }
    await Promise.all(jobs);
  }
);

// ---------------------------------------------------------------
// Brand returns: a shipment of defective units (from RMAs) and/or
// defective spare parts back to the brand. Checked and booked here; the
// brand's credit notes and replacement units are recorded against it
// afterwards (replacements arrive through a normal stock receipt that
// names the brand return).
// ---------------------------------------------------------------
exports.processBrandReturn = onDocumentCreated(
  { document: 'brandReturns/{brId}', region: REGION },
  async (event) => {
    if (!event.data) return;
    const ref = event.data.ref;
    await db.runTransaction(async (tx) => {
      const br = (await tx.get(ref)).data();
      if (!br || br.status !== 'pending') return;
      const unitIds = (br.unitSerials || []).map(String).slice(0, Rma.MAX_BRAND_RETURN_ITEMS);
      const spareIds = (br.spareReturnIds || []).map(String).slice(0, Rma.MAX_BRAND_RETURN_ITEMS);
      const [unitSnaps, spareSnaps] = await Promise.all([
        unitIds.length ? tx.getAll(...unitIds.map((id) => db.collection('unitSerials').doc(id))) : [],
        spareIds.length ? tx.getAll(...spareIds.map((id) => db.collection('returns').doc(id))) : []
      ]);
      const units = unitSnaps.map((x) => ({ id: x.id, ref: x.ref, doc: x.exists ? x.data() : null }));
      const spares = spareSnaps.map((x) => ({ id: x.id, ref: x.ref, doc: x.exists ? x.data() : null }));
      const err = Rma.checkBrandReturn(units, spares);
      if (err) { tx.update(ref, { status: 'rejected', reason: err, processedAt: FieldValue.serverTimestamp() }); return; }
      const rmaIds = new Set();
      const perModel = {};
      units.forEach((u) => {
        tx.update(u.ref, { status: 'sent_to_brand', location: 'brand', brandReturnId: ref.id,
          history: FieldValue.arrayUnion({ event: 'sent_to_brand', brandReturnId: ref.id, at: Timestamp.now() }) });
        perModel[u.doc.modelId] = (perModel[u.doc.modelId] || 0) + 1;
        if (u.doc.rmaId) rmaIds.add(u.doc.rmaId);
      });
      Object.entries(perModel).forEach(([m, n]) => tx.set(stockRef('warehouse', m), { defective: FieldValue.increment(-n), updatedAt: FieldValue.serverTimestamp() }, { merge: true }));
      spares.forEach((s) => tx.update(s.ref, { status: 'supplier_return', brandReturnId: ref.id, updatedAt: FieldValue.serverTimestamp() }));
      tx.update(ref, { status: 'sent', unitCount: units.length, spareCount: spares.length, rmaIds: [...rmaIds], processedAt: FieldValue.serverTimestamp() });
    });
    // Close the RMAs whose defective unit has now gone to the brand.
    const br = (await ref.get()).data();
    for (const rmaId of br.rmaIds || []) {
      const q = await db.collection('rmaRequests').where('rmaId', '==', rmaId).limit(1).get();
      if (!q.empty && q.docs[0].get('status') === 'defective_received') await q.docs[0].ref.update({ status: 'sent_to_brand', brandReturnId: ref.id });
    }
  }
);

// ---------------------------------------------------------------
// One approval queue (approvals.js). Spare part price changes,
// Warehouse stock reductions (write-offs / count corrections) and a
// service center's own rate changes are filed as changeRequests and
// can't be written directly (firestore.rules). When Super Admin approves
// — never the person who asked — the change is applied here, from the
// request's own checked payload, in one transaction, and the requester
// is told the outcome.
// ---------------------------------------------------------------
exports.applyChangeRequest = onDocumentUpdated(
  { document: 'changeRequests/{id}', region: REGION },
  async (event) => {
    if (!event.data) return;
    const before = event.data.before.data(), after = event.data.after.data();
    if (before.status === after.status || !['approved', 'rejected'].includes(after.status)) return;
    const ref = event.data.after.ref;
    let outcome = after.status === 'rejected' ? 'rejected' : null;
    if (after.status === 'approved' && !after.appliedAt) {
      const kind = after.kind || (after.targetCollection === 'spareParts' ? 'spare_price' : null);
      outcome = await db.runTransaction(async (tx) => {
        const fresh = (await tx.get(ref)).data();
        if (fresh.appliedAt || fresh.applyError) return null;
        const fail = (msg) => { tx.update(ref, { applyError: msg, processedAt: FieldValue.serverTimestamp() }); return 'failed: ' + msg; };
        const bad = Approvals.validatePayload(kind, fresh.payload);
        if (bad) return fail(bad);
        const p = fresh.payload;
        if (kind === 'spare_price') {
          const partRef = db.collection('spareParts').doc(String(fresh.targetId || '-'));
          const part = await tx.get(partRef);
          if (!part.exists) return fail('That spare part no longer exists.');
          tx.update(partRef, { price: p.price, updatedAt: FieldValue.serverTimestamp(),
            priceHistory: FieldValue.arrayUnion({ from: part.get('price') ?? null, to: p.price, changeRequestId: ref.id, at: Timestamp.now() }) });
        } else if (kind === 'stock_reduction') {
          const invRef = db.collection('inventory').doc(`warehouse_${p.partId}`);
          const [inv, part] = await Promise.all([tx.get(invRef), tx.get(db.collection('spareParts').doc(p.partId))]);
          const r = Approvals.applyReduction(inv.exists ? inv.get('quantity') : 0, p.qty);
          if (r.error) return fail(r.error);
          tx.set(invRef, { partId: p.partId, location: 'warehouse', quantity: r.next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          tx.set(db.collection('stockMovements').doc(), {
            type: p.mode === 'issue' ? 'issue' : 'adjustment', partId: p.partId, partName: part.exists ? part.get('name') || '' : '',
            location: 'warehouse', quantity: p.mode === 'issue' ? p.qty : -p.qty, reason: p.reason,
            changeRequestId: ref.id, requestedByUid: fresh.requestedByUid || null, approvedByUid: fresh.reviewedByUid || null,
            createdAt: FieldValue.serverTimestamp()
          });
        } else if (kind === 'center_rate') {
          const centerUid = fresh.requestedByUid;
          p.rates.forEach((rt) => {
            const rateRef = db.collection('serviceChargeRates').doc(Billing.rateCardKey('center', centerUid, rt.category, rt.rateType, rt.bucket || null));
            if (rt.amount === null) tx.delete(rateRef);
            else tx.set(rateRef, { scope: 'center', serviceCenterUid: centerUid, category: rt.category, type: rt.rateType, bucket: rt.bucket || null,
              amount: rt.amount, updatedBy: fresh.requestedByEmail || '', approvedByUid: fresh.reviewedByUid || null, changeRequestId: ref.id,
              updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          });
        } else {
          return fail('Unknown request type.');
        }
        tx.update(ref, { appliedAt: FieldValue.serverTimestamp(), applyError: null });
        return 'applied';
      });
    }
    if (outcome && after.requestedByUid) {
      await db.collection('notifications').add({
        recipientType: 'uid', recipientValue: after.requestedByUid,
        title: outcome === 'applied' ? 'Request approved' : outcome === 'rejected' ? 'Request rejected' : 'Approved but could not be applied',
        message: `${after.summary || after.kind || 'Change request'}${outcome === 'rejected' && after.reviewNote ? ' — ' + after.reviewNote : ''}${outcome.startsWith('failed') ? ' — ' + outcome.slice(8) : ''}`,
        read: false, createdAt: FieldValue.serverTimestamp()
      });
    }
  }
);

// ---------------------------------------------------------------
// Technician documents: the owning service center or Head Office may
// verify (stamped with who and when); the technician can only add
// unverified ones (firestore.rules). Nobody but Super Admin can swap the
// file or dates of a verified document.
// ---------------------------------------------------------------
exports.guardTechnicianDocs = onDocumentUpdatedWithAuthContext(
  { document: 'centerTechnicians/{techId}', region: REGION },
  async (event) => {
    if (!event.data || !event.authId) return;
    const before = event.data.before.data(), after = event.data.after.data();
    if (JSON.stringify(before.documents || []) === JSON.stringify(after.documents || [])) return;
    const actor = await db.collection('users').doc(event.authId).get();
    const role = actor.exists ? actor.get('role') : null;
    if (role === 'superadmin') return;
    const canVerify = role === 'warehouse' || (role === 'servicecenter' && event.authId === after.serviceCenterUid);
    const guard = ProfileGuard.guardDocuments(before.documents, after.documents, {
      canVerify, actorUid: event.authId, actorEmail: actor.exists ? actor.get('email') || '' : ''
    });
    if (guard.changed) await event.data.after.ref.update({ documents: guard.documents });
  }
);

// ---------------------------------------------------------------
// Daily document expiry check (08:00 IST). Service center and technician
// documents expiring within 30 days, within 7 days, or expired raise one
// reminder per stage — to the center (and the technician for their own),
// and to Super Admin. docExpiryAlerts remembers what was already sent.
// Expired documents are flagged on screen; work isn't blocked.
// ---------------------------------------------------------------
exports.documentExpiryCheck = onSchedule(
  { schedule: '0 8 * * *', timeZone: 'Asia/Kolkata', region: REGION },
  async (event) => { await runExpiryCheck(event && event.scheduleTime ? new Date(event.scheduleTime) : new Date()); }
);

async function runExpiryCheck(now) {
  const today = new Date(now.getTime() + 330 * 60000).toISOString().slice(0, 10);
  const [centers, techs, alerts] = await Promise.all([
    db.collection('serviceCenterProfiles').get(), db.collection('centerTechnicians').get(), db.collection('docExpiryAlerts').get()
  ]);
  const last = {};
  alerts.forEach((a) => { last[a.id] = a.get('stage'); });
  const out = [];
  const consider = (kind, parentId, owner, d, names) => {
    if (!d || !d.docId) return;
    const st = ProfileGuard.expiryStage(d.expiryDate, today);
    const key = `${kind}_${parentId}_${d.docId}`;
    if (!st || !ProfileGuard.shouldAlert(st.stage, last[key])) return;
    out.push({ key, stage: st.stage, days: st.days, kind, parentId, owner, docType: d.docType || 'Document', expiryDate: d.expiryDate, ...names });
  };
  centers.forEach((c) => (c.get('documents') || []).forEach((d) => consider('center', c.id, { centerUid: c.id }, d,
    { who: c.get('displayName') || c.get('legalBusinessName') || c.get('serviceCenterCode') || c.id })));
  techs.forEach((t) => (t.get('documents') || []).forEach((d) => consider('technician', t.id,
    { centerUid: t.get('serviceCenterUid') || null, techUid: t.get('technicianUid') || null }, d,
    { who: t.get('name') || t.get('fullName') || t.get('technicianCode') || t.id })));
  for (const a of out) {
    const when = a.stage === 'expired' ? `expired on ${a.expiryDate}` : `expires on ${a.expiryDate} (${a.days} day${a.days === 1 ? '' : 's'})`;
    const msg = `${a.who}: ${a.docType} ${when}.`;
    const title = a.stage === 'expired' ? 'Document expired' : 'Document expiring soon';
    const targets = [{ recipientType: 'role', recipientValue: 'superadmin' }];
    if (a.owner.centerUid) targets.push({ recipientType: 'uid', recipientValue: a.owner.centerUid });
    if (a.owner.techUid) targets.push({ recipientType: 'uid', recipientValue: a.owner.techUid });
    const batch = db.batch();
    targets.forEach((t) => batch.set(db.collection('notifications').doc(), { ...t, title, message: msg, read: false, createdAt: FieldValue.serverTimestamp() }));
    batch.set(db.collection('docExpiryAlerts').doc(a.key), { stage: a.stage, expiryDate: a.expiryDate, at: FieldValue.serverTimestamp() });
    await batch.commit();
  }
  return out.length;
}

// ---------------------------------------------------------------
// Customers (Phase 4). The website's Warranty Check / Track Service /
// "find my product" lookups used to read productRegistrations and the
// ticket mirror straight from the browser, which meant those collections
// had to be readable by everyone. They now go through publicLookup: one
// phone (or ticket + phone) per call, minimal fields, rate limited.
// ---------------------------------------------------------------

// Counts one use against each limit bucket (all in one transaction); throws
// resource-exhausted if any bucket is already full.
async function consumeLimits(keys, message) {
  const now = Date.now();
  const refs = keys.map((k) => db.collection('lookupLimits').doc(k.id));
  const ok = await db.runTransaction(async (tx) => {
    const snaps = await tx.getAll(...refs);
    const counts = {};
    keys.forEach((k, i) => { counts[k.id] = snaps[i].exists ? (snaps[i].data().count || 0) : 0; });
    const verdict = Lookup.checkLimits(keys, counts);
    if (!verdict.ok) return false;
    keys.forEach((k, i) => tx.set(refs[i], { count: counts[k.id] + 1, expireAt: Timestamp.fromDate(new Date(now + 26 * 3600000)) }));
    return true;
  });
  if (!ok) throw new HttpsError('resource-exhausted', message || 'Too many lookups. Please try again in an hour.');
}

function callerIpHash(request) {
  const raw = request.rawRequest || {};
  const ip = String(raw.ip || ((raw.headers || {})['x-forwarded-for'] || '').split(',')[0] || 'unknown').trim();
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

async function lookupRateGuard(request, phone, ticket) {
  await consumeLimits(Lookup.limitKeys(callerIpHash(request), phone, ticket, Date.now()));
}

async function lookupRegistrations(phone, fullSerial) {
  const snap = await db.collection('productRegistrations').where('customerPhone', '==', phone).limit(20).get();
  const out = [];
  snap.forEach((d) => out.push(Lookup.shapeRegistration(d.data(), { fullSerial })));
  return out;
}

async function lookupTrack(ticket, phone) {
  const ticketLike = (d, id, mirror) => ({
    found: true, kind: 'ticket',
    ...Lookup.shapeTicket(Object.assign({}, d, mirror ? { status: mirror.status, warrantyStatus: mirror.warrantyStatus || d.warrantyStatus } : {}), id),
    feedbackStatus: mirror ? (mirror.status || null) : null
  });
  if (ticket.startsWith('PE-REG-')) {
    const snap = await db.collection('productRegistrations').where('registrationId', '==', ticket).limit(5).get();
    let match = null;
    snap.forEach((d) => { if (d.data().customerPhone === phone) match = d.data(); });
    if (!match) return { found: false };
    return { found: true, kind: 'registration', ...Lookup.shapeRegistration(match, {}) };
  }
  const mirrorSnap = await db.collection('publicTicketStatus').doc(ticket).get();
  const mirrorOk = mirrorSnap.exists && mirrorSnap.data().customerPhone === phone ? mirrorSnap.data() : null;
  if (ticket.startsWith('PE-CR-') || ticket.startsWith('PE-JOB-')) {
    if (!mirrorOk) return { found: false };
    return ticketLike(mirrorOk, ticket, mirrorOk);
  }
  const reqSnap = await db.collection('publicServiceRequests').doc(ticket).get();
  if (!reqSnap.exists || reqSnap.data().customerPhone !== phone) return { found: false };
  return ticketLike(reqSnap.data(), ticket, mirrorOk);
}

exports.publicLookup = onCall({ region: REGION, maxInstances: 10 }, async (request) => {
  const data = request.data || {};
  const type = data.type;
  const phone = Lookup.normalizePhone(data.phone);
  if (!phone) throw new HttpsError('invalid-argument', 'Enter a valid 10-digit mobile number.');
  if (type === 'warranty' || type === 'registrations') {
    await lookupRateGuard(request, phone, null);
    const registrations = await lookupRegistrations(phone, type === 'registrations');
    if (type === 'registrations') return { registrations };
    const tsnap = await db.collection('publicTicketStatus').where('customerPhone', '==', phone).limit(30).get();
    const tickets = [];
    tsnap.forEach((d) => tickets.push(Lookup.shapeTicket(d.data(), d.id)));
    return { registrations, tickets };
  }
  if (type === 'track') {
    const ticket = Lookup.cleanTicketId(data.ticket);
    if (!ticket) throw new HttpsError('invalid-argument', 'Enter your request number.');
    await lookupRateGuard(request, phone, ticket);
    return lookupTrack(ticket, phone);
  }
  throw new HttpsError('invalid-argument', 'Unknown lookup.');
});

// Creates (or refreshes) the signed-in customer's profile. The phone comes
// from the sign-in token, i.e. it is the number the customer proved with an
// OTP — never something typed into the page. Staff/dealer/distributor
// accounts can't be turned into customers (or the other way round).
exports.ensureCustomerProfile = onCall({ region: REGION, maxInstances: 10 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const uid = request.auth.uid;
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  const existing = snap.exists ? snap.data() : null;
  const built = Lookup.buildCustomerProfile(request.auth.token, (request.data || {}).name, existing);
  if (built.error === 'phone-not-verified') throw new HttpsError('failed-precondition', 'phone-not-verified');
  if (built.error === 'not-a-customer') throw new HttpsError('permission-denied', 'This account is not a customer account.');
  const profile = Object.assign({}, built.profile, { updatedAt: FieldValue.serverTimestamp() });
  if (!existing) profile.createdAt = FieldValue.serverTimestamp();
  await ref.set(profile, { merge: true });
  return { ok: true, phone10: built.profile.phone10 };
});

// ---------------------------------------------------------------
// Customer portal actions. Each one needs a signed-in customer whose
// phone is verified; the phone, uid and ownership are always taken from the
// token / the stored records, never from what the browser sends.
// ---------------------------------------------------------------

async function requireCustomer(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const phone = Lookup.phoneFromToken(request.auth.token && request.auth.token.phone_number);
  if (!phone) throw new HttpsError('failed-precondition', 'phone-not-verified');
  const snap = await db.collection('users').doc(request.auth.uid).get();
  if (!snap.exists || snap.data().role !== 'customer') throw new HttpsError('failed-precondition', 'no-customer-profile');
  return { uid: request.auth.uid, phone, profile: snap.data() };
}

const pad4 = (n) => String(n).padStart(4, '0');

async function matchWarrantyPlan(brandId, categoryId) {
  try {
    const snap = await db.collection('warrantyPlans').where('brandId', '==', brandId).where('status', '==', 'active').get();
    let byCategory = null, generic = null;
    snap.forEach((p) => {
      const pd = p.data();
      if (categoryId && pd.categoryId === categoryId) byCategory = { id: p.id, ...pd };
      else if (!pd.categoryId) generic = { id: p.id, ...pd };
    });
    return byCategory || generic || null;
  } catch (e) { return null; }
}

async function findRegistrationBySerial(serial) {
  const q = await db.collection('productRegistrations').where('serialNumber', '==', serial).limit(1).get();
  if (!q.empty) return q.docs[0].data();
  const lock = await db.collection('registrationSerials').doc(serial).get();
  if (lock.exists) return { registrationId: lock.get('registrationId'), customerPhone: null };
  const unit = await db.collection('unitSerials').doc(serial).get();
  if (unit.exists && unit.data().registrationId) return { registrationId: unit.data().registrationId, customerPhone: null };
  return null;
}

function rememberContact(uid, r) {
  return db.collection('users').doc(uid).set({
    contact: { address: r.address, city: r.city, state: r.state, pincode: r.pincode },
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true }).catch(() => {});
}

exports.registerProduct = onCall({ region: REGION, maxInstances: 10 }, async (request) => {
  const cust = await requireCustomer(request);
  const now = Date.now();
  const v = Customer.validateRegistration(request.data, now);
  if (v.error) throw new HttpsError('invalid-argument', v.error);
  const r = v.value;
  const ist = Customer.istDate(now);
  await consumeLimits([{ id: `reg_${cust.uid}_${ist.dayBucket}`, max: 10 }], 'You have registered a lot of products today. Please try again tomorrow.');
  if (r.serialNumber) {
    const dup = await findRegistrationBySerial(r.serialNumber);
    if (dup) throw new HttpsError('already-exists', dup.customerPhone === cust.phone
      ? 'You have already registered this serial number.'
      : 'This serial number is already registered. If you bought this product second-hand, please contact support.');
  }
  const plan = await matchWarrantyPlan(r.brandId, r.categoryId);
  const counterRef = db.collection('counters').doc(`productreg-${ist.ym}`);
  const regRef = db.collection('productRegistrations').doc();
  const lockRef = r.serialNumber ? db.collection('registrationSerials').doc(r.serialNumber) : null;
  const registrationId = await db.runTransaction(async (tx) => {
    const c = await tx.get(counterRef);
    const lock = lockRef ? await tx.get(lockRef) : null;
    // Two people registering the same serial at the same moment both pass
    // the check above; only one can take the serial's lock.
    if (lock && lock.exists) throw new HttpsError('already-exists', 'This serial number is already registered. If you bought this product second-hand, please contact support.');
    const next = (c.exists ? (c.data().value || 0) : 0) + 1;
    tx.set(counterRef, { value: next });
    const id = `PE-REG-${ist.ymd}-${pad4(next)}-Portal`;
    if (lockRef) tx.create(lockRef, { registrationId: id, docId: regRef.id, at: FieldValue.serverTimestamp() });
    tx.create(regRef, {
      registrationId: id,
      customerName: r.customerName, customerPhone: cust.phone, customerUid: cust.uid,
      address: r.address, city: r.city, state: r.state, pincode: r.pincode,
      brand: r.brand, category: r.category, categoryId: r.categoryId,
      modelNo: r.modelNo, serialNumber: r.serialNumber,
      product: `${r.brand} ${r.category} — ${r.modelNo}`,
      purchaseDate: r.purchaseDate, dealerName: r.dealerName,
      installationRequired: r.installationRequired,
      warrantyMonths: Customer.overallWarrantyMonths(plan),
      warrantyPlanId: plan ? plan.id : null,
      warrantyComponents: plan ? (plan.components || null) : null,
      status: 'active', source: 'portal',
      createdAt: FieldValue.serverTimestamp()
    });
    return id;
  });
  await rememberContact(cust.uid, r);
  return { registrationId };
});

// Warranty by serial number: tells a customer whether a unit is theirs,
// already taken, or free to register — without ever revealing another
// customer's details.
exports.checkWarranty = onCall({ region: REGION, maxInstances: 10 }, async (request) => {
  const cust = await requireCustomer(request);
  const serial = Stock.normalizeSerial((request.data || {}).serial);
  if (!Stock.SERIAL_RE.test(serial)) throw new HttpsError('invalid-argument', 'Enter the serial number printed on the product.');
  await consumeLimits([
    { id: `ws_${cust.uid}_${Lookup.hourBucket(Date.now())}`, max: 20 },
    { id: `ip_${callerIpHash(request)}_${Lookup.hourBucket(Date.now())}`, max: 60 }
  ]);
  const q = await db.collection('productRegistrations').where('serialNumber', '==', serial).limit(1).get();
  if (!q.empty) {
    const d = q.docs[0].data();
    if (d.customerPhone === cust.phone) return { state: 'yours', registration: Lookup.shapeRegistration(d, { fullSerial: true }) };
    return { state: 'registered_other' };
  }
  const unit = await db.collection('unitSerials').doc(serial).get();
  if (unit.exists) {
    if (unit.data().registrationId) return { state: 'registered_other' };
    let modelNo = '';
    if (unit.data().modelId) {
      const m = await db.collection('productModels').doc(unit.data().modelId).get();
      if (m.exists) modelNo = String(m.data().modelNumber || '');
    }
    return { state: 'unregistered', modelNo };
  }
  return { state: 'unknown' };
});

exports.bookService = onCall({ region: REGION, maxInstances: 10 }, async (request) => {
  const cust = await requireCustomer(request);
  const now = Date.now();
  const v = Customer.validateBooking(request.data);
  if (v.error) throw new HttpsError('invalid-argument', v.error);
  const b = v.value;
  const ist = Customer.istDate(now);
  await consumeLimits([{ id: `bk_${cust.phone}_${ist.dayBucket}`, max: 6 }], 'You have booked several requests today. Please try again tomorrow, or call us for anything urgent.');
  let product = {};
  if (b.registrationId) {
    const q = await db.collection('productRegistrations').where('registrationId', '==', b.registrationId).limit(1).get();
    const reg = q.empty ? null : q.docs[0].data();
    if (!reg || reg.customerPhone !== cust.phone) throw new HttpsError('permission-denied', 'That product is not registered to your account.');
    product = {
      brand: reg.brand || '', category: reg.category || '', modelNo: reg.modelNo || '', serialNumber: reg.serialNumber || '',
      purchaseDate: reg.purchaseDate || '', dealerName: reg.dealerName || '',
      product: reg.product || `${reg.brand || ''} ${reg.category || ''}`.trim(), linkedRegistrationId: reg.registrationId
    };
  } else {
    product = {
      brand: b.brand, category: b.category, modelNo: b.modelNo || '', serialNumber: b.serialNumber || '',
      purchaseDate: b.purchaseDate || '', dealerName: '',
      product: `${b.brand} ${b.category}${b.modelNo ? ' — ' + b.modelNo : ''}`, linkedRegistrationId: null
    };
  }
  const counterRef = db.collection('counters').doc(`publicservice-${ist.ym}`);
  const requestId = await db.runTransaction(async (tx) => {
    const c = await tx.get(counterRef);
    const next = (c.exists ? (c.data().value || 0) : 0) + 1;
    tx.set(counterRef, { value: next });
    const id = `PE-SVC-${ist.ymd}-${pad4(next)}-Portal`;
    tx.create(db.collection('publicServiceRequests').doc(id), {
      requestId: id,
      customerName: b.customerName, customerPhone: cust.phone, customerUid: cust.uid,
      address: b.address, city: b.city, state: b.state, pincode: b.pincode,
      ...product,
      requestType: b.requestType, issueDescription: b.issueDescription,
      status: 'new', source: 'portal',
      createdAt: FieldValue.serverTimestamp()
    });
    return id;
  });
  await rememberContact(cust.uid, b);
  return { requestId };
});

// ---------------------------------------------------------------
// Customer-facing tracking record (customerTracking/<ticketId>): written only
// here, from the real ticket, so the status history can't be edited from a
// browser. The portal's "My Services" timeline reads it.
// ---------------------------------------------------------------

async function writeTrack(src, fallbackId) {
  const probe = Object.assign({}, src, src.requestId || src.jobId ? {} : { requestId: fallbackId });
  const ref = db.collection('customerTracking').doc(Customer.ticketIdOf(probe) || '_none_');
  if (!Customer.ticketIdOf(probe)) return;
  await db.runTransaction(async (tx) => {
    const prevSnap = await tx.get(ref);
    const prev = prevSnap.exists ? prevSnap.data() : null;
    const built = Customer.buildTrack(prev, probe, Timestamp.now());
    if (!built) return;
    const data = built.data;
    if (prev && prev.customerUid && !data.customerUid) data.customerUid = prev.customerUid;
    data.createdAt = (prev && prev.createdAt) || src.createdAt || FieldValue.serverTimestamp();
    data.updatedAt = FieldValue.serverTimestamp();
    tx.set(ref, data);
  });
}

exports.trackOnPublicRequest = onDocumentCreated(
  { document: 'publicServiceRequests/{docId}', region: REGION },
  async (event) => { if (event.data) await writeTrack(event.data.data(), event.params.docId); }
);

for (const coll of ['centerRequests', 'serviceJobs']) {
  exports[`trackSync_${coll}`] = onDocumentWritten(
    { document: `${coll}/{docId}`, region: REGION },
    async (event) => {
      const after = event.data && event.data.after;
      if (!after || !after.exists) return;
      await writeTrack(after.data(), event.params.docId);
    }
  );
}

// ---------------------------------------------------------------
// Customer support tickets (supportTickets/<PE-SUP-...>). Customers open
// and reply from the portal; Super Admin / Warehouse answer from the CRM.
// Everything goes through this one function so the thread can't be edited
// from a browser, and a customer only ever touches their own tickets.
// ---------------------------------------------------------------
exports.supportTicket = onCall({ region: REGION, maxInstances: 10 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const data = request.data || {};
  const userSnap = await db.collection('users').doc(request.auth.uid).get();
  const role = userSnap.exists ? userSnap.data().role : null;
  const isStaffAdmin = role === 'superadmin' || role === 'warehouse';
  const now = Date.now();

  if (data.action === 'create') {
    const cust = await requireCustomer(request);
    const v = Customer.validateSupportCreate(data);
    if (v.error) throw new HttpsError('invalid-argument', v.error);
    const ist = Customer.istDate(now);
    await consumeLimits([{ id: `sp_${cust.phone}_${ist.dayBucket}`, max: 5 }], 'You have opened several tickets today. Please reply on an existing ticket instead.');
    const counterRef = db.collection('counters').doc(`support-${ist.ym}`);
    const ticketNo = await db.runTransaction(async (tx) => {
      const c = await tx.get(counterRef);
      const next = (c.exists ? (c.data().value || 0) : 0) + 1;
      tx.set(counterRef, { value: next });
      const id = `PE-SUP-${ist.ymd}-${pad4(next)}`;
      tx.create(db.collection('supportTickets').doc(id), {
        ticketNo: id, customerUid: cust.uid, customerPhone: cust.phone, customerName: cust.profile.name || '',
        category: v.value.category, subject: v.value.subject, relatedTicketId: v.value.relatedTicketId || '',
        status: 'open', lastFrom: 'customer',
        messages: [{ from: 'customer', name: cust.profile.name || '', text: v.value.text, at: Timestamp.now() }],
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
      });
      tx.set(db.collection('notifications').doc(), {
        recipientType: 'role', recipientValue: 'superadmin',
        title: 'New customer support ticket', message: `${id} — ${v.value.subject}`,
        read: false, createdAt: FieldValue.serverTimestamp()
      });
      return id;
    });
    return { ticketNo };
  }

  const ticketNo = Lookup.cleanTicketId(data.ticketNo);
  if (!ticketNo) throw new HttpsError('invalid-argument', 'Unknown ticket.');
  let actor, name, custPhone = null;
  if (isStaffAdmin) { actor = 'staff'; name = 'Pushpak Support'; }
  else {
    const cust = await requireCustomer(request);
    actor = 'customer'; name = cust.profile.name || '';
    custPhone = cust.phone;
  }
  if (!['reply', 'close', 'reopen'].includes(data.action)) throw new HttpsError('invalid-argument', 'Unknown action.');
  const ref = db.collection('supportTickets').doc(ticketNo);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Ticket not found.');
    const t = snap.data();
    if (actor === 'customer' && t.customerPhone !== custPhone) throw new HttpsError('permission-denied', 'This is not your ticket.');
    const res = Customer.applySupportAction(t, data.action, actor, data.message, name, Timestamp.now());
    if (res.error) throw new HttpsError('failed-precondition', res.error);
    tx.update(ref, Object.assign({}, res.update, { updatedAt: FieldValue.serverTimestamp() }));
    if (actor === 'customer' && data.action === 'reply') {
      tx.set(db.collection('notifications').doc(), {
        recipientType: 'role', recipientValue: 'superadmin', title: 'Customer replied on a support ticket',
        message: `${ticketNo} — ${t.subject || ''}`, read: false, createdAt: FieldValue.serverTimestamp()
      });
    }
    return { ok: true, status: res.update.status };
  });
});
