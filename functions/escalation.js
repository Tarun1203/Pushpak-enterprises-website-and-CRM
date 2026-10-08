// Exception & escalation rules (pure, unit-testable). A scheduled sweep asks
// "what has been stuck too long?" and tells the people who can act, once.
const HOUR = 3600000;
const LIMITS = { unroutedHours: 4, unassignedHours: 24, waitingSpareDays: 7 };
const OPEN_BEFORE_VISIT = ['assigned', 'accepted', 'on_the_way'];

const ms = (t) => (t && t.toMillis ? t.toMillis() : typeof t === 'number' ? t : 0);
const label = (d) => d.requestId || d.jobId || 'a ticket';

// Public booking nobody covers (or routing could not decide) and still waiting.
function unrouted(pub, nowMs) {
  if (!pub || pub.status !== 'new' || !pub.routing || pub.routing.status !== 'manual' || pub.escalation && pub.escalation.unrouted) return null;
  const since = ms(pub.routing.at) || ms(pub.createdAt);
  if (!since || nowMs - since < LIMITS.unroutedHours * HOUR) return null;
  return { code: 'unrouted', title: 'Service request needs routing', message: `${label(pub)} has had no service center for ${LIMITS.unroutedHours}+ hours (${String(pub.routing.reason || 'no match').replace(/_/g, ' ')}).`, targets: [{ recipientType: 'role', recipientValue: 'superadmin' }] };
}

// At a center, no technician for a day.
function unassigned(t, nowMs) {
  if (!t || t.status !== 'new' || t.technicianUid || t.escalation && t.escalation.unassigned) return null;
  const since = ms(t.createdAt);
  if (!since || nowMs - since < LIMITS.unassignedHours * HOUR) return null;
  const targets = [{ recipientType: 'role', recipientValue: 'superadmin' }];
  if (t.serviceCenterUid) targets.push({ recipientType: 'uid', recipientValue: t.serviceCenterUid });
  return { code: 'unassigned', title: 'Ticket has no technician', message: `${label(t)} has been waiting for a technician for ${LIMITS.unassignedHours}+ hours.`, targets };
}

// The appointment day has passed and the visit never started.
function missedAppointment(t, today) {
  if (!t || !OPEN_BEFORE_VISIT.includes(t.status) || !t.scheduledDate || t.scheduledDate >= today) return null;
  if (t.appointmentMissed && t.appointmentMissed.date === t.scheduledDate) return null;
  const targets = [];
  if (t.serviceCenterUid) targets.push({ recipientType: 'uid', recipientValue: t.serviceCenterUid });
  if (t.technicianUid) targets.push({ recipientType: 'uid', recipientValue: t.technicianUid });
  if (!targets.length) targets.push({ recipientType: 'role', recipientValue: 'superadmin' });
  return { code: 'missed', title: 'Appointment missed', message: `${label(t)} was due on ${t.scheduledDate} and has not started. Reschedule it.`, targets, update: { appointmentMissed: { date: t.scheduledDate } } };
}

// Waiting for a spare for too long: Warehouse should chase it.
function stuckOnSpare(t, nowMs) {
  if (!t || t.status !== 'waiting_spare' || t.escalation && t.escalation.spare) return null;
  const since = ms(t.updatedAt);
  if (!since || nowMs - since < LIMITS.waitingSpareDays * 24 * HOUR) return null;
  return { code: 'spare', title: 'Job waiting for a spare', message: `${label(t)} has been waiting for a spare part for ${LIMITS.waitingSpareDays}+ days.`, targets: [{ recipientType: 'role', recipientValue: 'warehouse' }, { recipientType: 'role', recipientValue: 'superadmin' }] };
}

module.exports = { LIMITS, unrouted, unassigned, missedAppointment, stuckOnSpare };
