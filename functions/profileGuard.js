// Guards edits to service center and technician documents, and works out
// expiry reminders (pure, unit-testable).
const VERIFY_FIELDS = ['verified', 'verifiedBy', 'verificationDate'];
const LOCKED_WHEN_VERIFIED = ['fileUrl', 'docType', 'issueDate', 'expiryDate'];
const SENSITIVE_FIELDS = ['bankDetails', 'gstin', 'pan', 'legalBusinessName'];

const same = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);

// Returns { documents, changed } — the corrected documents list.
// opts.canVerify: the person saving may verify (Head Office for a center's
// documents; the owning center or Head Office for a technician's). Without
// it, any verification they set is put back. With it, a newly verified
// document is stamped with who verified it and when. Either way, a
// document that was already verified keeps its file, type and dates —
// only Super Admin (who skips this guard) can change those.
function guardDocuments(beforeDocs, afterDocs, opts = {}) {
  const before = {};
  (Array.isArray(beforeDocs) ? beforeDocs : []).forEach((d) => { if (d && d.docId) before[d.docId] = d; });
  let changed = false;
  const today = opts.today || new Date().toISOString().slice(0, 10);
  const stamp = (fixed) => {
    if (fixed.verifiedByUid !== opts.actorUid) { fixed.verifiedByUid = opts.actorUid || null; changed = true; }
    if (!fixed.verifiedBy) { fixed.verifiedBy = opts.actorEmail || ''; changed = true; }
    if (!fixed.verificationDate) { fixed.verificationDate = today; changed = true; }
  };
  const documents = (Array.isArray(afterDocs) ? afterDocs : []).map((d) => {
    if (!d || typeof d !== 'object') return d;
    const prev = d.docId ? before[d.docId] : null;
    const fixed = { ...d };
    if (prev) {
      if (!opts.canVerify) {
        VERIFY_FIELDS.forEach((k) => { if (!same(fixed[k], prev[k])) { fixed[k] = prev[k] === undefined ? null : prev[k]; changed = true; } });
      } else if (fixed.verified && !prev.verified) {
        stamp(fixed);
      }
      if (prev.verified) {
        LOCKED_WHEN_VERIFIED.forEach((k) => { if (!same(fixed[k], prev[k])) { fixed[k] = prev[k] === undefined ? null : prev[k]; changed = true; } });
      }
    } else if (!opts.canVerify) {
      if (fixed.verified || fixed.verifiedBy || fixed.verificationDate) {
        fixed.verified = false; fixed.verifiedBy = ''; fixed.verificationDate = '';
        changed = true;
      }
    } else if (fixed.verified) {
      stamp(fixed);
    }
    return fixed;
  });
  return { documents, changed };
}

// Expiry reminders: '30' (within 30 days), '7' (within 7 days),
// 'expired'; null when not due or no date. today/expiry are YYYY-MM-DD.
const STAGE_RANK = { '30': 1, '7': 2, expired: 3 };
function expiryStage(expiryDate, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(expiryDate || ''))) return null;
  const days = Math.round((Date.parse(expiryDate) - Date.parse(today)) / 86400000);
  if (days < 0) return { stage: 'expired', days };
  if (days <= 7) return { stage: '7', days };
  if (days <= 30) return { stage: '30', days };
  return null;
}
// Should a reminder go out, given the last stage already alerted?
function shouldAlert(stage, lastStage) {
  return !!stage && (STAGE_RANK[stage] || 0) > (STAGE_RANK[lastStage] || 0);
}

// Which payout/tax identity fields the center changed (for a Super Admin alert).
function sensitiveChanges(before, after) {
  return SENSITIVE_FIELDS.filter((k) => !same((before || {})[k], (after || {})[k]));
}

module.exports = { guardDocuments, sensitiveChanges, SENSITIVE_FIELDS, expiryStage, shouldAlert };
