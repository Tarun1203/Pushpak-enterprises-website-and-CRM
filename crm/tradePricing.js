// Dealer / distributor order pricing (UMD: used by Cloud Functions and,
// for the on-screen estimate only, by the CRM pages as window.TradePricing).
//
// Prices are private, per account, and set by whoever sells:
//   seller 'company'        — Super Admin's price list, for direct dealers
//                             and for distributors
//   seller <distributorUid> — a distributor's own prices for its dealers
// A price doc is priceLists/<seller>_<buyer>_<modelId>, where buyer is
// either one account's uid or that seller's standard ("default") price:
//   'default-dealer' / 'default-distributor' (company), 'default' (distributor).
// Prices exclude GST; each model carries its own gstRate (%).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TradePricing = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  var MAX_LINES = 50;
  var MAX_QTY = 100000;
  var GST_RATES = [0, 3, 5, 12, 18, 28];

  // placed -> confirmed (approved) -> dispatched -> delivered; the seller
  // may reject or cancel before dispatch, the buyer may cancel while placed.
  var SELLER_NEXT = { placed: ['confirmed', 'rejected', 'cancelled'], confirmed: ['dispatched', 'cancelled'], dispatched: ['delivered'] };
  var BUYER_NEXT = { placed: ['cancelled'] };
  var STATUS_LABELS = { placed: 'Awaiting approval', confirmed: 'Approved', dispatched: 'Dispatched', delivered: 'Delivered', rejected: 'Rejected', cancelled: 'Cancelled' };

  function priceDocId(seller, buyer, modelId) { return seller + '_' + buyer + '_' + modelId; }

  // Who sells this order, who buys it, and which standard price applies.
  function partiesFor(collectionName, order) {
    if (collectionName === 'distributorOrders') {
      return { seller: 'company', buyer: order.distributorUid, defaultKey: 'default-distributor' };
    }
    var dist = order.distributorUid || '';
    return dist
      ? { seller: dist, buyer: order.dealerUid, defaultKey: 'default' }
      : { seller: 'company', buyer: order.dealerUid, defaultKey: 'default-dealer' };
  }

  function validateLines(lines) {
    if (!Array.isArray(lines) || !lines.length) return 'The order has no lines.';
    if (lines.length > MAX_LINES) return 'An order can have at most ' + MAX_LINES + ' lines.';
    var seen = {};
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i] || {};
      if (typeof l.modelId !== 'string' || !l.modelId) return 'Line ' + (i + 1) + ' has no product.';
      if (!Number.isInteger(l.qty) || l.qty < 1 || l.qty > MAX_QTY) return 'Line ' + (i + 1) + ' has an invalid quantity.';
      if (seen[l.modelId]) return 'The same product appears on two lines.';
      seen[l.modelId] = true;
    }
    return null;
  }

  var toPaise = function (rupees) { return Math.round(Number(rupees) * 100); };
  var toRupees = function (paise) { return Math.round(paise) / 100; };

  // models: { modelId: { label, gstRate, status } }
  // prices: { priceDocId: number }  (only the docs that exist)
  function priceOrder(lines, models, prices, parties) {
    var invalid = validateLines(lines);
    if (invalid) return { pricedLines: [], totals: null, pricing: { status: 'invalid', issues: [invalid] } };
    var issues = [];
    var taxable = 0, gst = 0;
    var pricedLines = lines.map(function (l) {
      var m = models[l.modelId];
      var line = { modelId: l.modelId, qty: l.qty, label: m ? m.label : l.modelId, unitPrice: null, gstRate: null, taxable: null, gst: null, total: null };
      if (!m) { issues.push(line.label + ': product not found'); return line; }
      if (m.status && m.status !== 'active') issues.push(line.label + ': product is inactive');
      var own = prices[priceDocId(parties.seller, parties.buyer, l.modelId)];
      var std = prices[priceDocId(parties.seller, parties.defaultKey, l.modelId)];
      var unit = typeof own === 'number' ? own : (typeof std === 'number' ? std : null);
      if (unit === null) { issues.push(line.label + ': no price set'); return line; }
      if (GST_RATES.indexOf(m.gstRate) === -1) { issues.push(line.label + ': no GST rate set'); line.unitPrice = unit; return line; }
      var linePaise = toPaise(unit) * l.qty;
      var gstPaise = Math.round(linePaise * m.gstRate / 100);
      taxable += linePaise; gst += gstPaise;
      line.unitPrice = unit; line.gstRate = m.gstRate;
      line.taxable = toRupees(linePaise); line.gst = toRupees(gstPaise); line.total = toRupees(linePaise + gstPaise);
      line.priceSource = typeof own === 'number' ? 'account' : 'standard';
      return line;
    });
    var totals = issues.length ? null : { taxable: toRupees(taxable), gst: toRupees(gst), total: toRupees(taxable + gst) };
    return { pricedLines: pricedLines, totals: totals, pricing: { status: issues.length ? 'incomplete' : 'ok', issues: issues } };
  }

  function formatINR(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  return {
    MAX_LINES: MAX_LINES, MAX_QTY: MAX_QTY, GST_RATES: GST_RATES,
    SELLER_NEXT: SELLER_NEXT, BUYER_NEXT: BUYER_NEXT, STATUS_LABELS: STATUS_LABELS,
    priceDocId: priceDocId, partiesFor: partiesFor, validateLines: validateLines,
    priceOrder: priceOrder, formatINR: formatINR
  };
}));
