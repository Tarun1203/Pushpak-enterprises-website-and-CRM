// Shared setup for the emulator suites: the test environment, the seed
// data every rules/role test starts from, and small helpers.
import fs from 'node:fs';
import path from 'node:path';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where, serverTimestamp, Timestamp
} from 'firebase/firestore';

export const ROOT = path.resolve(import.meta.dirname, '../..');
export const PROJECT = process.env.GCLOUD_PROJECT || 'demo-pushpak';
export { assertSucceeds, assertFails, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where, serverTimestamp, Timestamp };

export async function makeEnv({ storage = false } = {}) {
  const cfg = { projectId: PROJECT, firestore: { rules: fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8') } };
  if (storage) cfg.storage = { rules: fs.readFileSync(path.join(ROOT, 'storage.rules'), 'utf8') };
  return initializeTestEnvironment(cfg);
}

// '__ST__' anywhere in a payload becomes serverTimestamp() (rules often
// require createdAt == request.time).
export function hydrate(v) {
  if (v === '__ST__') return serverTimestamp();
  if (Array.isArray(v)) return v.map(hydrate);
  if (v && typeof v === 'object' && !(v instanceof Timestamp)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, hydrate(x)]));
  return v;
}

const DAY = 86400000;
export const ts = (ms) => Timestamp.fromMillis(ms);
export const past = (days) => ts(Date.now() - days * DAY);
export const future = (days) => ts(Date.now() + days * DAY);

// Accounts used throughout. uid -> users doc.
export const USERS = {
  sa: { role: 'superadmin', name: 'Super Admin', email: 'sa@pe.test' },
  wh: { role: 'warehouse', name: 'Warehouse', email: 'wh@pe.test' },
  sc1: { role: 'servicecenter', name: 'Center One', email: 'sc1@pe.test', pincodesCovered: ['584101'] },
  sc2: { role: 'servicecenter', name: 'Center Two', email: 'sc2@pe.test' },
  t1: { role: 'technician', name: 'Tech One', linkedServiceCenterUid: 'sc1', skills: ['geyser'] },
  t2: { role: 'technician', name: 'Tech Two' },
  d1: { role: 'dealer', name: 'Direct Dealer', distributionType: 'direct' },
  d2: { role: 'dealer', name: 'Sub Dealer', distributionType: 'underDistributor', distributorUid: 'x1' },
  x1: { role: 'distributor', name: 'Distributor One' },
  x2: { role: 'distributor', name: 'Distributor Two' },
  c1: { role: 'customer', name: 'Asha', phone10: '9000000001' },
  c2: { role: 'customer', name: 'Ravi', phone10: '9000000002' },
  // Accounts switched off by Head Office / suspended / deactivated: no access to anything but their own record.
  tOff: { role: 'technician', name: 'Suspended Tech', linkedServiceCenterUid: 'sc1', accessDisabled: true },
  scOff: { role: 'servicecenter', name: 'Inactive Center', accessDisabled: true },
  saOff: { role: 'superadmin', name: 'Disabled Admin', accessDisabled: true },
  cOff: { role: 'customer', name: 'Disabled Customer', phone10: '9000000003', accessDisabled: true }
};

export function seedDocs() {
  const now = Date.now();
  return {
    ...Object.fromEntries(Object.entries(USERS).map(([uid, u]) => [`users/${uid}`, u])),
    'serviceJobs/jOff': { jobId: 'PE-JOB-OFF', technicianUid: 'tOff', status: 'assigned', customerPhone: '9000000003' },
    'centerRequests/crOff': { requestId: 'PE-CR-OFF', serviceCenterUid: 'scOff', status: 'new', customerPhone: '9000000003' },
    'productRegistrations/regOff': { registrationId: 'PE-REG-OFF', customerPhone: '9000000003', serialNumber: 'OFF-1', purchaseDate: '2026-01-01', warrantyMonths: 12 },
    'serviceJobs/j1': { jobId: 'PE-JOB-1', technicianUid: 't1', status: 'assigned', customerPhone: '9000000001' },
    'serviceJobs/j2': { jobId: 'PE-JOB-2', technicianUid: 't2', status: 'closed' },
    'centerRequests/cr1': { requestId: 'PE-CR-1', serviceCenterUid: 'sc1', technicianUid: 't1', status: 'assigned', customerPhone: '9000000001', customerName: 'Asha', category: 'Geyser' },
    'centerRequests/cr2': { requestId: 'PE-CR-2', serviceCenterUid: 'sc2', status: 'new', customerPhone: '9000000002' },
    'centerRequests/cr3': { requestId: 'PE-CR-3', serviceCenterUid: 'sc2', status: 'closed', customerPhone: '9000000002' },
    'centerTechnicians/ct1': { serviceCenterUid: 'sc1', technicianUid: 't1', name: 'Tech One', technicianCode: 'TC-0001', documents: [], leaveRecords: [] },
    'serviceCenterProfiles/sc1': { status: 'ACTIVE', serviceCenterCode: 'SC-0001', displayName: 'Center One' },
    'productRegistrations/r1': { registrationId: 'PE-REG-1', customerPhone: '9000000001', dealerUid: 'd1', serialNumber: 'SN-1', warrantyMonths: 12 },
    'productRegistrations/r2': { registrationId: 'PE-REG-2', customerPhone: '9000000002', serialNumber: 'SN-2', warrantyMonths: 12 },
    'publicServiceRequests/PE-SVC-1': { requestId: 'PE-SVC-1', customerPhone: '9000000001', customerName: 'Asha', status: 'new' },
    'publicServiceRequests/PE-SVC-2': { requestId: 'PE-SVC-2', customerPhone: '9000000002', customerName: 'Ravi', status: 'new' },
    'publicTicketStatus/PE-CR-1': { ticketId: 'PE-CR-1', customerPhone: '9000000001', status: 'completed' },
    'publicTicketStatus/PE-CR-2': { ticketId: 'PE-CR-2', customerPhone: '9000000002', status: 'in_progress' },
    'customerTracking/PE-SVC-1': { ticketId: 'PE-SVC-1', customerPhone: '9000000001', status: 'new', history: [] },
    'customerTracking/PE-SVC-2': { ticketId: 'PE-SVC-2', customerPhone: '9000000002', status: 'new', history: [] },
    'supportTickets/PE-SUP-1': { ticketNo: 'PE-SUP-1', customerPhone: '9000000001', status: 'open', messages: [] },
    'supportTickets/PE-SUP-2': { ticketNo: 'PE-SUP-2', customerPhone: '9000000002', status: 'open', messages: [] },
    'serviceFeedback/PE-CR-9': { ticketId: 'PE-CR-9', customerPhone: '9000000001', rating: 5, serviceCenterUid: 'sc1', technicianUid: 't1' },
    'products/p1': { name: 'Geyser' },
    'productModels/m1': { productId: 'p1', modelNumber: '25L', gstRate: 18, status: 'active' },
    'priceLists/company_default-dealer_m1': { seller: 'company', buyer: 'default-dealer', modelId: 'm1', price: 5000 },
    'priceLists/company_default-distributor_m1': { seller: 'company', buyer: 'default-distributor', modelId: 'm1', price: 4500 },
    'priceLists/company_d1_m1': { seller: 'company', buyer: 'd1', modelId: 'm1', price: 4900 },
    'priceLists/x1_default_m1': { seller: 'x1', buyer: 'default', modelId: 'm1', price: 5200 },
    'priceLists/x1_d2_m1': { seller: 'x1', buyer: 'd2', modelId: 'm1', price: 5100 },
    'dealerOrders/o1': { orderId: 'DO-1', dealerUid: 'd1', distributorUid: '', status: 'placed', lines: [{ modelId: 'm1', qty: 2 }], pricing: { status: 'ok' }, totals: { total: 10000 } },
    'dealerOrders/o2': { orderId: 'DO-2', dealerUid: 'd2', distributorUid: 'x1', status: 'placed', lines: [{ modelId: 'm1', qty: 1 }], pricing: { status: 'ok' }, totals: { total: 5000 } },
    'dealerOrders/o3': { orderId: 'DO-3', dealerUid: 'd1', distributorUid: '', status: 'placed', lines: [{ modelId: 'm1', qty: 40 }], pricing: { status: 'ok' }, totals: { total: 200000 } },
    'dealerOrders/o4': { orderId: 'DO-4', dealerUid: 'd1', distributorUid: '', status: 'placed', lines: [{ modelId: 'm1', qty: 1 }], pricing: { status: 'pending' } },
    'distributorOrders/q1': { orderId: 'XO-1', distributorUid: 'x1', status: 'placed', lines: [{ modelId: 'm1', qty: 1 }], pricing: { status: 'ok' }, totals: { total: 4500 } },
    'tradeAccounts/d1': { creditLimit: 50000, outstanding: 0, paymentTermsDays: 30 },
    'tradeAccounts/x1': { creditLimit: 100000, outstanding: 0, oldestUnpaidDue: past(5) },
    'invoices/i1': { buyerUid: 'd1', invoiceNo: 'PE/2026-27/00001' },
    'invoices/i2': { buyerUid: 'x1', invoiceNo: 'PE/2026-27/00002' },
    'ledgerEntries/l1': { accountUid: 'd1' },
    'tradePayments/tp1': { accountUid: 'd1', amount: 100 },
    'productStock/warehouse_m1': { location: 'warehouse', modelId: 'm1', onHand: 5 },
    'productStock/dist_x1_m1': { location: 'dist_x1', modelId: 'm1', onHand: 2 },
    'unitSerials/SN-1': { serial: 'SN-1', location: 'dist_x1', soldToUid: 'x1', status: 'delivered' },
    'unitSerials/SN-9': { serial: 'SN-9', location: 'warehouse', status: 'in_stock' },
    'claims/cl1': { claimantUid: 't1', claimantType: 'technician', status: 'submitted', amount: 500, lock: { status: 'locked' }, claimCheck: { verified: 500 } },
    'claims/cl2': { claimantUid: 't1', claimantType: 'technician', status: 'verified', amount: 500, approvedAmount: 500, verifiedByUid: 'wh' },
    'claims/cl3': { claimantUid: 't1', claimantType: 'technician', status: 'verified', amount: 500, approvedAmount: 500, verifiedByUid: 'sa' },
    'walletTransactions/w1': { technicianUid: 't1', amount: 300, status: 'unclaimed' },
    'inventory/inv_wh': { location: 'warehouse', partId: 'sp1', quantity: 10 },
    'inventory/inv_t1': { location: 'technician', technicianUid: 't1', partId: 'sp1', quantity: 2 },
    'inventory/inv_sc2': { location: 'servicecenter', serviceCenterUid: 'sc2', partId: 'sp1', quantity: 4 },
    'stockMovements/mv1': { type: 'transfer', technicianUid: 't1', quantity: 1, createdAt: past(1) },
    'spareParts/sp1': { name: 'Thermostat', price: 250 },
    'serviceChargeRates/default_geyser_repair_flat': { scope: 'default', amount: 300 },
    'serviceChargeRates/center_sc2_geyser_repair_flat': { scope: 'center', serviceCenterUid: 'sc2', amount: 350 },
    'changeRequests/ch1': { requestedByUid: 'wh', status: 'pending', kind: 'spare_price', targetId: 'sp1', payload: { price: 300 } },
    'changeRequests/ch2': { requestedByUid: 'sa', status: 'pending', kind: 'spare_price', targetId: 'sp1', payload: { price: 310 } },
    'notifications/n1': { recipientType: 'uid', recipientValue: 't1', title: 'x', message: 'y', read: false },
    'notifications/n2': { recipientType: 'role', recipientValue: 'superadmin', title: 'x', message: 'y', read: false },
    'rmaRequests/rm1': { rmaId: 'PE-RMA-1', status: 'requested' },
    'returns/rt1': { serviceCenterUid: 'sc1', status: 'awaiting_return' },
    'settings/companyProfile': { legalName: 'Pushpak', gstin: '29AAAAA0000A1Z5' },
    'counters/enquiry-202610': { value: 5 },
    'counters/servicecenter-master': { value: 3 },
    'counters/sparerequest-202610': { value: 2 },
    'auditLogs/a1': { action: 'x', source: 'server' },
    'lookupLimits/x': { count: 1 },
    'siteContent/landing': { heroHeadline: 'Hi' }
  };
}

export async function seed(env, docs = seedDocs()) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await Promise.all(Object.entries(docs).map(([p, d]) => setDoc(doc(db, p), d)));
  });
}
export async function reset(env, docs) {
  await env.clearFirestore();
  await seed(env, docs);
}

// A Firestore instance acting as `who` ('anon' = signed out).
export function dbAs(env, who, token = {}) {
  if (who === 'anon') return env.unauthenticatedContext().firestore();
  const u = USERS[who];
  const t = { ...token };
  if (u && u.email && !t.email) t.email = u.email;
  if (u && u.phone10 && !t.phone_number) t.phone_number = '+91' + u.phone10;
  return env.authenticatedContext(who, t).firestore();
}

// Runs one access case. op: get | list | create | set | update | delete | add
export async function attempt(db, op, target, data) {
  const payload = hydrate(data);
  switch (op) {
    case 'get': return getDoc(doc(db, target));
    case 'list': {
      const [coll, ...conds] = target;
      return getDocs(conds.length ? query(collection(db, coll), ...conds.map((c) => where(...c))) : collection(db, coll));
    }
    case 'create': case 'set': return setDoc(doc(db, target), payload);
    case 'merge': return setDoc(doc(db, target), payload, { merge: true });
    case 'update': return updateDoc(doc(db, target), payload);
    case 'delete': return deleteDoc(doc(db, target));
    case 'add': return addDoc(collection(db, target), payload);
    default: throw new Error('unknown op ' + op);
  }
}

// Read as admin (rules off) — for checking what a write did.
export async function adminGet(env, p) {
  let out;
  await env.withSecurityRulesDisabled(async (ctx) => { const s = await getDoc(doc(ctx.firestore(), p)); out = s.exists() ? s.data() : null; });
  return out;
}
export async function adminQuery(env, coll, ...conds) {
  let out = [];
  await env.withSecurityRulesDisabled(async (ctx) => {
    const s = await getDocs(conds.length ? query(collection(ctx.firestore(), coll), ...conds.map((c) => where(...c))) : collection(ctx.firestore(), coll));
    out = s.docs.map((d) => ({ id: d.id, ...d.data() }));
  });
  return out;
}
export async function adminSet(env, p, data, merge = false) {
  await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), p), data, merge ? { merge: true } : undefined); });
}
