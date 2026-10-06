const { onDocumentWritten, onDocumentWrittenWithAuthContext, onDocumentCreated, onDocumentCreatedWithAuthContext, onDocumentUpdatedWithAuthContext, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
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
  await event.data.ref.update(revert);
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
  let reg = null;
  if (ticket.serialNumber) {
    const q = await db.collection('productRegistrations').where('serialNumber', '==', ticket.serialNumber).limit(1).get();
    if (!q.empty) reg = q.docs[0].data();
  }
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
// Claim check. When a claim is submitted, recompute what it should be
// worth from the records it points at and store the result as
// `claimCheck` (server-only). Wallet claims are checked against the
// technician's credits; service center claims against the tickets'
// stored billing totals. Free-form claims are marked "manual" for the
// approver to judge. Nothing is blocked — Warehouse sees the flag.
// ---------------------------------------------------------------
exports.checkClaim = onDocumentCreated(
  { document: 'claims/{docId}', region: REGION },
  async (event) => {
    if (!event.data) return;
    const claim = event.data.data();
    let check;
    if (Array.isArray(claim.walletTxnIds) && claim.walletTxnIds.length) {
      const snaps = await Promise.all(claim.walletTxnIds.slice(0, 50).map((id) => db.collection('walletTransactions').doc(id).get()));
      check = Billing.verifyWalletClaim(claim, snaps.filter((x) => x.exists).map((x) => ({ id: x.id, ...x.data() })));
    } else if (Array.isArray(claim.ticketIds) && claim.ticketIds.length) {
      const snaps = await Promise.all(claim.ticketIds.slice(0, 50).map((id) => db.collection('centerRequests').doc(id).get()));
      check = Billing.verifyTicketClaim(claim, snaps.filter((x) => x.exists).map((x) => ({ id: x.id, ...x.data() })));
    } else {
      check = { kind: 'manual', status: 'manual', claimed: Number(claim.amount) || 0, verified: null, issues: [] };
    }
    await event.data.ref.update({ claimCheck: { ...check, at: FieldValue.serverTimestamp() } });
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
    if (!event.data || event.authId !== event.params.uid) return; // only the center's own edits
    const before = event.data.before.data();
    const after = event.data.after.data();
    const guard = ProfileGuard.guardDocuments(before.documents, after.documents);
    const jobs = [];
    if (guard.changed) {
      jobs.push(event.data.after.ref.update({
        documents: guard.documents,
        documentsRejected: { reason: 'Only Super Admin can verify documents or change a verified one.', at: FieldValue.serverTimestamp() }
      }));
    }
    const changedFields = ProfileGuard.sensitiveChanges(before, after);
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
