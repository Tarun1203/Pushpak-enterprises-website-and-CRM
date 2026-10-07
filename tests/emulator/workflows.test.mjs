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

  // Assigning someone who is not on the roster is reverted by the server.
  await assertSucceeds(write('scW2', 'update', T, { technicianUid: 'tOut', technicianName: 'Not on roster', status: 'assigned' }));
  const rejected = await waitFor('assignment reverted', async () => { const d = await adminGet(env, T); return d.assignmentRejected && d; });
  assert.ok(!rejected.technicianUid, 'technician removed again');
  assert.match(rejected.assignmentRejected.reason, /roster/);

  await assertSucceeds(write('scW2', 'update', T, { technicianUid: 'tW2', technicianName: 'Tech W2', status: 'assigned' }));
  await sleep(2500);
  assert.strictEqual((await adminGet(env, T)).technicianUid, 'tW2', 'roster technician stays assigned');

  // The technician cannot jump straight to completed.
  await assertSucceeds(write('tW2', 'update', T, { status: 'accepted', updatedAt: '__ST__' }));
  await assertSucceeds(write('tW2', 'update', T, { status: 'completed', closureCode: 'X', actionTaken: 'X', partsUsedNotes: 'none', closedByUid: 'tW2', closedAt: '__ST__' }));
  const lc = await waitFor('illegal step reverted', async () => { const d = await adminGet(env, T); return d.lifecycleRejected && d.status === 'accepted' && d; });
  assert.match(lc.lifecycleRejected.reason, /can't move/);
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
