const { onDocumentWritten, onDocumentWrittenWithAuthContext, onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { assignCodeIfMissing } = require('./codes');
const { buildAuditEntries } = require('./audit');
const { computeIntakeWarranty, isPossibleDuplicate } = require('./intake');

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
