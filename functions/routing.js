// Pure routing helpers (no Firebase imports, unit-testable).
//
// Flow: pincode -> territory -> service center.
//   Tier 1  a center lists the request's exact pincode in pincodesCovered.
//   Tier 2  the pincode master (pincodes/{pin}) gives a district and exactly
//           one eligible center covers that district.
// Anything else is left for a person, with a reason recorded.

const BLOCKED_PROFILE_STATUSES = ['INACTIVE', 'PENDING_REVIEW'];

function isContractExpired(user, today) {
  return user.accountType === 'temporary' && !!user.contractEndDate && user.contractEndDate < today;
}

function lc(v) { return String(v || '').trim().toLowerCase(); }

// centers: [{ uid, name, email, pincodesCovered, districtsCovered,
//             brandsAuthorized, accountType, contractEndDate, profileStatus }]
// pin: pincodes/{pin} data or null.  today: 'YYYY-MM-DD'.
function findCandidates(ticket, centers, pin, today) {
  const pincode = String(ticket.pincode || '').trim();
  if (!pincode) return { method: null, candidates: [], reason: 'no_pincode' };
  const brandId = lc(ticket.brand);

  const usable = centers.filter((c) =>
    !isContractExpired(c, today) && !BLOCKED_PROFILE_STATUSES.includes(c.profileStatus));
  const brandOk = (c) => !brandId || (c.brandsAuthorized || []).map(lc).includes(brandId);

  const byPin = usable.filter((c) => (c.pincodesCovered || []).includes(pincode));
  const byPinBrand = byPin.filter(brandOk);
  if (byPinBrand.length) return { method: 'pincode', candidates: byPinBrand, reason: null };

  const district = lc(pin && pin.district);
  if (district && pin.active !== false) {
    const byDistrict = usable.filter((c) => (c.districtsCovered || []).map(lc).includes(district));
    const byDistrictBrand = byDistrict.filter(brandOk);
    if (byDistrictBrand.length === 1) return { method: 'district', candidates: byDistrictBrand, reason: null };
    if (byDistrictBrand.length > 1) return { method: null, candidates: byDistrictBrand, reason: 'multiple_district_candidates' };
    if (byPin.length || byDistrict.length) return { method: null, candidates: [], reason: 'brand_not_authorized' };
    return { method: null, candidates: [], reason: 'no_center_covers_district' };
  }
  if (byPin.length) return { method: null, candidates: [], reason: 'brand_not_authorized' };
  return { method: null, candidates: [], reason: pin ? 'no_center_covers_pincode' : 'pincode_not_in_master' };
}

// Least open tickets wins; uid breaks ties so the choice is stable.
function pickLeastLoaded(candidates, openCounts) {
  return [...candidates].sort((a, b) =>
    ((openCounts[a.uid] || 0) - (openCounts[b.uid] || 0)) || (a.uid < b.uid ? -1 : 1))[0];
}

module.exports = { findCandidates, pickLeastLoaded, isContractExpired, BLOCKED_PROFILE_STATUSES };
