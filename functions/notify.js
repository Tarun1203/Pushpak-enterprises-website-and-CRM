// Who must be told when a job, spare request or claim moves. Pure: returns
// notifications to write; the trigger in index.js writes them (one fixed id
// per event, so a retried trigger never duplicates). Existing client-written
// alerts (new request routed, claim submitted, claim paid/rejected, low
// stock) stay as they are; this fills the gaps.
const label = (d) => d.jobId || d.requestId || d.claimId || '';
const who = (d) => d.customerName || 'a customer';
const JOB_COLLS = ['serviceJobs', 'centerRequests'];

function buildNotifications(coll, docId, before, after, actorUid) {
  const b = before || {}, a = after || {}, out = [];
  const add = (key, uid, title, message) => { if (uid && uid !== actorUid) out.push({ key: `wf_${coll}_${docId}_${key}`.replace(/[^A-Za-z0-9_-]/g, '_'), uid, title, message }); };

  if (JOB_COLLS.includes(coll)) {
    const slot = (d) => `${d.scheduledDate || ''}|${d.scheduledStartTime || ''}|${d.scheduledEndTime || ''}`;
    // The service center picked the technician: tell the technician.
    if (a.technicianUid && a.technicianUid !== b.technicianUid && actorUid && actorUid === a.serviceCenterUid) {
      add(`assigned_${a.technicianUid}`, a.technicianUid, 'New job assigned', `${label(a)} for ${who(a)}${a.product ? ' - ' + a.product : ''}`);
    }
    // Appointment set or changed: tell the technician and the center.
    if (a.scheduledDate && slot(a) !== slot(b)) {
      const when = `${a.scheduledDate}${a.scheduledStartTime ? ' ' + a.scheduledStartTime : ''}`;
      const key = `appt_${slot(a)}`;
      add(key + '_t', a.technicianUid, 'Appointment', `${label(a)}: ${when} with ${who(a)}`);
      add(key + '_c', a.serviceCenterUid, 'Appointment', `${label(a)}: ${when}${a.technicianName ? ' (' + a.technicianName + ')' : ''}`);
    }
    // Work finished: the center must verify and close.
    if (a.status !== b.status && ['completed', 'verification'].includes(a.status)) {
      add(`done_${a.status}`, a.serviceCenterUid, a.status === 'verification' ? 'Job ready to verify' : 'Job completed', `${label(a)} for ${who(a)}${a.technicianName ? ' by ' + a.technicianName : ''}`);
    }
  }
  if (coll === 'spareRequests' && a.status !== b.status && a.requestedByUid) {
    const T = { approved: 'Spare request approved', rejected: 'Spare request rejected', dispatched: 'Spare dispatched', intransit: 'Spare in transit', received: 'Spare received' };
    if (T[a.status]) add(`st_${a.status}`, a.requestedByUid, T[a.status], `${a.requestId || docId}: ${a.item || ''}${a.quantity ? ' x ' + a.quantity : ''}${a.status === 'rejected' && a.rejectReason ? ' - ' + a.rejectReason : ''}`);
  }
  if (coll === 'claims' && a.status !== b.status && a.status === 'approved' && a.claimantUid) {
    add('st_approved', a.claimantUid, 'Claim approved', `${a.claimId || docId}: ${a.approvedAmount != null ? '₹' + a.approvedAmount + ' approved' : 'approved'}`);
  }
  return out;
}
module.exports = { buildNotifications, WATCHED: ['serviceJobs', 'centerRequests', 'spareRequests', 'claims'] };
