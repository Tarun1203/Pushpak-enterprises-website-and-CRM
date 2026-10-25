// Which district a ticket belongs to (pure, unit-testable). Area Managers see
// and act on tickets by district, so every ticket carries `district`:
// the pincode master's district for the ticket's pincode first, else the
// district on the handling service center's profile, else none.
function districtFor(ticket, pinData, centerProfile) {
  if (ticket && typeof ticket.district === 'string' && ticket.district.trim()) return ticket.district.trim();
  const fromPin = pinData && pinData.active !== false && typeof pinData.district === 'string' ? pinData.district.trim() : '';
  if (fromPin) return fromPin;
  const fromCenter = centerProfile && typeof centerProfile.district === 'string' ? centerProfile.district.trim() : '';
  return fromCenter || null;
}
module.exports = { districtFor };
