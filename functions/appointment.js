// Appointment rules shared by Cloud Functions and the dashboards.
// Plain-JS UMD; crm/appointment.js must stay an exact copy of
// functions/appointment.js (appointment.test.js fails when they differ).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Appointment = factory();
}(typeof self !== 'undefined' ? self : this, function () {

  var WORK_START = '08:00';
  var WORK_END = '20:00';
  var MIN_MINUTES = 30;
  var MAX_MINUTES = 480;
  // Tickets in these states no longer occupy the technician's time.
  var FREE_STATUSES = ['cancelled', 'closed', 'completed', 'verification'];
  var IST_OFFSET_MS = 330 * 60000;

  function todayIST(nowMs) { return new Date(nowMs + IST_OFFSET_MS).toISOString().slice(0, 10); }
  function toMin(t) { var m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(t || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; }
  function toHHMM(min) { return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0'); }
  function validDate(d) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '')) return false;
    var t = new Date(d + 'T00:00:00Z');
    // JavaScript rolls 30 Feb over to 2 Mar; a real date reads back unchanged.
    return !isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
  }

  // Returns an error message, or null when the slot is acceptable.
  // A date with no times is a legacy "date only" booking: only the date is checked.
  function validateSlot(slot, nowMs) {
    var date = slot.date, start = slot.start, end = slot.end;
    if (!date) return (start || end) ? 'Pick a date for this appointment.' : null;
    if (!validDate(date)) return 'The appointment date is not valid.';
    if (date < todayIST(nowMs)) return 'The appointment date is in the past.';
    if (!start && !end) return null;
    var s = toMin(start), e = toMin(end);
    if (s === null || e === null) return 'Enter both a start and end time.';
    if (e <= s) return 'End time must be after start time.';
    if (s < toMin(WORK_START) || e > toMin(WORK_END)) return 'Appointments must fall between ' + WORK_START + ' and ' + WORK_END + '.';
    if (e - s < MIN_MINUTES) return 'An appointment must be at least ' + MIN_MINUTES + ' minutes.';
    if (e - s > MAX_MINUTES) return 'An appointment can be at most ' + (MAX_MINUTES / 60) + ' hours.';
    if (date === todayIST(nowMs) && s <= toMin(new Date(nowMs + IST_OFFSET_MS).toISOString().slice(11, 16))) return 'That start time has already passed today.';
    return null;
  }

  // leaveRecords: centerTechnicians.leaveRecords. Only APPROVED leave blocks.
  function onApprovedLeave(leaveRecords, date) {
    return (leaveRecords || []).some(function (l) {
      return l && l.status === 'APPROVED' && l.startDate && l.endDate && l.startDate <= date && date <= l.endDate;
    });
  }

  // others: [{ label, status, date, start, end }] for the same technician.
  // Returns the first overlapping booking or null. Date-only and
  // inactive bookings never conflict.
  function findConflict(slot, others) {
    var s = toMin(slot.start), e = toMin(slot.end);
    if (s === null || e === null) return null;
    for (var i = 0; i < (others || []).length; i++) {
      var o = others[i];
      if (!o || o.date !== slot.date || FREE_STATUSES.indexOf(o.status) !== -1) continue;
      var os = toMin(o.start), oe = toMin(o.end);
      if (os === null || oe === null) continue;
      if (s < oe && e > os) return o;
    }
    return null;
  }

  // Free start times (on the hour or half hour) for a duration, given busy bookings.
  function suggestSlots(date, durationMin, others, nowMs, limit) {
    var out = []; var step = 30; var dur = Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, durationMin || 60));
    for (var m = toMin(WORK_START); m + dur <= toMin(WORK_END) && out.length < (limit || 6); m += step) {
      var slot = { date: date, start: toHHMM(m), end: toHHMM(m + dur) };
      if (!validateSlot(slot, nowMs) && !findConflict(slot, others)) out.push(slot);
    }
    return out;
  }

  return {
    WORK_START: WORK_START, WORK_END: WORK_END, FREE_STATUSES: FREE_STATUSES,
    todayIST: todayIST, validateSlot: validateSlot, onApprovedLeave: onApprovedLeave,
    findConflict: findConflict, suggestSlots: suggestSlots
  };
}));
