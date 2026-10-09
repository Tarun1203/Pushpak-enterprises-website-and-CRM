// Who may still use the system (pure, unit-testable). An account is switched
// off when Head Office disables it, when a technician's employment status is
// Suspended / Terminated / Resigned on ANY roster entry, or when a service
// center's profile is Inactive. The result is stored on the user's own record
// (users/{uid}.accessDisabled), which the Firestore and Storage rules read.
const BLOCKED_EMPLOYMENT = ['SUSPENDED', 'TERMINATED', 'RESIGNED'];
const BLOCKED_CENTER = ['INACTIVE'];

function accessDecision({ disabledByAdmin, employmentStatuses, centerStatus }) {
  if (disabledByAdmin === true) return { disabled: true, reason: 'disabled by Head Office' };
  const bad = (employmentStatuses || []).find((s) => BLOCKED_EMPLOYMENT.includes(String(s || '').toUpperCase()));
  if (bad) return { disabled: true, reason: 'employment status ' + String(bad).toLowerCase() };
  if (BLOCKED_CENTER.includes(String(centerStatus || '').toUpperCase())) return { disabled: true, reason: 'service center is inactive' };
  return { disabled: false, reason: null };
}

module.exports = { accessDecision, BLOCKED_EMPLOYMENT, BLOCKED_CENTER };
