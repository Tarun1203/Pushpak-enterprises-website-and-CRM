// Pure helpers: turn a before/after pair of a sensitive document into
// zero or more audit entries. Kept free of Firebase imports so it is
// unit-testable. The triggers in index.js supply the caller identity
// from the Firestore auth context, which clients cannot forge.

const WATCHED = {
  users: {
    entityType: 'user',
    fields: ['role', 'status', 'disabled', 'active'],
    label: (d) => d.email || ''
  },
  serviceCenterProfiles: {
    entityType: 'serviceCenter',
    fields: ['status'],
    label: (d) => d.serviceCenterCode || d.centerName || ''
  },
  centerTechnicians: {
    entityType: 'technician',
    fields: ['employmentStatus'],
    label: (d) => d.technicianCode || d.name || ''
  }
};

function buildAuditEntries(coll, docId, before, after) {
  const cfg = WATCHED[coll];
  if (!cfg) return [];
  const b = before || null;
  const a = after || null;
  const entries = [];
  const base = { entityType: cfg.entityType, entityId: docId, source: 'server' };

  if (!b && a) {
    if (coll === 'users') {
      entries.push({ ...base, action: 'created',
        details: `Account created for ${cfg.label(a)} with role "${a.role || ''}"`, after: { role: a.role || null } });
    }
    return entries;
  }
  if (b && !a) {
    entries.push({ ...base, action: 'deleted', details: `${cfg.entityType} ${cfg.label(b)} deleted` });
    return entries;
  }
  if (!b || !a) return entries;

  for (const f of cfg.fields) {
    const was = b[f] === undefined ? null : b[f];
    const now = a[f] === undefined ? null : a[f];
    if (JSON.stringify(was) === JSON.stringify(now)) continue;
    entries.push({
      ...base,
      action: f === 'role' ? 'role_changed' : 'status_changed',
      details: `${cfg.entityType} ${cfg.label(a)}: ${f} changed from "${was}" to "${now}"`,
      before: { [f]: was }, after: { [f]: now }
    });
  }
  return entries;
}

module.exports = { buildAuditEntries, WATCHED };
