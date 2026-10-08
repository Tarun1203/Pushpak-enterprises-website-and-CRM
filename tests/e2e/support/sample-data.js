// Realistic sample records (with long names and addresses) for the stubbed
// Firebase, so the responsive suite lays out screens with real-looking
// content instead of empty tables. The signed-in test user is uid 'u1'.
const DAY = 86400000;
const t = (daysAgo) => ({ __ms: Date.now() - daysAgo * DAY });
const LONG = 'Sri Venkateshwara Home Appliances & Electricals Private Limited';
const ADDR = 'Shop No. 14, Ground Floor, Vasavi Complex, Station Road, Near Old Bus Stand, Raichur, Karnataka 584101';
const statuses = ['new', 'assigned', 'accepted', 'in_progress', 'waiting_spare', 'completed', 'closed'];

function tickets(n, extra) {
  return Array.from({ length: n }, (_, i) => ({
    id: 'tk' + i, requestId: `PE-CR-2026100${i}-00${i}`, jobId: `PE-JOB-2026100${i}-00${i}`, serviceCenterUid: 'u1', technicianUid: 'u1',
    serviceCenterName: LONG, technicianName: 'Ramesh Kumar Gowda', customerName: 'Mallikarjun Shivappa Patil', customerPhone: '98450' + String(10000 + i),
    address: ADDR, city: 'Raichur', pincode: '584101', product: 'MakWell 25L Storage Water Heater (Geyser) 5-Star', brand: 'MakWell', category: 'Geyser',
    modelNo: 'MW-GSR-25L-5S', serialNumber: 'MKW25L2026' + String(100000 + i), status: statuses[i % statuses.length], type: i % 3 ? 'service' : 'installation',
    issue: 'Water not heating properly; tripping MCB after 10 minutes of use; customer requests urgent visit', warrantyStatus: i % 2 ? 'in_warranty' : 'out_of_warranty',
    scheduledDate: '2026-10-1' + (i % 9), scheduledStartTime: '10:00', scheduledEndTime: '12:00', createdAt: t(i), updatedAt: t(i), billingTotal: 450, ...extra
  }));
}

const SAMPLE = {
  centerRequests: tickets(8),
  serviceJobs: tickets(6),
  publicServiceRequests: tickets(4, { status: 'new' }),
  users: [
    { id: 'u1', role: 'PLACEHOLDER' },
    ...['technician', 'servicecenter', 'dealer', 'distributor', 'warehouse'].flatMap((role, k) => Array.from({ length: 3 }, (_, i) => ({
      id: `${role}${i}`, role, name: (role === 'technician' ? 'Ramesh Kumar Gowda ' : LONG + ' ') + i, email: `${role}${i}.longemailaddress@pushpakenterprises.example`,
      phone: '9845012345', districtsCovered: ['Raichur', 'Koppal', 'Ballari', 'Vijayapura'], pincodesCovered: ['584101', '584102', '584103', '584104', '584120'],
      brandsAuthorized: ['MakWell', 'Flyvision', 'Skevia'], distributionType: 'direct', linkedServiceCenterUid: 'u1', distributorUid: 'u1', status: 'ACTIVE', createdAt: t(k * 3 + i)
    })))
  ],
  centerTechnicians: Array.from({ length: 4 }, (_, i) => ({ id: 'ct' + i, serviceCenterUid: 'u1', technicianUid: 'technician' + i, name: 'Ramesh Kumar Gowda ' + i, phone: '9845012345', employmentStatus: 'ACTIVE', technicianCode: 'TC-000' + i, skills: ['Geyser', 'LED TV', 'Washing Machine'] })),
  spareParts: Array.from({ length: 6 }, (_, i) => ({ id: 'sp' + i, name: 'Thermostat assembly with capillary and safety cut-out ' + i, partCode: 'SP-THERM-25L-00' + i, price: 450 + i, brand: 'MakWell', category: 'Geyser', status: 'active' })),
  inventory: Array.from({ length: 6 }, (_, i) => ({ id: 'inv' + i, location: ['warehouse', 'servicecenter', 'technician'][i % 3], serviceCenterUid: 'u1', technicianUid: 'u1', partId: 'sp' + i, partName: 'Thermostat assembly with capillary ' + i, quantity: 12 + i, reorderLevel: 5 })),
  spareRequests: Array.from({ length: 5 }, (_, i) => ({ id: 'sr' + i, requestId: 'PE-SR-2026100' + i, requestedByUid: 'u1', partName: 'Heating element 2000W copper sheathed ' + i, quantity: 2, status: ['new', 'approved', 'dispatched', 'received', 'backorder'][i], createdAt: t(i) })),
  claims: Array.from({ length: 4 }, (_, i) => ({ id: 'cl' + i, claimId: 'PE-CL-2026100' + i, claimantUid: 'u1', claimantName: LONG, claimantType: 'servicecenter', amount: 4500 + i, status: ['submitted', 'verified', 'settled', 'rejected'][i], description: 'Warranty service charges for September 2026 — 12 tickets', createdAt: t(i) })),
  walletTransactions: Array.from({ length: 4 }, (_, i) => ({ id: 'w' + i, technicianUid: 'u1', amount: 300, status: 'unclaimed', sourceJobLabel: 'PE-CR-2026100' + i, createdAt: t(i) })),
  dealerOrders: Array.from({ length: 4 }, (_, i) => ({ id: 'do' + i, orderId: 'DO-2026100' + i, dealerUid: 'u1', dealerName: LONG, distributorUid: '', status: ['placed', 'confirmed', 'dispatched', 'delivered'][i], lines: [{ modelId: 'm1', qty: 4 }], pricing: { status: 'ok' },
    pricedLines: [{ label: 'MakWell 25L Storage Water Heater 5-Star — MW-GSR-25L-5S', qty: 4, unitPrice: 5200, gstRate: 18, total: 24544 }], totals: { taxable: 20800, gst: 3744, total: 24544 }, createdAt: t(i) })),
  distributorOrders: Array.from({ length: 2 }, (_, i) => ({ id: 'xo' + i, orderId: 'XO-2026100' + i, distributorUid: 'u1', distributorName: LONG, status: 'placed', lines: [{ modelId: 'm1', qty: 40 }], createdAt: t(i) })),
  productRegistrations: Array.from({ length: 5 }, (_, i) => ({ id: 'reg' + i, registrationId: 'PE-REG-2026100' + i, dealerUid: 'u1', customerName: 'Mallikarjun Shivappa Patil', customerPhone: '9845012345', product: 'MakWell 25L Storage Water Heater 5-Star', serialNumber: 'MKW25L2026' + (100 + i), purchaseDate: '2026-09-0' + (i + 1), warrantyMonths: 24, createdAt: t(i) })),
  invoices: Array.from({ length: 3 }, (_, i) => ({ id: 'inv' + i, invoiceNo: 'PE/2026-27/0000' + i, buyerUid: 'u1', buyer: { name: LONG }, orderId: 'DO-2026100' + i, totals: { total: 24544 }, paid: 0, balance: 24544, status: 'unpaid', invoiceDate: t(i), dueDate: t(-20) })),
  notifications: Array.from({ length: 3 }, (_, i) => ({ id: 'n' + i, recipientType: 'uid', recipientValue: 'u1', title: 'New service request routed to you', message: 'Mallikarjun Shivappa Patil — MakWell 25L Storage Water Heater', read: false, createdAt: t(i) })),
  products: [{ id: 'p1', name: 'MakWell 25L Storage Water Heater', brand: 'MakWell', categoryName: 'Geyser', status: 'active' }],
  productModels: [{ id: 'm1', productId: 'p1', modelNumber: 'MW-GSR-25L-5S', gstRate: 18, status: 'active' }],
  serviceChargeRates: [{ id: 'default_geyser_repair_flat', scope: 'default', category: 'Geyser', rateType: 'repair', amount: 300 }]
};

// The signed-in user's own profile sits in users/u1 with the right role.
function sampleFor(role) {
  const data = JSON.parse(JSON.stringify(SAMPLE));
  data.users[0] = { id: 'u1', role, name: 'Test ' + role, email: 'test@pe.test' };
  return data;
}
// The same data with an HTML/script payload appended to every free-text
// field (names, addresses, notes...). A screen that shows it as text is
// safe; one that renders it as HTML runs the payload, which sets
// window.__xss — the security suite checks for that.
const XSS = '<img src=x onerror="window.__xss=(window.__xss||0)+1"><svg onload="window.__xss=(window.__xss||0)+1"></svg>';
const TEXT_KEY = /name|address|issue|product|title|message|description|label|notes|note|modelNumber|modelNo|city|reason|email|subject/i;
function poison(v, key) {
  if (Array.isArray(v)) return v.map((x) => poison(x, key));
  if (v && typeof v === 'object' && v.__ms === undefined) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, poison(x, k)]));
  if (typeof v === 'string' && key && TEXT_KEY.test(key)) return v + XSS;
  return v;
}
function hostileSampleFor(role) {
  const data = poison(sampleFor(role));
  data.users[0] = { id: 'u1', role, name: 'Test ' + role, email: 'test@pe.test' };
  return data;
}
module.exports = { sampleFor, hostileSampleFor, XSS };
