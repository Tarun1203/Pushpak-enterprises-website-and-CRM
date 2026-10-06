// Trade finance helpers (UMD: Cloud Functions + window.TradeFinance in the
// CRM pages, where it is only used for display and messages).
// Money is handled in paise (integers) internally to avoid rounding drift.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TradeFinance = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  var DEFAULT_TERMS_DAYS = 30;
  var IST_OFFSET_MS = 330 * 60 * 1000;

  var toPaise = function (r) { return Math.round(Number(r || 0) * 100); };
  var toRupees = function (p) { return Math.round(p) / 100; };

  // Indian financial year (April–March) of a date, in IST: '2026-27'.
  function fiscalYear(date) {
    var d = new Date(date.getTime() + IST_OFFSET_MS);
    var y = d.getUTCFullYear();
    var start = d.getUTCMonth() >= 3 ? y : y - 1;
    return start + '-' + String((start + 1) % 100).padStart(2, '0');
  }

  function invoiceNumber(prefix, fy, seq) {
    return (prefix || 'PE') + '/' + fy + '/' + String(seq).padStart(5, '0');
  }

  // First two digits of a 15-character GSTIN are the state code.
  function stateCodeFromGstin(gstin) {
    var g = String(gstin || '').trim().toUpperCase();
    return /^[0-9]{2}[A-Z0-9]{13}$/.test(g) ? g.slice(0, 2) : null;
  }

  // Splits each priced line's GST into CGST+SGST (same state) or IGST
  // (different state). Unknown buyer state is treated as same-state and
  // flagged, so someone can check it.
  function splitGst(pricedLines, sellerState, buyerState) {
    var interState = !!(buyerState && sellerState && buyerState !== sellerState);
    var t = { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    var lines = (pricedLines || []).map(function (l) {
      var taxable = toPaise(l.taxable), gst = toPaise(l.gst);
      var cgst = 0, sgst = 0, igst = 0;
      if (interState) igst = gst; else { cgst = Math.round(gst / 2); sgst = gst - cgst; }
      t.taxable += taxable; t.cgst += cgst; t.sgst += sgst; t.igst += igst;
      return {
        modelId: l.modelId, label: l.label, hsn: l.hsn || '', qty: l.qty, unitPrice: l.unitPrice, gstRate: l.gstRate,
        taxable: toRupees(taxable), cgst: toRupees(cgst), sgst: toRupees(sgst), igst: toRupees(igst), total: toRupees(taxable + gst)
      };
    });
    return {
      lines: lines, interState: interState, buyerStateKnown: !!buyerState,
      totals: { taxable: toRupees(t.taxable), cgst: toRupees(t.cgst), sgst: toRupees(t.sgst), igst: toRupees(t.igst), total: toRupees(t.taxable + t.cgst + t.sgst + t.igst) }
    };
  }

  function addDays(date, days) { return new Date(date.getTime() + days * 86400000); }

  // Applies a payment to the oldest unpaid invoices first.
  // invoices: [{ id, balance }] already sorted oldest first.
  function allocatePayment(amount, invoices) {
    var left = toPaise(amount);
    var allocations = [];
    (invoices || []).forEach(function (inv) {
      if (left <= 0) return;
      var bal = toPaise(inv.balance);
      if (bal <= 0) return;
      var take = Math.min(bal, left);
      allocations.push({ invoiceId: inv.id, amount: toRupees(take) });
      left -= take;
    });
    return { allocations: allocations, unallocated: toRupees(left) };
  }

  // The same test firestore.rules applies before an order can be approved.
  // account: { creditLimit, outstanding, oldestUnpaidDue (Date|null) }
  function creditCheck(account, orderTotal, now) {
    var a = account || {};
    var reasons = [];
    var limit = typeof a.creditLimit === 'number' ? a.creditLimit : 0;
    var outstanding = typeof a.outstanding === 'number' ? a.outstanding : 0;
    var after = toRupees(toPaise(outstanding) + toPaise(orderTotal));
    if (after > limit) reasons.push('Over credit limit: owes ' + outstanding.toFixed(2) + ', this order makes it ' + after.toFixed(2) + ', limit ' + limit.toFixed(2));
    if (a.oldestUnpaidDue && a.oldestUnpaidDue.getTime() <= now.getTime()) reasons.push('Has an overdue invoice (due ' + a.oldestUnpaidDue.toISOString().slice(0, 10) + ')');
    return { ok: !reasons.length, reasons: reasons, available: toRupees(toPaise(limit) - toPaise(outstanding)) };
  }

  // Outstanding split by days past due: not due, 1-30, 31-60, 61-90, 90+.
  function agingBuckets(invoices, now) {
    var b = { notDue: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
    (invoices || []).forEach(function (inv) {
      var bal = toPaise(inv.balance);
      if (bal <= 0 || inv.status === 'cancelled') return;
      var days = Math.floor((now.getTime() - inv.dueDate.getTime()) / 86400000);
      var k = days <= 0 ? 'notDue' : days <= 30 ? 'd1_30' : days <= 60 ? 'd31_60' : days <= 90 ? 'd61_90' : 'd90plus';
      b[k] += bal;
    });
    Object.keys(b).forEach(function (k) { b[k] = toRupees(b[k]); });
    return b;
  }

  return {
    DEFAULT_TERMS_DAYS: DEFAULT_TERMS_DAYS, toPaise: toPaise, toRupees: toRupees,
    fiscalYear: fiscalYear, invoiceNumber: invoiceNumber, stateCodeFromGstin: stateCodeFromGstin,
    splitGst: splitGst, addDays: addDays, allocatePayment: allocatePayment,
    creditCheck: creditCheck, agingBuckets: agingBuckets
  };
}));
