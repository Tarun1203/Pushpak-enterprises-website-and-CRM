// Technician matching: capability + availability + workload.
// Plain-JS UMD so the SAME file runs in Cloud Functions (require) and in
// the Service Center / Super Admin pages (<script src="technicianMatch.js">,
// exposed as window.TechnicianMatch). crm/technicianMatch.js must stay an
// exact copy of functions/technicianMatch.js; technicianMatch.test.js
// fails when they differ.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TechnicianMatch = factory();
}(typeof self !== 'undefined' ? self : this, function () {

  // Roster employment states that can never take new work.
  var BLOCKED_EMPLOYMENT = ['SUSPENDED', 'TERMINATED', 'RESIGNED', 'ON_LEAVE'];
  // Self-reported availability that rules a technician out right now.
  var BLOCKED_AVAILABILITY = ['leave', 'holiday'];
  // Availability states that are allowed but flagged.
  var BUSY_AVAILABILITY = ['on_the_way', 'at_customer', 'in_progress'];
  var AWAY_AVAILABILITY = ['break', 'offline'];

  function lc(v) { return String(v == null ? '' : v).trim().toLowerCase(); }

  function contractExpired(user, today) {
    return !!user && user.accountType === 'temporary' && !!user.contractEndDate && user.contractEndDate < today;
  }

  // Only APPROVED leave blocks (same rule as appointment.js); `date` is the
  // appointment date when known, else today.
  function onApprovedLeave(records, date) {
    return !!date && (records || []).some(function (l) {
      return l && l.status === 'APPROVED' && l.startDate && l.endDate && l.startDate <= date && date <= l.endDate;
    });
  }

  // Which brands / categories a technician has declared, from the linked
  // account (brandsAuthorized, skills[{category}]) and the roster record
  // (productCapabilities[{brand, category}]).
  function declared(rosterEntry, user) {
    var brands = {}; var categories = {};
    ((user && user.brandsAuthorized) || []).forEach(function (b) { brands[lc(b)] = true; });
    (user && Array.isArray(user.skills) ? user.skills : []).forEach(function (s) { if (s && s.category) categories[lc(s.category)] = true; });
    ((rosterEntry && rosterEntry.productCapabilities) || []).forEach(function (c) {
      if (c && c.brand) brands[lc(c.brand)] = true;
      if (c && c.category) categories[lc(c.category)] = true;
    });
    return { brands: brands, categories: categories };
  }

  // ticket: { brand, brandId, category }
  // roster: [{ id, name, technicianUid, employmentStatus, productCapabilities }]
  // users / avail / openCounts: maps keyed by technician uid.
  function rankTechnicians(args) {
    var ticket = args.ticket || {};
    var users = args.users || {}; var avail = args.avail || {}; var counts = args.openCounts || {};
    var today = args.today;
    var brand = lc(ticket.brandId || ticket.brand);
    var category = lc(ticket.category);

    var out = (args.roster || []).map(function (r) {
      var uid = r.technicianUid || '';
      var user = uid ? users[uid] : null;
      var av = uid ? avail[uid] : null;
      var open = uid ? (counts[uid] || 0) : 0;
      var warnings = [];
      var excluded = null;

      if (BLOCKED_EMPLOYMENT.indexOf(r.employmentStatus) !== -1) excluded = 'employment: ' + String(r.employmentStatus).toLowerCase().replace('_', ' ');
      else if (av && av.suspended === true) excluded = 'suspended';
      else if (contractExpired(user, today)) excluded = 'contract expired';
      else if (av && BLOCKED_AVAILABILITY.indexOf(av.status) !== -1) excluded = av.status === 'holiday' ? 'on holiday' : 'on leave';
      else if (onApprovedLeave(r.leaveRecords, args.date || today)) excluded = 'on approved leave';

      var d = declared(r, user);
      var hasBrands = Object.keys(d.brands).length > 0;
      var hasCategories = Object.keys(d.categories).length > 0;
      var brandMatch = null; var categoryMatch = null;

      if (!uid) warnings.push('no linked account, capability unknown');
      if (brand) {
        if (hasBrands) {
          brandMatch = !!d.brands[brand];
          if (!brandMatch && !excluded) excluded = 'not authorized for this brand';
        } else if (uid) warnings.push('no brand authorization on file');
      }
      if (category) {
        if (hasCategories) {
          categoryMatch = !!d.categories[category];
          if (!categoryMatch) warnings.push('no skill listed for this category');
        } else if (uid) warnings.push('no skills on file');
      }
      if (av && BUSY_AVAILABILITY.indexOf(av.status) !== -1) warnings.push('busy now');
      if (av && AWAY_AVAILABILITY.indexOf(av.status) !== -1) warnings.push(av.status === 'break' ? 'on a break' : 'offline');

      var score = 0;
      if (av && av.status === 'available') score += 30;
      if (brandMatch) score += 20;
      if (categoryMatch) score += 20;
      if (r.productCapabilities && r.productCapabilities.some(function (c) { return c && c.certified && lc(c.brand) === brand; })) score += 5;
      if (av && BUSY_AVAILABILITY.indexOf(av.status) !== -1) score -= 10;
      if (av && AWAY_AVAILABILITY.indexOf(av.status) !== -1) score -= 15;
      score -= 2 * open;

      return {
        rosterId: r.id, name: r.name || '', uid: uid, eligible: !excluded, excludedReason: excluded,
        warnings: warnings, score: score, openJobs: open, availability: av ? (av.status || null) : null
      };
    });

    out.sort(function (a, b) {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      if (b.score !== a.score) return b.score - a.score;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
    return out;
  }

  return { rankTechnicians: rankTechnicians, BLOCKED_EMPLOYMENT: BLOCKED_EMPLOYMENT };
}));
