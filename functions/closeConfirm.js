// Customer confirmation when a job is closed (pure, unit-tested).
// Two ways: a one-time code the customer receives (SMS / WhatsApp when
// messaging is switched on, and always in the customer's own My Service
// portal), or the customer's signature on the technician's screen.
// The technician's "completed" write carries `closeOtp` or
// `customerSignature`; the checkLifecycle_* trigger checks it here. When
// Head Office has made confirmation required (settings/closeConfirmation),
// a completion without a valid one is reverted.
const crypto = require('crypto');

const CODE_TTL_MS = 24 * 3600 * 1000;
const MAX_TRIES = 5;

function newCode() {
  return String(crypto.randomInt(0, 10000)).padStart(4, '0');
}
const codeDocId = (coll, id) => `${coll}__${id}`;
const signaturePrefix = (coll, id) => `closeSignatures/${coll}/${id}/`;

// Who may ask for a code / close: the ticket's technician or service center.
function canClose(ticket, uid) {
  return !!uid && !!ticket && (ticket.technicianUid === uid || ticket.serviceCenterUid === uid);
}

// Decides a completion.
//   required: Head Office requires confirmation
//   after:    the ticket as written (with closeOtp / customerSignature)
//   codeDoc:  closeCodes/{coll}__{id} data or null
//   signatureOk: whether the signature file exists under the ticket's folder
// Returns { reason } to revert, or { record, codeUpdate } to accept
// (record is null when nothing was offered and nothing is required).
function decide({ required, coll, id, after, codeDoc, signatureOk, now = Date.now() }) {
  const otp = typeof after.closeOtp === 'string' ? after.closeOtp.trim() : '';
  const sig = after.customerSignature && typeof after.customerSignature === 'object' ? after.customerSignature : null;
  if (otp) {
    if (!codeDoc || !codeDoc.code) return { reason: 'No completion code was sent for this job. Send a code to the customer first, or take their signature.' };
    if (codeDoc.usedAt) return { reason: 'That completion code was already used. Send a new code.' };
    if ((codeDoc.tries || 0) >= MAX_TRIES) return { reason: 'Too many wrong codes. Send a new code to the customer.' };
    if (codeDoc.expiresAtMs && now > codeDoc.expiresAtMs) return { reason: 'The completion code has expired. Send a new code.' };
    if (otp !== codeDoc.code) return { reason: 'The completion code is wrong. Ask the customer for the code again.', codeUpdate: { tries: (codeDoc.tries || 0) + 1 } };
    return { record: { method: 'code', sentVia: codeDoc.sentVia || 'portal' }, codeUpdate: { usedAt: now } };
  }
  if (sig) {
    const path = typeof sig.path === 'string' ? sig.path : '';
    const name = typeof sig.name === 'string' ? sig.name.trim().slice(0, 100) : '';
    if (!path.startsWith(signaturePrefix(coll, id)) || path.includes('..')) return { reason: 'The signature is not attached to this job. Take the signature again.' };
    if (!name) return { reason: 'Type the name of the person who signed.' };
    if (!signatureOk) return { reason: 'The signature image did not upload. Check the connection and take the signature again.' };
    return { record: { method: 'signature', signedName: name, path } };
  }
  if (required) return { reason: 'Closing needs the customer\'s confirmation: the completion code or their signature.' };
  return { record: null };
}

module.exports = { newCode, codeDocId, signaturePrefix, canClose, decide, CODE_TTL_MS, MAX_TRIES };
