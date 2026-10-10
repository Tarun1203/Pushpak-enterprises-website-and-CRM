/* Printable business documents (UMD: browser global PEDocs, or require()).
 * Warranty card, service voucher, claim voucher and dispatch challan, each in
 * A4 / A5 / A6 / thermal-slip (80 mm) page sizes, plus a short WhatsApp text.
 * Every value is HTML-escaped. Download makes a real PDF in the browser and
 * Print opens the print view, so nothing is sent to any server. The GST invoice has its own printer in
 * tradeFinance.js. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PEDocs = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SIZES = {
    a4: { label: 'A4', page: '210mm 297mm', margin: '12mm', font: 12.5, screen: 794 },
    a5: { label: 'A5', page: '148mm 210mm', margin: '9mm', font: 11.5, screen: 560 },
    a6: { label: 'A6', page: '105mm 148mm', margin: '6mm', font: 10, screen: 397 },
    thermal: { label: 'Thermal slip (80 mm)', page: '80mm 200mm', margin: '3mm', font: 11, screen: 302 }
  };
  var KINDS = { warranty: 'Warranty card', voucher: 'Service voucher', claim: 'Claim voucher', challan: 'Dispatch challan' };
  var COMPANY = { name: 'Pushpak Enterprises', line: 'Hubli, Karnataka' };

  function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function dateOf(v) {
    if (!v) return null;
    if (typeof v.toDate === 'function') return v.toDate();
    if (typeof v === 'object' && typeof v.seconds === 'number') return new Date(v.seconds * 1000);
    if (typeof v === 'object' && typeof v.ms === 'number') return new Date(v.ms);
    var d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  function fmtDate(v) {
    var d = dateOf(v);
    return d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '—';
  }
  function money(n) {
    var x = Number(n);
    return isFinite(x) ? '₹' + x.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
  }
  function addMonths(isoDate, months) {
    var d = dateOf(isoDate);
    if (!d || !isFinite(Number(months))) return null;
    var r = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + Number(months), d.getUTCDate()));
    return r;
  }
  function val(v) { var s = (v === null || v === undefined) ? '' : String(v).trim(); return s ? esc(s) : '—'; }
  function kv(rows) {
    return '<table class="kv">' + rows.filter(function (r) { return r; }).map(function (r) {
      return '<tr><th>' + esc(r[0]) + '</th><td>' + r[1] + '</td></tr>';
    }).join('') + '</table>';
  }
  function sign(labels) {
    return '<div class="sign">' + labels.map(function (l) { return '<div><span></span>' + esc(l) + '</div>'; }).join('') + '</div>';
  }

  // ---- the four documents: each returns { id, title, phone, body, text } ----
  function warranty(r) {
    r = r || {};
    var months = Number(r.warrantyMonths);
    var exp = addMonths(r.purchaseDate, months);
    var comps = Array.isArray(r.warrantyComponents) ? r.warrantyComponents : [];
    var compRows = comps.map(function (c) {
      var e = addMonths(r.purchaseDate, Math.round(Number(c.durationYears) * 12));
      return '<tr><td>' + val(c.componentName) + '</td><td class="r">' + esc(c.durationYears) + ' yr</td><td class="r">' + (e ? fmtDate(e) : '—') + '</td></tr>';
    }).join('');
    var addr = [r.address, r.city, r.pincode].filter(Boolean).join(', ');
    return {
      id: r.registrationId || '', title: 'Warranty Card', phone: r.customerPhone,
      body: kv([
        ['Card no.', '<b>' + val(r.registrationId) + '</b>'], ['Customer', val(r.customerName)], ['Phone', val(r.customerPhone)], ['Address', val(addr)],
        ['Product', val(r.product || [r.brand, r.category].filter(Boolean).join(' '))], ['Brand / model', val([r.brand, r.modelNo].filter(Boolean).join(' / '))],
        ['Serial no.', '<b>' + val(r.serialNumber) + '</b>'], ['Purchase date', fmtDate(r.purchaseDate)], ['Purchased from', val(r.purchasedFrom || r.dealerName)],
        ['Warranty', isFinite(months) && months > 0 ? esc(months) + ' months' : '—'], ['Valid until', '<b>' + (exp ? fmtDate(exp) : '—') + '</b>']
      ]) + (compRows ? '<h3>Cover by part</h3><table class="grid"><thead><tr><th>Part</th><th class="r">Cover</th><th class="r">Until</th></tr></thead><tbody>' + compRows + '</tbody></table>' : '')
        + '<p class="note">Valid with the purchase invoice and this serial number. Keep this card safe. To book a service, quote the card number.</p>' + sign(['Dealer stamp & signature']),
      text: ['*Warranty card ' + (r.registrationId || '') + '*', (r.product || r.brand || '') + (r.serialNumber ? ' (Serial ' + r.serialNumber + ')' : ''),
        'Purchased ' + fmtDate(r.purchaseDate) + ', valid until ' + (exp ? fmtDate(exp) : '—'), COMPANY.name].join('\n')
    };
  }

  function voucher(t) {
    t = t || {};
    var id = t.requestId || t.jobId || '';
    var addr = [t.address, t.city, t.pincode].filter(Boolean).join(', ');
    var appt = t.scheduledDate ? t.scheduledDate + (t.scheduledStartTime ? ' ' + t.scheduledStartTime + (t.scheduledEndTime ? '-' + t.scheduledEndTime : '') : '') : '';
    var warr = t.warrantyStatus === 'in_warranty' ? 'In warranty' : t.warrantyStatus === 'out_of_warranty' ? 'Out of warranty'
      : (t.intakeWarranty && t.intakeWarranty.status === 'in_warranty' ? 'In warranty (at intake)' : t.intakeWarranty && t.intakeWarranty.status === 'out_of_warranty' ? 'Out of warranty (at intake)' : '');
    var charges = '';
    if (t.billingType === 'customer') {
      charges = '<h3>Charges</h3><table class="grid"><tbody><tr><td>Spare parts</td><td class="r">' + money(t.sparePartsCost) + '</td></tr><tr><td>Service charge</td><td class="r">' + money(t.serviceCharge) +
        '</td></tr><tr><td>Other</td><td class="r">' + money(t.otherCharges) + '</td></tr><tr><th>Total</th><th class="r">' + money(t.billingTotal) + '</th></tr></tbody></table>';
    } else if (t.billingType === 'claim' || t.warrantyStatus === 'in_warranty') {
      charges = '<p class="note"><b>No charge to the customer</b> - covered by warranty.</p>';
    }
    return {
      id: id, title: 'Service Voucher', phone: t.customerPhone,
      body: kv([
        ['Service no.', '<b>' + val(id) + '</b>'], ['Type', val(t.type || t.requestType || 'Service')], ['Date', fmtDate(t.createdAt)],
        ['Customer', val(t.customerName)], ['Phone', val(t.customerPhone)], ['Address', val(addr)],
        ['Product', val(t.product || [t.brand, t.category].filter(Boolean).join(' '))], ['Model / serial', val([t.modelNo, t.serialNumber].filter(Boolean).join(' / '))],
        ['Complaint', val(t.issue || t.issueDescription)], ['Service center', val(t.serviceCenterName)], ['Technician', val(t.technicianName)],
        appt ? ['Appointment', val(appt)] : null, warr ? ['Warranty', val(warr)] : null, ['Status', val(String(t.status || '').replace(/_/g, ' '))],
        t.closureCode ? ['Outcome', val(t.closureCode)] : null, t.actionTaken ? ['Work done', val(t.actionTaken)] : null, t.partsUsedNotes ? ['Parts used', val(t.partsUsedNotes)] : null,
        t.closedAt ? ['Completed on', fmtDate(t.closedAt)] : null
      ]) + charges + sign(['Customer signature', 'Technician signature']),
      text: ['*Service ' + id + '*', (t.product || t.category || '') + (t.serialNumber ? ' (Serial ' + t.serialNumber + ')' : ''),
        'Status: ' + String(t.status || 'new').replace(/_/g, ' ') + (appt ? '\nAppointment: ' + appt : '') + (t.technicianName ? '\nTechnician: ' + t.technicianName : ''), COMPANY.name].join('\n')
    };
  }

  function claim(c) {
    c = c || {};
    var items = (Array.isArray(c.ticketIds) ? c.ticketIds : Array.isArray(c.walletTxnIds) ? c.walletTxnIds : []);
    return {
      id: c.claimId || '', title: 'Claim Voucher', phone: null,
      body: kv([
        ['Claim no.', '<b>' + val(c.claimId) + '</b>'], ['Date', fmtDate(c.createdAt)],
        ['Claimant', val(c.claimantName || (c.claimantType === 'warehouse' ? 'Warehouse (Head Office)' : ''))], ['Type', val(c.claimantType)],
        ['Service center', val(c.serviceCenterName)],
        ['Claim for', val(c.claimType || (c.ticketIds ? 'Warranty tickets' : c.walletTxnIds ? 'Service-charge credits' : c.sourceReturnId ? 'Defective part' : ''))],
        ['Items', items.length ? esc(items.length) + ' item(s)' : (c.partName ? val(c.partName) : '—')],
        ['Description', val(c.description)], ['Claimed', '<b>' + money(c.amount) + '</b>'],
        c.approvedAmount !== undefined && c.approvedAmount !== null ? ['Approved', '<b>' + money(c.approvedAmount) + '</b>'] : null,
        ['Status', val(c.status)], c.rejectReason ? ['Reason', val(c.rejectReason)] : null,
        c.paymentMethod || c.paymentRef ? ['Payment', val([c.paymentMethod, c.paymentRef].filter(Boolean).join(' / '))] : null
      ]) + sign(['Verified by', 'Approved by']),
      text: ['*Claim ' + (c.claimId || '') + '*', 'Claimed ' + money(c.amount) + (c.approvedAmount != null ? ', approved ' + money(c.approvedAmount) : ''), 'Status: ' + (c.status || ''), COMPANY.name].join('\n')
    };
  }

  function challan(s) {
    s = s || {};
    var t = s.transport || {};
    return {
      id: s.requestId || '', title: 'Dispatch Challan', phone: null,
      body: kv([
        ['Challan for', '<b>' + val(s.requestId) + '</b>'], ['Dispatch date', val(t.dispatchDate || '')], ['Item', val(s.partName || s.item)], ['Quantity', '<b>' + val(s.dispatchedQty || s.quantity) + '</b>'],
        ['Sent to', val(s.requestedByName || s.requestedByEmail || s.requestedByUid)], ['Against job', val(s.sourceJobLabel || s.sourceJobId)],
        ['Transporter', val(t.transporter || t.transporterName)], ['Docket / LR / AWB', '<b>' + val(t.docket || t.docketNumber) + '</b>'], ['Vehicle', val(t.vehicle || t.vehicleNumber)]
      ]) + '<p class="note">Spare parts sent for service use. Not for sale. Check the quantity on receipt and mark it received in the CRM.</p>' + sign(['Dispatched by', 'Received by']),
      text: ['*Dispatch ' + (s.requestId || '') + '*', (s.partName || s.item || '') + ' x ' + (s.dispatchedQty || s.quantity || ''), 'Transporter: ' + (t.transporter || t.transporterName || '-') + ', Docket: ' + (t.docket || t.docketNumber || '-'), COMPANY.name].join('\n')
    };
  }

  var BUILD = { warranty: warranty, voucher: voucher, claim: claim, challan: challan };

  function css(size) {
    var z = SIZES[size], th = size === 'thermal';
    return '@page{size:' + z.page + ';margin:' + z.margin + '}*{box-sizing:border-box}' +
      'html{-webkit-text-size-adjust:100%}body{margin:0;background:#eee;color:#111;font:' + z.font + 'px/1.45 Arial,Helvetica,sans-serif}' +
      '.doc{background:#fff;width:100%;max-width:' + z.screen + 'px;margin:0 auto;padding:' + (th ? 10 : 18) + 'px;overflow-wrap:anywhere;word-break:break-word}' +
      '.bar{max-width:' + z.screen + 'px;margin:0 auto;padding:8px;display:flex;gap:8px;justify-content:flex-end;background:#eee}' +
      '.bar button{font:inherit;padding:8px 16px;min-height:40px;cursor:pointer}' +
      '.hd{text-align:' + (th ? 'center' : 'left') + ';border-bottom:2px solid #111;padding-bottom:6px;margin-bottom:8px}.hd b{font-size:1.25em}.hd div{font-size:.9em;color:#444}' +
      'h1{font-size:1.35em;margin:6px 0 2px}h3{font-size:1.05em;margin:12px 0 4px}' +
      'table{width:100%;border-collapse:collapse}.kv th{width:' + (th ? '38%' : '32%') + ';text-align:left;color:#444;font-weight:600;vertical-align:top;padding:3px 6px 3px 0}.kv td{padding:3px 0;vertical-align:top}' +
      '.grid th,.grid td{border:1px solid #999;padding:4px 6px;text-align:left;vertical-align:top}.grid th{background:#f2f2f2}.r{text-align:right!important}' +
      '.note{font-size:.9em;color:#333;margin:10px 0}.sign{display:flex;gap:16px;margin-top:' + (th ? 22 : 34) + 'px}.sign div{flex:1;font-size:.85em;color:#444;text-align:center}.sign span{display:block;border-bottom:1px solid #111;height:' + (th ? 20 : 30) + 'px;margin-bottom:3px}' +
      '.ft{margin-top:12px;font-size:.8em;color:#666;text-align:center}' +
      '@media print{body{background:#fff}.bar{display:none}.doc{max-width:none;padding:0}tr,.sign{page-break-inside:avoid}}';
  }

  function render(kind, data, size, opts) {
    if (!BUILD[kind]) throw new Error('Unknown document: ' + kind);
    size = SIZES[size] ? size : 'a4';
    var co = Object.assign({}, COMPANY, (opts && opts.company) || {});
    var d = BUILD[kind](data);
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>' + esc(d.title + (d.id ? ' ' + d.id : '')) + '</title><style>' + css(size) + '</style></head><body class="size-' + size + '">' +
      '<div class="bar"><button type="button" onclick="window.print()">Print / Save as PDF</button></div>' +
      '<main class="doc"><div class="hd"><b>' + esc(co.name) + '</b><div>' + esc(co.line || '') + (co.phone ? ' &middot; ' + esc(co.phone) : '') + (co.gstin ? ' &middot; GSTIN ' + esc(co.gstin) : '') + '</div></div>' +
      '<h1>' + esc(d.title) + '</h1>' + d.body + '<div class="ft">Computer-generated document &middot; ' + esc(fmtDate(new Date())) + '</div></main></body></html>';
  }

  function text(kind, data) { return BUILD[kind](data).text; }
  function waLink(phone, msg) {
    var digits = String(phone || '').replace(/\D/g, '').slice(-10);
    return /^[6-9]\d{9}$/.test(digits) ? 'https://wa.me/91' + digits + '?text=' + encodeURIComponent(msg) : null;
  }
  function fileName(kind, data, size) { return (BUILD[kind](data).id || kind).replace(/[^A-Za-z0-9._-]+/g, '_') + '-' + size + '.pdf'; }

  // ---- browser helpers ----
  function open(kind, data, size, opts) {
    var html = render(kind, data, size, opts);
    var w = window.open('', '_blank');
    if (!w) { alert('Allow pop-ups for this site to open the document.'); return null; }
    w.document.open(); w.document.write(html); w.document.close();
    return w;
  }
  // ---- real PDF download (no server, no outside library) ----
  // The document is laid out by the browser exactly as it prints, drawn onto
  // a canvas through an SVG <foreignObject> (so any script, e.g. Kannada,
  // renders with the device's fonts), and each page is stored as a JPEG
  // inside a small hand-written PDF file.
  function b64ToBytes(b64) {
    var bin = atob(b64), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function buildPdf(pages, wPx, hPx, title) {
    var enc = new TextEncoder(), parts = [], offsets = [], len = 0;
    function push(x) { var b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; }
    function obj(n, body) { offsets[n] = len; push(n + ' 0 obj\n'); push(body); push('\nendobj\n'); }
    var W = (wPx * 0.75).toFixed(2), H = (hPx * 0.75).toFixed(2), n = pages.length;
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    var kids = [];
    for (var i = 0; i < n; i++) kids.push((4 + i * 3) + ' 0 R');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + n + ' >>');
    obj(3, '<< /Title (' + String(title || 'Document').replace(/[^\x20-\x7E]/g, '').replace(/([()\\])/g, '\\$1') + ') /Producer (Pushpak CRM) >>');
    for (var k = 0; k < n; k++) {
      var pg = 4 + k * 3, im = pg + 1, ct = pg + 2, jpg = pages[k];
      obj(pg, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + H + '] /Resources << /XObject << /Im0 ' + im + ' 0 R >> >> /Contents ' + ct + ' 0 R >>');
      offsets[im] = len; push(im + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + jpg.w + ' /Height ' + jpg.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpg.bytes.length + ' >>\nstream\n'); push(jpg.bytes); push('\nendstream\nendobj\n');
      var cs = 'q ' + W + ' 0 0 ' + H + ' 0 0 cm /Im0 Do Q';
      obj(ct, '<< /Length ' + cs.length + ' >>\nstream\n' + cs + '\nendstream');
    }
    var total = 4 + n * 3, xref = len;
    var x = 'xref\n0 ' + total + '\n0000000000 65535 f \n';
    for (var j = 1; j < total; j++) x += ('0000000000' + (offsets[j] || 0)).slice(-10) + ' 00000 n \n';
    push(x + 'trailer\n<< /Size ' + total + ' /Root 1 0 R /Info 3 0 R >>\nstartxref\n' + xref + '\n%%EOF');
    return new Blob(parts, { type: 'application/pdf' });
  }
  function toPdf(kind, data, size, opts) {
    return new Promise(function (resolve, reject) {
      var sz = SIZES[size] || SIZES.a4, wPx = sz.screen, SCALE = 2;
      var fixedH = { a4: 1123, a5: 794, a6: 559 }[size];
      var ifr = document.createElement('iframe');
      ifr.setAttribute('aria-hidden', 'true');
      ifr.style.cssText = 'position:fixed;left:-99999px;top:0;width:' + wPx + 'px;height:600px;border:0;visibility:hidden';
      ifr.onload = function () {
        try {
          var d = ifr.contentDocument, doc = d.querySelector('.doc');
          if (!doc) return; // the empty frame's own load; wait for the document
          var bar = d.querySelector('.bar'); if (bar) bar.remove();
          d.body.style.background = '#fff';
          var contentH = Math.ceil(Math.max(doc.getBoundingClientRect().height, doc.scrollHeight));
          var pageH = fixedH || contentH;
          var nPages = Math.max(1, Math.ceil(contentH / pageH));
          var styleTxt = css(size).replace(/@media print\{.*\}$/, '').replace(/@page\{[^}]*\}/, '');
          var inner = new XMLSerializer().serializeToString(doc);
          var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + (wPx * SCALE) + '" height="' + (pageH * nPages * SCALE) + '" viewBox="0 0 ' + wPx + ' ' + (pageH * nPages) + '"><foreignObject width="' + wPx + '" height="' + (pageH * nPages) + '">' +
            '<div xmlns="http://www.w3.org/1999/xhtml" style="background:#fff;width:' + wPx + 'px"><style>' + styleTxt.replace(/body\{[^}]*\}/, '') + 'body,div{font-family:Arial,Helvetica,sans-serif}</style>' +
            '<div style="font:' + sz.font + 'px/1.45 Arial,Helvetica,sans-serif;color:#111">' + inner + '</div></div></foreignObject></svg>';
          var img = new Image();
          img.onload = function () {
            try {
              var pages = [];
              for (var i = 0; i < nPages; i++) {
                var cv = document.createElement('canvas');
                cv.width = wPx * SCALE; cv.height = pageH * SCALE;
                var cx = cv.getContext('2d');
                cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
                cx.drawImage(img, 0, i * pageH * SCALE, wPx * SCALE, pageH * SCALE, 0, 0, wPx * SCALE, pageH * SCALE);
                var url = cv.toDataURL('image/jpeg', 0.92);
                pages.push({ w: cv.width, h: cv.height, bytes: b64ToBytes(url.split(',')[1]) });
              }
              ifr.remove();
              resolve(buildPdf(pages, wPx, pageH, BUILD[kind](data).title));
            } catch (e) { ifr.remove(); reject(e); }
          };
          img.onerror = function () { ifr.remove(); reject(new Error('render failed')); };
          img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
        } catch (e) { ifr.remove(); reject(e); }
      };
      ifr.srcdoc = render(kind, data, size, opts);
      document.body.appendChild(ifr);
      setTimeout(function () { if (ifr.parentNode) { ifr.remove(); reject(new Error('timeout')); } }, 15000);
    });
  }
  function saveBlob(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  // Downloads a PDF. If this browser cannot draw it, opens the print view
  // instead (Print -> Save as PDF) so the person is never left empty-handed.
  function download(kind, data, size, opts) {
    return toPdf(kind, data, size, opts).then(function (blob) {
      saveBlob(blob, fileName(kind, data, size));
      return blob;
    }).catch(function () {
      open(kind, data, size, opts);
      return null;
    });
  }
  // Adds a small "Print / Download / WhatsApp" toolbar to the end of `el`.
  function attach(el, kind, data, opts) {
    if (!el || !BUILD[kind]) return null;
    var old = el.querySelector(':scope > .pe-docbar'); if (old) old.remove();
    var bar = document.createElement('div');
    bar.className = 'pe-docbar';
    bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:14px;padding-top:10px;border-top:1px solid #e2e2e2;';
    var sel = '<select class="pe-doc-size" aria-label="Page size" style="min-height:40px;font-size:16px;">' +
      Object.keys(SIZES).map(function (k) { return '<option value="' + k + '">' + esc(SIZES[k].label) + '</option>'; }).join('') + '</select>';
    var link = waLink(BUILD[kind](data).phone, text(kind, data));
    bar.innerHTML = '<b style="font-size:12.5px;">' + esc(KINDS[kind]) + '</b>' + sel +
      '<button type="button" class="btn-secondary pe-doc-print">Print / PDF</button><button type="button" class="btn-secondary pe-doc-dl">Download PDF</button>' +
      (link ? '<a class="btn-secondary pe-doc-wa" href="' + esc(link) + '" target="_blank" rel="noopener" style="text-decoration:none;display:inline-flex;align-items:center;">WhatsApp</a>' : '');
    el.appendChild(bar);
    var size = function () { return bar.querySelector('.pe-doc-size').value; };
    bar.querySelector('.pe-doc-print').addEventListener('click', function () { open(kind, data, size(), opts); });
    bar.querySelector('.pe-doc-dl').addEventListener('click', function () { download(kind, data, size(), opts); });
    return bar;
  }

  return { SIZES: SIZES, KINDS: KINDS, toPdf: toPdf, render: render, text: text, waLink: waLink, fileName: fileName, open: open, download: download, attach: attach, esc: esc, addMonths: addMonths };
});
