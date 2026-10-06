// Files a spare-stock request (stockOps) for a service center or
// technician and waits for the applySparesOp Cloud Function to apply or
// refuse it. Stock and its ledger line are only ever changed server-side.
import { collection, doc, getDoc, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// op: { type, lines: [{ partId, qty }], job?: { coll, id }, techUid?, reason?, spareRequestId? }
// Resolves to the processed op: status 'done' | 'rejected' (with reason)
// | 'awaiting_approval' | 'timeout' (still being processed).
export async function runStockOp(db, user, op) {
  const payload = {
    type: op.type, byUid: user.uid, byEmail: user.email || '',
    lines: op.lines.map((l) => ({ partId: l.partId, qty: Number(l.qty) })),
    status: 'pending', createdAt: serverTimestamp()
  };
  if (op.job) payload.job = { coll: op.job.coll, id: op.job.id };
  if (op.techUid) payload.techUid = op.techUid;
  if (op.reason) payload.reason = String(op.reason).slice(0, 300);
  if (op.spareRequestId) payload.spareRequestId = op.spareRequestId;
  const ref = await addDoc(collection(db, 'stockOps'), payload);
  for (let i = 0; i < 30; i++) {
    await sleep(i < 5 ? 600 : 1200);
    const snap = await getDoc(doc(db, 'stockOps', ref.id));
    const d = snap.exists() ? snap.data() : null;
    if (d && d.status !== 'pending') return { id: ref.id, ...d };
  }
  return { id: ref.id, status: 'timeout', reason: 'Still being processed — check again in a minute.' };
}

// Throws with the server's reason unless the op was applied.
export async function runStockOpOrThrow(db, user, op) {
  const r = await runStockOp(db, user, op);
  if (r.status === 'done') return r;
  const err = new Error(r.reason || 'The stock change was refused.');
  err.stockOp = r;
  throw err;
}
