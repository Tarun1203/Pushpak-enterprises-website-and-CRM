const { onDocumentWritten, onDocumentWrittenWithAuthContext, onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { assignCodeIfMissing } = require('./codes');
const { buildAuditEntries } = require('./audit');
const { computeIntakeWarranty, isPossibleDuplicate } = require('./intake');
const { findCandidates, pickLeastLoaded } = require('./routing');

initializeApp();
const db = getFirestore();

// IMPORTANT: must match the location of your Firestore database
// (Firebase Console -> Firestore Database -> the location shown at the
// top, e.g. asia-south1 for Mumbai). A mismatch makes the deploy fail.
const REGION = 'us-central1';

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
