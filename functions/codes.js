// Issues the next sequential code (e.g. SC-0001) for a document that
// doesn't have one yet. Runs inside a transaction so two documents can
// never be handed the same number, and it is idempotent: if the document
// already has a code (or was deleted in the meantime) it changes nothing
// and uses up no number.
//
// `db` is a firebase-admin Firestore instance (a tiny fake in the tests).
async function assignCodeIfMissing(db, docRef, { field, counterId, prefix }) {
  const counterRef = db.collection('counters').doc(counterId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    if (!snap.exists) return null;
    const existing = snap.get(field);
    if (existing) return existing;

    const counterSnap = await tx.get(counterRef);
    const next = (counterSnap.exists ? Number(counterSnap.get('value')) || 0 : 0) + 1;
    const code = prefix + String(next).padStart(4, '0');

    tx.set(counterRef, { value: next });
    tx.update(docRef, { [field]: code });
    return code;
  });
}

module.exports = { assignCodeIfMissing };
