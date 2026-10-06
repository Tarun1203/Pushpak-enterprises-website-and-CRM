// Spare-part stock operations by service centers and technicians (pure,
// unit-testable). The browser files a stockOps document; the
// applySparesOp function checks it and moves stock + writes the ledger in
// one transaction, so stock can't go negative or change without a record.
const OP_TYPES = ['consume', 'transfer_to_technician', 'draw_from_center', 'remove', 'send_back', 'add_request'];
const MAX_LINES = 20;
const MAX_QTY = 1000;
const IST_MS = 330 * 60 * 1000;

function validateOpLines(lines) {
  if (!Array.isArray(lines) || !lines.length) return 'No parts given.';
  if (lines.length > MAX_LINES) return `At most ${MAX_LINES} parts at once.`;
  const seen = new Set();
  for (const l of lines) {
    if (!l || typeof l.partId !== 'string' || !l.partId) return 'A part is missing.';
    if (!Number.isInteger(l.qty) || l.qty < 1 || l.qty > MAX_QTY) return 'Quantities must be whole numbers from 1 to ' + MAX_QTY + '.';
    if (seen.has(l.partId)) return 'The same part is listed twice.';
    seen.add(l.partId);
  }
  return null;
}

const ist = (d) => new Date(d.getTime() + IST_MS);
const pad = (n, w = 2) => String(n).padStart(w, '0');
function ymdIST(d) { const x = ist(d); return `${x.getUTCFullYear()}${pad(x.getUTCMonth() + 1)}${pad(x.getUTCDate())}`; }
function yyyymmIST(d) { return ymdIST(d).slice(0, 6); }
// Same format the CRM pages use: PE-RT-20261006-0007-ServiceCenter
function returnId(d, seq, source) { return `PE-RT-${ymdIST(d)}-${pad(seq, 4)}-${source}`; }

// Defective parts go back in one batch a month: anything used in a month
// is due at Head Office by the end of the following month (IST).
function defectiveDueDate(d) {
  const x = ist(d);
  const endOfNext = Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 2, 1) - 1; // last ms of next month, IST wall clock
  return new Date(endOfNext - IST_MS);
}

// Stock changes an op makes: [{ loc: 'servicecenter'|'technician', uid, partId, delta }]
function stockChanges(type, lines, actor) {
  const own = (sign) => lines.map((l) => ({ loc: actor.role, uid: actor.uid, partId: l.partId, delta: sign * l.qty }));
  switch (type) {
    case 'consume': case 'remove': case 'send_back': return own(-1);
    case 'add_request': return own(1);
    case 'transfer_to_technician':
      return [].concat(...lines.map((l) => [
        { loc: 'servicecenter', uid: actor.uid, partId: l.partId, delta: -l.qty },
        { loc: 'technician', uid: actor.techUid, partId: l.partId, delta: l.qty }]));
    case 'draw_from_center':
      return [].concat(...lines.map((l) => [
        { loc: 'servicecenter', uid: actor.centerUid, partId: l.partId, delta: -l.qty },
        { loc: 'technician', uid: actor.uid, partId: l.partId, delta: l.qty }]));
    default: return [];
  }
}

const invDocId = (loc, uid, partId) => `${loc}_${uid}_${partId}`;

// Applies changes to current quantities; returns an error if any would go below 0.
function applyChanges(changes, current, partNames) {
  const next = { ...current };
  for (const c of changes) {
    const id = invDocId(c.loc, c.uid, c.partId);
    const have = next[id] || 0;
    if (have + c.delta < 0) {
      const where = c.loc === 'servicecenter' ? 'the center\'s stock' : 'the Spare Bag';
      return { error: `Only ${have} of ${(partNames && partNames[c.partId]) || c.partId} in ${where}.` };
    }
    next[id] = have + c.delta;
  }
  return { next };
}

module.exports = { OP_TYPES, MAX_LINES, MAX_QTY, validateOpLines, ymdIST, yyyymmIST, returnId, defectiveDueDate, stockChanges, invDocId, applyChanges };
