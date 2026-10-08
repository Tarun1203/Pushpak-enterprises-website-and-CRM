// Phase 5 item 4 — workflow tests. Whole journeys through the real rules
// AND the real Cloud Functions, in the Firebase emulators: each step is
// written as the role that does it in the app, and the test waits for the
// server's reaction (routing, lifecycle checks, billing, invoices, stock,
// claims, customer portal). Run with: firebase emulators:exec --only
// auth,firestore,functions (see .github/workflows/automated-qa.yml).
import test from 'node:test';
import assert from 'node:assert';
import {
  makeEnv, PROJECT, dbAs, attempt, hydrate, adminGet, adminQuery, adminSet, assertSucceeds, assertFails, USERS, past
} from './env.mjs';

const FUNCTIONS = process.env.FUNCTIONS_EMULATOR_ORIGIN || 'http://127.0.0.1:5001';
const AUTH = 'http://' + (process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099');
const REGION = 'asia-south1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ymd = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10).replace(/-/g, '');

async function waitFor(label, fn, timeoutMs = 45000) {
  const end = Date.now() + timeoutMs;
  let last;
  while (Date.now() < end) {
    last = await fn();
    if (last) return last;
    await sleep(500);
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

// ---- Auth emulator + callable helpers ---------------------------------
async function authPost(pathname, body) {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/${pathname}?key=fake-api-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`${pathname}: ${JSON.stringify(j)}`);
  return j;
}
async function phoneSignIn(phone10) {
  const phoneNumber = '+91' + phone10;
  const { sessionInfo } = await authPost('accounts:sendVerificationCode', { phoneNumber, recaptchaToken: 'test' });
  const codes = await (await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/verificationCodes`)).json();
  const code = (codes.verificationCodes || []).filter((c) => c.phoneNumber === phoneNumber).pop().code;
  const res = await authPost('accounts:signInWithPhoneNumber', { sessionInfo, code });
  return { uid: res.localId, idToken: res.idToken };
}
async function emailSignUp(email) {
  const res = await authPost('accounts:signUp', { email, password: 'secret123', returnSecureToken: true });
  return { uid: res.localId, idToken: res.idToken };
}
async function call(name, data, idToken) {
  const r = await fetch(`${FUNCTIONS}/${PROJECT}/${REGION}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(idToken ? { Authorization: 'Bearer ' + idToken } : {}) },
    body: JSON.stringify({ data })
  });
  const j = await r.json().catch(() => ({}));
  if (j.error) { const e = new Error(j.error.message || 'callable error'); e.status = j.error.status; throw e; }
  return j.result;
}

let env;
test.before(async () => {
  env = await makeEnv();
  await env.clearFirestore();
  for (const [uid, u] of Object.entries(USERS)) await adminSet(env, `users/${uid}`, u);
});
test.after(async () => { if (env) await env.cleanup(); });
const write = (who, op, target, data) => attempt(dbAs(env, who), op, target, data);

test('website booking is routed to the covering service center and tracked for the customer', async () => {
  await adminSet(env, 'users/scW1', { role: 'servicecenter', name: 'Raichur SC', pincodesCovered: ['584201'], brandsAuthorized: ['makwell'] });
  await adminSet(env, 'serviceCenterProfiles/scW1', { status: 'ACTIVE' });
  const id = `PE-SVC-${ymd()}-0901-CustomerSite`;
  await assertSucceeds(write('anon', 'create', `publicServiceRequests/${id}`, {
    requestId: id, customerName: 'Asha', customerPhone: '9000000101', address: '1 Main Rd', city: 'Raichur', pincode: '584201',
    brand: 'MakWell', category: 'Geyser', requestType: 'service', issueDescription: 'No hot water', status: 'new', source: 'public-site', createdAt: '__ST__'
  }));
  const routed = await waitFor('center request created', () => adminGet(env, `centerRequests/route_${id}`));
  assert.strictEqual(routed.serviceCenterUid, 'scW1');
  assert.strictEqual(routed.status, 'new');
  const pub = await waitFor('request marked routed', async () => { const d = await adminGet(env, `publicServiceRequests/${id}`); return d.status === 'assigned_to_center' && d; });
  assert.strictEqual(pub.routing.method, 'pincode');
  const track = await waitFor('customer tracking', () => adminGet(env, `customerTracking/${id}`));
  assert.strictEqual(track.customerPhone, '9000000101');
  assert.ok(!('address' in track) && !('customerName' in track), 'tracking holds no personal details');
  const notes = await adminQuery(env, 'notifications', ['recipientValue', '==', 'scW1']);
  assert.ok(notes.length >= 1, 'center notified');
});

test('a booking nobody covers is left for a person, with the reason', async () => {
  const id = `PE-SVC-${ymd()}-0902-CustomerSite`;
  await assertSucceeds(write('anon', 'create', `publicServiceRequests/${id}`, {
    requestId: id, customerName: 'Ravi', customerPhone: '9000000102', pincode: '999999', brand: 'MakWell', status: 'new', source: 'public-site', createdAt: '__ST__'
  }));
  const pub = await waitFor('manual routing', async () => { const d = await adminGet(env, `publicServiceRequests/${id}`); return d.routing && d; });
  assert.strictEqual(pub.routing.status, 'manual');
  assert.strictEqual(await adminGet(env, `centerRequests/route_${id}`), null);
});

test('ticket lifecycle: roster-checked assignment, legal steps only, server billing and wallet credit on completion', async () => {
  await adminSet(env, 'users/scW2', { role: 'servicecenter', name: 'Center W2' });
  await adminSet(env, 'users/tW2', { role: 'technician', name: 'Tech W2', linkedServiceCenterUid: 'scW2' });
  await adminSet(env, 'users/tOut', { role: 'technician', name: 'Not on roster' });
  await adminSet(env, 'centerTechnicians/ctW2', { serviceCenterUid: 'scW2', technicianUid: 'tW2', name: 'Tech W2' });
  await adminSet(env, 'productRegistrations/regW2', { registrationId: 'PE-REG-W2', serialNumber: 'WF-SN-0002', purchaseDate: new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10), warrantyMonths: 12, customerPhone: '9000000103' });
  await adminSet(env, 'serviceChargeRates/default_geyser_repair_flat', { scope: 'default', category: 'Geyser', amount: 300 });
  const T = 'centerRequests/crW2';
  await assertSucceeds(write('scW2', 'create', T, { requestId: 'PE-CR-W2', serviceCenterUid: 'scW2', status: 'new', type: 'service', category: 'Geyser', brand: 'MakWell', customerPhone: '9000000103', serialNumber: 'WF-SN-0002', createdAt: '__ST__' }));

  // Note: the Firestore emulator reports a placeholder identity for every
  // write, so the checks that depend on WHO wrote (roster-checked assignment,
  // illegal status steps reverted) can't be exercised here; they are tested
  // through their triggers in functions/flow.test.js.
  await assertSucceeds(write('scW2', 'update', T, { technicianUid: 'tW2', technicianName: 'Tech W2', status: 'assigned' }));
  await assertFails(write('tOut', 'update', T, { status: 'accepted' }), 'a technician not on the ticket cannot touch it');
  await assertSucceeds(write('tW2', 'update', T, { status: 'accepted', updatedAt: '__ST__' }));
  // Nor write its own warranty verdict.
  await assertFails(write('tW2', 'update', T, { warrantyStatus: 'out_of_warranty' }));

  await assertSucceeds(write('tW2', 'update', T, { status: 'in_progress', updatedAt: '__ST__' }));
  await sleep(1500);
  await assertSucceeds(write('tW2', 'update', T, { status: 'completed', closureCode: 'REPAIRED', actionTaken: 'Replaced thermostat', partsUsedNotes: 'Thermostat', closedByUid: 'tW2', closedAt: '__ST__', updatedAt: '__ST__' }));
  const billed = await waitFor('billing computed', async () => { const d = await adminGet(env, T); return d.billingComputedAt && d; });
  assert.strictEqual(billed.status, 'completed');
  assert.strictEqual(billed.warrantyStatus, 'in_warranty', 'registered 4 months ago, 12-month warranty');
  assert.strictEqual(billed.billingStatus, 'ready_to_claim');
  const credit = await waitFor('wallet credit', () => adminGet(env, 'walletTransactions/credit_centerRequests_crW2'));
  assert.strictEqual(credit.amount, 300);
  assert.strictEqual(credit.technicianUid, 'tW2');
  const track = await waitFor('tracking follows the ticket', async () => { const d = await adminGet(env, 'customerTracking/PE-CR-W2'); return d && d.status === 'completed' && d; });
  assert.ok(track.history.map((h) => h.status).includes('in_progress'), 'history recorded');
  assert.strictEqual(track.technicianName, 'Tech W2');
  assert.strictEqual(track.customerCharge, null, 'warranty job: customer pays nothing');

  // Claim the credit: technician files, Warehouse verifies, Super Admin pays.
  await assertSucceeds(write('tW2', 'set', 'claims/clW2', { claimId: 'CL-W2', claimantUid: 'tW2', claimantType: 'technician', status: 'submitted', amount: 300, walletTxnIds: ['credit_centerRequests_crW2'], createdAt: '__ST__' }));
  const locked = await waitFor('claim checked and locked', async () => { const d = await adminGet(env, 'claims/clW2'); return d.lock && d; });
  assert.strictEqual(locked.lock.status, 'locked');
  assert.strictEqual(locked.claimCheck.verified, 300);
  await assertFails(write('wh', 'update', 'claims/clW2', { status: 'verified', approvedAmount: 301, verifiedByUid: 'wh', verifiedAt: '__ST__' }));
  await assertSucceeds(write('wh', 'update', 'claims/clW2', { status: 'verified', approvedAmount: 300, verifiedByUid: 'wh', verifiedAt: '__ST__' }));
  await assertFails(write('wh', 'update', 'claims/clW2', { status: 'settled', paidByUid: 'wh', paidAt: '__ST__', paymentMethod: 'UPI' }));
  await assertSucceeds(write('sa', 'update', 'claims/clW2', { status: 'settled', paidByUid: 'sa', paidAt: '__ST__', paymentMethod: 'UPI', paymentRef: 'UTR1' }));
  const pay = await waitFor('payment record', () => adminGet(env, 'payments/claim_clW2'));
  assert.strictEqual(pay.amount, 300);
  assert.strictEqual(pay.sourceType, 'claim');
});

test('dealer order: priced by the server, approved within credit, invoiced, stocked, dispatched with serials, delivered and paid', async () => {
  await adminSet(env, 'products/pW', { name: 'Geyser' });
  await adminSet(env, 'productModels/mW', { productId: 'pW', modelNumber: 'WF-15', gstRate: 18, hsnCode: '8516', status: 'active' });
  await adminSet(env, 'priceLists/company_default-dealer_mW', { seller: 'company', buyer: 'default-dealer', modelId: 'mW', price: 1000 });
  await adminSet(env, 'users/dW', { role: 'dealer', name: 'Dealer W', distributionType: 'direct', gstin: '29ABCDE1234F1Z5' });
  await adminSet(env, 'settings/companyProfile', { legalName: 'Pushpak Enterprises', gstin: '29AAAAA0000A1Z5', stateCode: '29', invoicePrefix: 'PE' });
  await adminSet(env, 'tradeAccounts/dW', { creditLimit: 100000, outstanding: 0, paymentTermsDays: 30 });
  const O = 'dealerOrders/oW';
  await assertSucceeds(write('dW', 'create', O, { orderId: 'DO-W', dealerUid: 'dW', dealerName: 'Dealer W', lines: [{ modelId: 'mW', qty: 2 }], status: 'placed', distributorUid: '', createdAt: '__ST__' }));
  const priced = await waitFor('order priced', async () => { const d = await adminGet(env, O); return d.pricing && d.pricing.status === 'ok' && d; });
  assert.strictEqual(priced.totals.total, 2360, '2 x 1000 + 18% GST');
  await assertFails(write('dW', 'update', O, { totals: { total: 1 } }));

  await assertSucceeds(write('wh', 'update', O, { status: 'confirmed', updatedAt: '__ST__' }));
  const inv = await waitFor('invoice', () => adminGet(env, 'invoices/inv_dealerOrders_oW'));
  assert.match(inv.invoiceNo, /^PE\//);
  assert.strictEqual(inv.totals.cgst + inv.totals.sgst, 360, 'same state: CGST + SGST');
  assert.strictEqual((await waitFor('outstanding', async () => { const a = await adminGet(env, 'tradeAccounts/dW'); return a.outstanding === 2360 && a; })).outstanding, 2360);
  await waitFor('waiting for stock', async () => (await adminGet(env, O)).stockStatus === 'waiting');

  await assertSucceeds(write('wh', 'add', 'stockReceipts', { modelId: 'mW', serials: ['WF-0001', 'WF-0002'], createdByUid: 'wh', createdAt: '__ST__' }));
  await waitFor('stock reserved', async () => (await adminGet(env, O)).stockStatus === 'ready');

  await assertSucceeds(write('wh', 'update', O, { dispatchRequest: { serials: { mW: ['WF-0001', 'WF-0002'] }, transporter: 'VRL', docket: 'D-1', byUid: 'wh', requestedAt: '__ST__' } }));
  await waitFor('dispatched by the server', async () => (await adminGet(env, O)).status === 'dispatched');
  assert.strictEqual((await adminGet(env, 'unitSerials/WF-0001')).status, 'dispatched');
  await assertSucceeds(write('wh', 'update', O, { status: 'delivered', updatedAt: '__ST__' }));
  await waitFor('units delivered', async () => (await adminGet(env, 'unitSerials/WF-0002')).status === 'delivered');

  await assertSucceeds(write('wh', 'add', 'tradePayments', { accountUid: 'dW', amount: 2360, mode: 'NEFT', reference: 'UTR9', recordedByUid: 'wh', createdAt: '__ST__' }));
  await waitFor('invoice paid', async () => (await adminGet(env, 'invoices/inv_dealerOrders_oW')).status === 'paid');
  assert.strictEqual((await adminGet(env, 'tradeAccounts/dW')).outstanding, 0);
});

test('customer portal: verified-phone account, register, warranty check, book, track, support', async () => {
  await adminSet(env, 'users/scW3', { role: 'servicecenter', name: 'Portal SC', pincodesCovered: ['584203'], brandsAuthorized: ['makwell'] });
  await adminSet(env, 'serviceCenterProfiles/scW3', { status: 'ACTIVE' });
  const cust = await phoneSignIn('9000000177');
  const prof = await call('ensureCustomerProfile', { name: 'Meera' }, cust.idToken);
  assert.strictEqual(prof.phone10, '9000000177');
  assert.strictEqual((await adminGet(env, `users/${cust.uid}`)).role, 'customer');

  // An email-only account without a verified phone is refused.
  const plain = await emailSignUp('nophone@pe.test');
  await assert.rejects(() => call('ensureCustomerProfile', {}, plain.idToken), /phone-not-verified/);

  const contact = { name: 'Meera', address: '5 Park St', city: 'Raichur', state: 'Karnataka', pincode: '584203' };
  const reg = await call('registerProduct', { brand: 'MakWell', categoryId: 'geyser', category: 'Geyser', modelNo: 'G15', serialNumber: 'wf-port-1', purchaseDate: new Date().toISOString().slice(0, 10), ...contact }, cust.idToken);
  assert.match(reg.registrationId, /-Portal$/);
  await assert.rejects(() => call('registerProduct', { brand: 'MakWell', categoryId: 'geyser', category: 'Geyser', modelNo: 'G15', serialNumber: 'WF-PORT-1', purchaseDate: new Date().toISOString().slice(0, 10), ...contact }, cust.idToken), /already registered/);

  const w = await call('checkWarranty', { serial: 'WF-PORT-1' }, cust.idToken);
  assert.strictEqual(w.state, 'yours');
  const other = await phoneSignIn('9000000178');
  await call('ensureCustomerProfile', { name: 'Other' }, other.idToken);
  assert.strictEqual((await call('checkWarranty', { serial: 'WF-PORT-1' }, other.idToken)).state, 'registered_other');

  const bk = await call('bookService', { registrationId: reg.registrationId, requestType: 'service', issueDescription: 'Leaking', ...contact }, cust.idToken);
  await assert.rejects(() => call('bookService', { registrationId: reg.registrationId, requestType: 'service', issueDescription: 'x', ...contact }, other.idToken), /not registered to your account/);
  await waitFor('portal booking routed', () => adminGet(env, `centerRequests/route_${bk.requestId}`));
  await waitFor('portal booking tracked', () => adminGet(env, `customerTracking/${bk.requestId}`));

  // The customer reads their own records through the rules, not others'.
  const mine = env.authenticatedContext(cust.uid, { phone_number: '+919000000177' }).firestore();
  const theirs = env.authenticatedContext(other.uid, { phone_number: '+919000000178' }).firestore();
  await assertSucceeds(attempt(mine, 'get', `customerTracking/${bk.requestId}`));
  await assertFails(attempt(theirs, 'get', `customerTracking/${bk.requestId}`));
  await assertSucceeds(attempt(mine, 'list', ['productRegistrations', ['customerPhone', '==', '9000000177']]));

  // Anonymous website lookups go through publicLookup.
  const tr = await call('publicLookup', { type: 'track', ticket: bk.requestId, phone: '9000000177' });
  assert.strictEqual(tr.found, true);
  assert.strictEqual((await call('publicLookup', { type: 'track', ticket: bk.requestId, phone: '9000000999' })).found, false);
  const wl = await call('publicLookup', { type: 'warranty', phone: '9000000177' });
  assert.strictEqual(wl.registrations.length, 1);
  assert.ok(!JSON.stringify(wl).includes('Park St'), 'no address in public lookups');

  // Support ticket answered from Head Office.
  const sup = await call('supportTicket', { action: 'create', category: 'Warranty', subject: 'Leak', message: 'Still leaking', relatedTicketId: bk.requestId }, cust.idToken);
  await assert.rejects(() => call('supportTicket', { action: 'reply', ticketNo: sup.ticketNo, message: 'hi' }, other.idToken), /not your ticket/);
  const staff = await emailSignUp('support@pe.test');
  await adminSet(env, `users/${staff.uid}`, { role: 'superadmin', name: 'Support' });
  const rep = await call('supportTicket', { action: 'reply', ticketNo: sup.ticketNo, message: 'Technician will call' }, staff.idToken);
  assert.strictEqual(rep.status, 'awaiting_customer');
  const t = await adminGet(env, `supportTickets/${sup.ticketNo}`);
  assert.deepStrictEqual(t.messages.map((m) => m.from), ['customer', 'staff']);
});

test('security: portal functions refuse signed-out and non-customer callers, and lookups are rate limited', async () => {
  const contact = { name: 'X', address: '1 Rd', city: 'Raichur', state: 'Karnataka', pincode: '584101' };
  // Signed out.
  for (const [name, data] of [['ensureCustomerProfile', {}], ['registerProduct', { brand: 'MakWell', ...contact }],
    ['bookService', { requestType: 'installation', ...contact }], ['checkWarranty', { serial: 'ABCD-1234' }], ['supportTicket', { action: 'create' }]]) {
    await assert.rejects(() => call(name, data), /Sign in|unauthenticated|UNAUTHENTICATED/i, name + ' without sign-in');
  }
  // A staff account (email, no verified phone) cannot act as a customer.
  const staff = await emailSignUp('tech-sec@pe.test');
  await adminSet(env, `users/${staff.uid}`, { role: 'technician', name: 'Tech' });
  await assert.rejects(() => call('registerProduct', { brand: 'MakWell', categoryId: 'g', category: 'Geyser', modelNo: 'X', purchaseDate: '2026-01-01', ...contact }, staff.idToken), /phone-not-verified/);
  // A forged role in the request body changes nothing.
  const cust = await phoneSignIn('9000000190');
  await call('ensureCustomerProfile', { name: 'Sec', role: 'superadmin' }, cust.idToken);
  assert.strictEqual((await adminGet(env, `users/${cust.uid}`)).role, 'customer');
  // Staff replies need a Head Office account, not just any signed-in user.
  const sup = await call('supportTicket', { action: 'create', category: 'Other', subject: 'Sec', message: 'test' }, cust.idToken);
  await assert.rejects(() => call('supportTicket', { action: 'reply', ticketNo: sup.ticketNo, message: 'I am staff' }, staff.idToken), /phone-not-verified/);
  // Anonymous lookups: 25 per phone per hour, then refused.
  let refused = false;
  for (let i = 0; i < 30 && !refused; i++) {
    try { await call('publicLookup', { type: 'warranty', phone: '9000000191' }); } catch (e) { refused = /Too many/.test(e.message); }
  }
  assert.ok(refused, 'phone lookups are rate limited');
  await assert.rejects(() => call('publicLookup', { type: 'warranty', phone: '12' }), /10-digit/);
  await assert.rejects(() => call('publicLookup', { type: 'dump-all', phone: '9000000192' }), /Unknown lookup/);
});

// Phase 9 items 1-5 — one customer, start to routed ticket, through the real
// rules and functions: registration (warranty from the plan, serial locked),
// a dealer's lower-case duplicate of a serial, booking from the registration,
// automatic routing to the covering center, intake warranty read, and the
// records the Customer 360 screen reads all pointing at each other.
test('phase 9: register -> warranty -> book -> route, one serial one registration, records link up', async () => {
  await adminSet(env, 'users/scP9', { role: 'servicecenter', name: 'Phase9 SC', pincodesCovered: ['584209'], brandsAuthorized: ['makwell'] });
  await adminSet(env, 'serviceCenterProfiles/scP9', { status: 'ACTIVE' });
  await adminSet(env, 'warrantyPlans/wpP9', { brandId: 'makwell', categoryId: 'geyser', status: 'active',
    components: [{ componentName: 'Full Product', durationYears: 2 }, { componentName: 'Heating Element', durationYears: 5 }] });
  const cust = await phoneSignIn('9000000211');
  await call('ensureCustomerProfile', { name: 'Nandini' }, cust.idToken);
  const other = await phoneSignIn('9000000212');
  await call('ensureCustomerProfile', { name: 'Other' }, other.idToken);

  const contact = { name: 'Nandini', address: '9 Lake Rd', city: 'Raichur', state: 'Karnataka', pincode: '584209' };
  const bought = new Date(); bought.setMonth(bought.getMonth() - 18);
  const form = { brand: 'MakWell', categoryId: 'geyser', category: 'Geyser', modelNo: 'G15', serialNumber: ' p9-emu-1 ', purchaseDate: bought.toISOString().slice(0, 10), ...contact };
  const reg = await call('registerProduct', form, cust.idToken);
  const regDoc = (await adminQuery(env, 'productRegistrations', ['registrationId', '==', reg.registrationId]))[0];
  assert.strictEqual(regDoc.serialNumber, 'P9-EMU-1');
  assert.strictEqual(regDoc.warrantyMonths, 24, 'whole-product cover comes from the plan');
  assert.strictEqual(regDoc.customerPhone, '9000000211');
  assert.strictEqual((await adminGet(env, 'registrationSerials/P9-EMU-1')).registrationId, reg.registrationId);

  // Same serial from another customer, and from the same customer in a different spelling: refused.
  await assert.rejects(() => call('registerProduct', { ...form, serialNumber: 'P9-emu-1' }, other.idToken), /already registered/);
  await assert.rejects(() => call('registerProduct', { ...form, serialNumber: 'p9-EMU-1' }, cust.idToken), /already registered this serial/);

  // A dealer enters a serial in lower case; the server stores it in the standard form and locks it.
  const dealerRegId = `PE-REG-${ymd()}-9001`;
  await assertSucceeds(write('d1', 'create', 'productRegistrations/p9dealer', {
    registrationId: dealerRegId, dealerUid: 'd1', customerName: 'Walk-in', customerPhone: '9000000299', product: 'MakWell Geyser', serialNumber: ' p9-dealer-77 ',
    purchaseDate: new Date().toISOString().slice(0, 10), warrantyMonths: 12, status: 'active', createdAt: '__ST__'
  }));
  const dealerDoc = await waitFor('dealer serial standardised', async () => { const d = await adminGet(env, 'productRegistrations/p9dealer'); return d.serialNumber === 'P9-DEALER-77' && d; });
  assert.ok(dealerDoc.serialCheck, 'serial checked');
  await waitFor('dealer serial locked', () => adminGet(env, 'registrationSerials/P9-DEALER-77'));
  await assert.rejects(() => call('registerProduct', { ...form, serialNumber: 'p9-dealer-77' }, cust.idToken), /already registered/);

  // Booking from the registration: product details come from it; routed by pincode; warranty read at intake.
  const bk = await call('bookService', { registrationId: reg.registrationId, requestType: 'service', issueDescription: 'No hot water', ...contact, pincode: '584209' }, cust.idToken);
  const routed = await waitFor('routed to the covering center', () => adminGet(env, `centerRequests/route_${bk.requestId}`));
  assert.strictEqual(routed.serviceCenterUid, 'scP9');
  assert.strictEqual(routed.linkedRegistrationId, reg.registrationId);
  assert.strictEqual(routed.serialNumber, 'P9-EMU-1');
  const pub = await waitFor('intake warranty read', async () => { const d = await adminGet(env, `publicServiceRequests/${bk.requestId}`); return d.intakeWarranty && d.status === 'assigned_to_center' && d; });
  assert.strictEqual(pub.intakeWarranty.status, 'in_warranty', '18 months into a 2-year cover');
  assert.strictEqual(pub.routing.method, 'pincode');
  await waitFor('customer tracking', () => adminGet(env, `customerTracking/${bk.requestId}`));

  // Customer 360: every record for this phone, linked to the same registration and ticket.
  const byPhone = async (coll, field = 'customerPhone') => adminQuery(env, coll, [field, '==', '9000000211']);
  const [regs, pubs, centers, tracks] = await Promise.all([byPhone('productRegistrations'), byPhone('publicServiceRequests'), byPhone('centerRequests'), byPhone('customerTracking')]);
  assert.deepStrictEqual([regs.length, pubs.length, centers.length, tracks.length], [1, 1, 1, 1]);
  assert.strictEqual(pubs[0].linkedRegistrationId, regs[0].registrationId);
  assert.strictEqual(centers[0].requestId, tracks[0].ticketId);
  assert.strictEqual(centers[0].sourceRequestId, pubs[0].requestId);
});

// Phase 9 items 6-10: a second open request for the same part on the same
// job is flagged for Warehouse by the server; the flag cannot be set (or
// cleared) from a browser.
test('phase 9: spare requests — duplicate on one job is flagged by the server, flag not client-writable', async () => {
  await adminSet(env, 'users/scP9b', { role: 'servicecenter', name: 'P9b SC' });
  await adminSet(env, 'users/tP9b', { role: 'technician', name: 'P9b Tech', linkedServiceCenterUid: 'scP9b' });
  await adminSet(env, 'centerRequests/crP9b', { requestId: 'PE-CR-P9B', serviceCenterUid: 'scP9b', technicianUid: 'tP9b', status: 'in_progress', category: 'Geyser' });
  const req = (n) => ({ requestId: `PE-SR-P9B-${n}`, partId: 'spP9b', item: 'Heating Element', quantity: 1, status: 'new', sourceJobId: 'crP9b', sourceJobCollection: 'centerRequests', requestedByUid: 'tP9b', createdAt: '__ST__' });
  await assertFails(write('tP9b', 'create', 'spareRequests/srP9b0', { ...req(0), possibleDuplicateOf: [] }), 'a browser cannot set the duplicate flag');
  await assertSucceeds(write('tP9b', 'create', 'spareRequests/srP9b1', req(1)));
  const first = await waitFor('first request checked', async () => { const d = await adminGet(env, 'spareRequests/srP9b1'); return d.possibleDuplicateOf && d; });
  assert.deepStrictEqual(first.possibleDuplicateOf, []);
  await assertSucceeds(write('tP9b', 'create', 'spareRequests/srP9b2', req(2)));
  const second = await waitFor('duplicate flagged', async () => { const d = await adminGet(env, 'spareRequests/srP9b2'); return d.possibleDuplicateOf && d; });
  assert.deepStrictEqual(second.possibleDuplicateOf, ['PE-SR-P9B-1']);
});

// Phase 9 items 11-18: the customer's timeline is built by the server as the
// ticket moves, and a business ID used twice is flagged.
test('phase 9: timeline events follow the ticket; a repeated business id is flagged', async () => {
  await adminSet(env, 'users/scP9c', { role: 'servicecenter', name: 'P9c SC', pincodesCovered: ['584233'], brandsAuthorized: ['makwell'] });
  await adminSet(env, 'serviceCenterProfiles/scP9c', { status: 'ACTIVE' });
  const cust = await phoneSignIn('9000000221');
  await call('ensureCustomerProfile', { name: 'Timeline' }, cust.idToken);
  const bk = await call('bookService', { requestType: 'service', issueDescription: 'No hot water', brand: 'MakWell', category: 'Geyser', name: 'Timeline', address: '1 Lake Rd', city: 'Raichur', state: 'Karnataka', pincode: '584233' }, cust.idToken);
  await waitFor('routed', () => adminGet(env, `centerRequests/route_${bk.requestId}`));
  const track = await waitFor('timeline has routing', async () => { const d = await adminGet(env, `customerTracking/${bk.requestId}`); return d && Array.isArray(d.events) && d.events.some((e) => e.type === 'routing') && d; });
  assert.ok(track.events.some((e) => e.label === 'Request received'));
  assert.ok(track.events.every((e) => e.at && e.type && e.label));
  assert.ok(!JSON.stringify(track.events).includes('scP9c'), 'no staff ids in the customer\'s timeline');
  // The same business id on two records is flagged (the original is left alone).
  const id = `PE-SR-${ymd()}-9101-Technician`;
  await adminSet(env, 'users/tP9c', { role: 'technician', name: 'P9c Tech' });
  const sr = (n) => ({ requestId: id, partId: 'x', item: 'Part', quantity: 1, status: 'new', requestedByUid: 'tP9c', createdAt: '__ST__' });
  await assertSucceeds(write('tP9c', 'create', 'spareRequests/idDup1', sr(1)));
  await waitFor('first id checked', async () => { const d = await adminGet(env, 'spareRequests/idDup1'); return d.possibleDuplicateOf && d; });
  await assertSucceeds(write('tP9c', 'create', 'spareRequests/idDup2', sr(2)));
  const dup = await waitFor('duplicate id flagged', async () => { const d = await adminGet(env, 'spareRequests/idDup2'); return d.idCheck && d; });
  assert.strictEqual(dup.idCheck.status, 'duplicate');
  assert.deepStrictEqual(dup.idCheck.of, ['idDup1']);
  assert.ok(!(await adminGet(env, 'spareRequests/idDup1')).idCheck);
  // A browser cannot set or clear the flag.
  await assertFails(write('tP9c', 'create', 'spareRequests/idDup3', { ...sr(3), requestId: id + 'x', idCheck: { status: 'ok' } }));
});
