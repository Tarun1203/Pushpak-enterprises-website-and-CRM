// Business numbers issued by the server (issueNumber callable): service
// center requests, technician jobs, claims and spare requests. The server
// bumps the same monthly counter the browsers used, so the sequence carries
// on unbroken and a page that still falls back to its own counter can't
// collide. Pure parts unit-tested.
const KINDS = { centerrequest: 'CR', servicejob: 'JOB', claim: 'CL', sparerequest: 'SR' };
const SUFFIX = { servicecenter: 'ServiceCenter', technician: 'Technician', superadmin: 'SuperAdmin', warehouse: 'Warehouse' };
// Who may draw which number.
const ALLOWED = {
  centerrequest: ['servicecenter', 'superadmin', 'warehouse'],
  servicejob: ['technician', 'superadmin', 'warehouse'],
  claim: ['servicecenter', 'technician', 'superadmin', 'warehouse'],
  sparerequest: ['servicecenter', 'technician', 'superadmin', 'warehouse']
};
// India date parts (the business runs on IST).
function istParts(nowMs) {
  const d = new Date(nowMs + 330 * 60000).toISOString();
  return { ymd: d.slice(0, 10).replace(/-/g, ''), ym: d.slice(0, 7).replace('-', '') };
}
function counterId(kind, nowMs) { return `${kind}-${istParts(nowMs).ym}`; }
function format(kind, serial, role, nowMs) {
  return `PE-${KINDS[kind]}-${istParts(nowMs).ymd}-${String(serial).padStart(4, '0')}-${SUFFIX[role] || 'HO'}`;
}
module.exports = { KINDS, ALLOWED, SUFFIX, istParts, counterId, format };
