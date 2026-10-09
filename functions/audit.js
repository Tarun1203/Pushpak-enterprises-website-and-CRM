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

// Business records: who created them and who moved them to each new status
// (accepted, assigned, approved, dispatched, received, closed, rejected ...).
const WORKFLOW = {
  serviceJobs: { entityType: 'serviceJob', fields: ['status', 'technicianUid', 'serviceCenterUid'], label: (d) => d.jobId || d.requestId || '' },
  centerRequests: { entityType: 'centerRequest', fields: ['status', 'technicianUid'], label: (d) => d.requestId || '' },
  spareRequests: { entityType: 'spareRequest', fields: ['status'], label: (d) => d.requestId || '' },
  claims: { entityType: 'claim', fields: ['status', 'approvedAmount'], label: (d) => d.claimId || '' },
  rmaRequests: { entityType: 'rma', fields: ['status'], label: (d) => d.rmaId || d.requestId || '' },
  brandReturns: { entityType: 'brandReturn', fields: ['status'], label: (d) => d.returnId || '' },
  returns: { entityType: 'return', fields: ['status'], label: (d) => d.returnId || '' },
  dealerOrders: { entityType: 'order', fields: ['status'], label: (d) => d.orderId || '' },
  distributorOrders: { entityType: 'order', fields: ['status'], label: (d) => d.orderId || '' },
  invoices: { entityType: 'invoice', fields: ['status'], label: (d) => d.invoiceNo || d.invoiceId || '' },
  tradePayments: { entityType: 'payment', fields: ['status'], label: (d) => d.paymentId || '' },
  stockReceipts: { entityType: 'stockReceipt', fields: ['status'], label: (d) => d.receiptId || '' },
  changeRequests: { entityType: 'changeRequest', fields: ['status'], label: (d) => d.requestId || '' }
};
Object.keys(WORKFLOW).forEach((k) => { WATCHED[k] = WORKFLOW[k]; WATCHED[k].workflow = true; });

function buildAuditEntries(coll, docId, before, after) {
  const cfg = WATCHED[coll];
  if (!cfg) return [];
  const b = before || null;
  const a = after || null;
  const entries = [];
  const base = { entityType: cfg.entityType, entityId: docId, source: 'server' };

  if (!b && a) {
    if (cfg.workflow) {
      entries.push({ ...base, action: 'created', details: `${cfg.entityType} ${cfg.label(a)} created` + (a.status ? ` (status "${a.status}")` : ''), after: { status: a.status === undefined ? null : a.status } });
    } else if (coll === 'users') {
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
      action: f === 'role' ? 'role_changed' : f === 'status' && cfg.workflow ? 'status_changed' : f === 'status' || f === 'employmentStatus' ? 'status_changed' : 'field_changed',
      details: `${cfg.entityType} ${cfg.label(a)}: ${f} changed from "${was}" to "${now}"`,
      before: { [f]: was }, after: { [f]: now }
    });
  }
  return entries;
}

module.exports = { buildAuditEntries, WATCHED, WORKFLOW };
