// Guards a service center's edits to its OWN profile (pure, unit-testable).
// Only Super Admin verifies a center's documents, so when the center
// itself saves, any verification it set is put back, and a document that
// was already verified can't have its file, type or dates swapped.
const VERIFY_FIELDS = ['verified', 'verifiedBy', 'verificationDate'];
const LOCKED_WHEN_VERIFIED = ['fileUrl', 'docType', 'issueDate', 'expiryDate'];
const SENSITIVE_FIELDS = ['bankDetails', 'gstin', 'pan', 'legalBusinessName'];

const same = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);

// Returns { documents, changed } — the corrected documents list.
function guardDocuments(beforeDocs, afterDocs) {
  const before = {};
  (Array.isArray(beforeDocs) ? beforeDocs : []).forEach((d) => { if (d && d.docId) before[d.docId] = d; });
  let changed = false;
  const documents = (Array.isArray(afterDocs) ? afterDocs : []).map((d) => {
    if (!d || typeof d !== 'object') return d;
    const prev = d.docId ? before[d.docId] : null;
    const fixed = { ...d };
    if (prev) {
      VERIFY_FIELDS.forEach((k) => { if (!same(fixed[k], prev[k])) { fixed[k] = prev[k] === undefined ? null : prev[k]; changed = true; } });
      if (prev.verified) {
        LOCKED_WHEN_VERIFIED.forEach((k) => { if (!same(fixed[k], prev[k])) { fixed[k] = prev[k] === undefined ? null : prev[k]; changed = true; } });
      }
    } else if (fixed.verified || fixed.verifiedBy || fixed.verificationDate) {
      fixed.verified = false; fixed.verifiedBy = ''; fixed.verificationDate = '';
      changed = true;
    }
    return fixed;
  });
  return { documents, changed };
}

// Which payout/tax identity fields the center changed (for a Super Admin alert).
function sensitiveChanges(before, after) {
  return SENSITIVE_FIELDS.filter((k) => !same((before || {})[k], (after || {})[k]));
}

module.exports = { guardDocuments, sensitiveChanges, SENSITIVE_FIELDS };
