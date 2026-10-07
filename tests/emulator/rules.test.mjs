// Phase 5 item 2 — Firestore rules tests. Field-level protection, status
// transitions and validation on writes, run against the real rules in the
// Firestore emulator. Seed data and accounts: env.mjs.
import { runCases } from './runner.mjs';
const A = 'allow', D = 'deny';
const ST = '__ST__';

runCases('Rules: user accounts and roles', [
  ['t1', 'update', 'users/t1', { name: 'New Name' }, A, 'self-edit name'],
  ['t1', 'update', 'users/t1', { role: 'superadmin' }, D, 'self-promote'],
  ['t1', 'update', 'users/t1', { skills: ['tv'] }, D, 'skills are Head Office\'s'],
  ['t1', 'update', 'users/t1', { linkedServiceCenterUid: 'sc2' }, D, 'cannot move self to another center'],
  ['sc1', 'update', 'users/sc1', { pincodesCovered: ['560001'] }, D, 'coverage is admin-only'],
  ['d2', 'update', 'users/d2', { distributorUid: 'x2' }, D, 'cannot switch distributor'],
  ['wh', 'create', 'users/newtech', { role: 'technician', name: 'N' }, A],
  ['wh', 'create', 'users/newsa', { role: 'superadmin', name: 'N' }, D, 'Warehouse cannot mint Super Admin'],
  ['sa', 'create', 'users/newsa', { role: 'superadmin', name: 'N' }, A],
  ['wh', 'update', 'users/sa', { name: 'X' }, D, 'Warehouse cannot touch Super Admin'],
  ['wh', 'update', 'users/t2', { role: 'superadmin' }, D],
  ['sc1', 'create', 'users/newtech', { role: 'technician' }, D],
  ['c1', 'create', 'users/c9', { role: 'customer', phone10: '9000000009' }, D, 'customer profiles come from the server'],
  ['sc1', 'update', 'users/t2', { linkedServiceCenterUid: 'sc1' }, A, 'claim an unlinked technician'],
  ['sc2', 'update', 'users/t1', { linkedServiceCenterUid: 'sc2' }, D, 'cannot poach a linked technician'],
  ['sc1', 'update', 'users/t1', { linkedServiceCenterUid: null }, A, 'release own technician'],
  ['sc1', 'update', 'users/t2', { linkedServiceCenterUid: 'sc1', name: 'X' }, D, 'only the link field']
]);

runCases('Rules: counters', [
  ['anon', 'create', 'counters/enquiry-202611', { value: 1 }, A, 'website counter starts at 1'],
  ['anon', 'create', 'counters/enquiry-202612', { value: 7 }, D, 'cannot start elsewhere'],
  ['anon', 'update', 'counters/enquiry-202610', { value: 6 }, A, '+1'], ['anon', 'update', 'counters/enquiry-202610', { value: 50 }, D, 'jump'],
  ['anon', 'create', 'counters/sparerequest-202611', { value: 1 }, D, 'staff counter'], ['t1', 'create', 'counters/sparerequest-202611', { value: 1 }, A],
  ['t1', 'update', 'counters/sparerequest-202610', { value: 3 }, A], ['sa', 'update', 'counters/servicecenter-master', { value: 4 }, D, 'codes are server-issued'],
  ['anon', 'update', 'counters/enquiry-202610', { value: 6, extra: 1 }, D, 'extra field']
]);

runCases('Rules: service tickets', [
  ['t1', 'update', 'serviceJobs/j1', { status: 'accepted' }, A],
  ['t1', 'update', 'serviceJobs/j1', { warrantyStatus: 'in_warranty' }, D, 'warranty verdict is server-decided'],
  ['t1', 'update', 'serviceJobs/j1', { billingTotal: 0 }, D], ['t1', 'update', 'serviceJobs/j1', { customerFeedback: { rating: 5 } }, D],
  ['t1', 'create', 'serviceJobs/jn', { jobId: 'PE-JOB-N', technicianUid: 't1', status: 'new' }, A],
  ['t1', 'create', 'serviceJobs/jn', { jobId: 'PE-JOB-N', technicianUid: 't1', status: 'new', serviceCharge: 999 }, D],
  ['t1', 'create', 'serviceJobs/jn', { jobId: 'PE-JOB-N', technicianUid: 't2', status: 'new' }, D, 'for someone else'],
  ['t1', 'update', 'centerRequests/cr1', { status: 'accepted', updatedAt: ST }, A, 'assigned technician advances'],
  ['t1', 'update', 'centerRequests/cr1', { status: 'completed', closureCode: 'OK', actionTaken: 'Fixed', partsUsedNotes: 'none', closedByUid: 't1', closedAt: ST }, A],
  ['t1', 'update', 'centerRequests/cr1', { technicianUid: 't2' }, D, 'cannot reassign'],
  ['t1', 'update', 'centerRequests/cr1', { customerName: 'Changed' }, D, 'customer details'],
  ['t1', 'update', 'centerRequests/cr1', { warrantyStatus: 'in_warranty' }, D],
  ['sc1', 'update', 'centerRequests/cr1', { technicianUid: 't1', scheduledDate: '2026-12-01' }, A, 'own center edits'],
  ['sc1', 'update', 'centerRequests/cr1', { warrantyStatus: 'in_warranty' }, D, 'billing is server-decided'],
  ['sc1', 'update', 'centerRequests/cr1', { billingTotal: 1 }, D], ['sc1', 'update', 'centerRequests/cr1', { claimId: 'CL-1' }, D],
  ['wh', 'update', 'centerRequests/cr1', { billingStatus: 'collected' }, D, 'not even Head Office writes billing directly'],
  ['sc1', 'update', 'centerRequests/cr1', { billingRequest: { type: 'customer', byUid: 'sc1', requestedAt: ST } }, A, 'files a billing request'],
  ['sc1', 'update', 'centerRequests/cr1', { billingRequest: { type: 'customer', byUid: 't1', requestedAt: ST } }, D, 'in someone else\'s name'],
  ['sc2', 'update', 'centerRequests/cr1', { status: 'closed' }, D],
  ['sc1', 'create', 'centerRequests/crn', { requestId: 'PE-CR-N', serviceCenterUid: 'sc1', status: 'new' }, A],
  ['sc1', 'create', 'centerRequests/crn', { requestId: 'PE-CR-N', serviceCenterUid: 'sc2', status: 'new' }, D, 'for another center'],
  ['sc1', 'create', 'centerRequests/crn', { requestId: 'PE-CR-N', serviceCenterUid: 'sc1', status: 'new', intakeWarranty: { status: 'in' } }, D, 'server-only intake']
]);

runCases('Rules: roster and center profile', [
  ['sc1', 'update', 'centerTechnicians/ct1', { phone: '9876500000' }, A],
  ['sc1', 'update', 'centerTechnicians/ct1', { technicianCode: 'TC-9999' }, D, 'code is server-issued'],
  ['sc1', 'create', 'centerTechnicians/ctn', { serviceCenterUid: 'sc1', name: 'N', technicianCode: 'TC-5' }, D],
  ['sc1', 'create', 'centerTechnicians/ctn', { serviceCenterUid: 'sc1', name: 'N' }, A],
  ['t1', 'update', 'centerTechnicians/ct1', { city: 'Raichur' }, A, 'own personal fields'],
  ['t1', 'update', 'centerTechnicians/ct1', { serviceCenterUid: 'sc2' }, D],
  ['t1', 'update', 'centerTechnicians/ct1', { leaveRecords: [{ status: 'PENDING', from: '2026-12-01' }] }, A, 'apply for leave'],
  ['t1', 'update', 'centerTechnicians/ct1', { leaveRecords: [{ status: 'APPROVED', from: '2026-12-01' }] }, D, 'self-approve leave'],
  ['t1', 'update', 'centerTechnicians/ct1', { documents: [{ docType: 'Aadhaar', verified: false }] }, A],
  ['t1', 'update', 'centerTechnicians/ct1', { documents: [{ docType: 'Aadhaar', verified: true }] }, D, 'self-verify document'],
  ['sc1', 'update', 'serviceCenterProfiles/sc1', { displayName: 'New name' }, A],
  ['sc1', 'update', 'serviceCenterProfiles/sc1', { status: 'INACTIVE' }, D, 'status is Head Office\'s'],
  ['sc1', 'update', 'serviceCenterProfiles/sc1', { brandAuthorizations: ['all'] }, D],
  ['sc1', 'update', 'serviceCenterProfiles/sc1', { serviceCenterCode: 'SC-9' }, D],
  ['wh', 'update', 'serviceCenterProfiles/sc1', { status: 'INACTIVE' }, A],
  ['sc2', 'create', 'serviceCenterProfiles/sc2', { displayName: 'Two' }, A],
  ['sc2', 'create', 'serviceCenterProfiles/sc2', { displayName: 'Two', status: 'ACTIVE' }, D, 'cannot activate itself']
]);

runCases('Rules: dealer and distributor orders', [
  ['d1', 'create', 'dealerOrders/on', { orderId: 'DO-N', dealerUid: 'd1', lines: [{ modelId: 'm1', qty: 1 }], status: 'placed', distributorUid: '', createdAt: ST }, A],
  ['d1', 'create', 'dealerOrders/on', { orderId: 'DO-N', dealerUid: 'd1', lines: [{ modelId: 'm1', qty: 1 }], status: 'placed', distributorUid: '', createdAt: ST, totals: { total: 1 } }, D, 'prices are server-set'],
  ['d1', 'create', 'dealerOrders/on', { orderId: 'DO-N', dealerUid: 'd1', lines: [{ modelId: 'm1', qty: 1 }], status: 'confirmed', distributorUid: '', createdAt: ST }, D, 'self-approved'],
  ['d1', 'create', 'dealerOrders/on', { orderId: 'DO-N', dealerUid: 'd1', lines: [{ modelId: 'm1', qty: 1 }], status: 'placed', distributorUid: 'x1', createdAt: ST }, D, 'direct dealer picks a distributor'],
  ['d2', 'create', 'dealerOrders/on', { orderId: 'DO-N', dealerUid: 'd2', lines: [{ modelId: 'm1', qty: 1 }], status: 'placed', distributorUid: 'x1', createdAt: ST }, A, 'to its own distributor'],
  ['d2', 'create', 'dealerOrders/on', { orderId: 'DO-N', dealerUid: 'd2', lines: [{ modelId: 'm1', qty: 1 }], status: 'placed', distributorUid: '', createdAt: ST }, D, 'skips its distributor'],
  ['d1', 'create', 'dealerOrders/on', { orderId: 'DO-N', dealerUid: 'd1', lines: [], status: 'placed', distributorUid: '', createdAt: ST }, D, 'no lines'],
  ['t1', 'create', 'dealerOrders/on', { orderId: 'DO-N', dealerUid: 't1', lines: [{ modelId: 'm1', qty: 1 }], status: 'placed', distributorUid: '', createdAt: ST }, D, 'not a dealer'],
  ['d1', 'update', 'dealerOrders/o1', { status: 'cancelled', updatedAt: ST }, A, 'buyer cancels while placed'],
  ['d1', 'update', 'dealerOrders/o1', { status: 'confirmed' }, D, 'buyer approves own'],
  ['d1', 'update', 'dealerOrders/o1', { totals: { total: 1 } }, D],
  ['wh', 'update', 'dealerOrders/o1', { status: 'confirmed', updatedAt: ST }, A, 'within credit limit'],
  ['wh', 'update', 'dealerOrders/o3', { status: 'confirmed', updatedAt: ST }, D, 'over credit limit'],
  ['wh', 'update', 'dealerOrders/o3', { status: 'confirmed', creditOverride: true, statusNote: 'Owner approved', updatedAt: ST }, D, 'Warehouse cannot override credit'],
  ['sa', 'update', 'dealerOrders/o3', { status: 'confirmed', creditOverride: true, statusNote: 'Owner approved', updatedAt: ST }, A, 'Super Admin override with a reason'],
  ['sa', 'update', 'dealerOrders/o3', { status: 'confirmed', creditOverride: true, statusNote: 'ok', updatedAt: ST }, D, 'reason too short'],
  ['wh', 'update', 'dealerOrders/o4', { status: 'confirmed', updatedAt: ST }, D, 'not priced yet'],
  ['wh', 'update', 'dealerOrders/o1', { status: 'dispatched' }, D, 'skips approval'],
  ['wh', 'update', 'dealerOrders/o1', { status: 'rejected', statusNote: 'Out of range', updatedAt: ST }, A],
  ['x1', 'update', 'dealerOrders/o2', { status: 'confirmed', updatedAt: ST }, A, 'distributor approves its dealer'],
  ['x2', 'update', 'dealerOrders/o2', { status: 'confirmed', updatedAt: ST }, D], ['x1', 'update', 'dealerOrders/o1', { status: 'confirmed', updatedAt: ST }, D],
  ['wh', 'update', 'distributorOrders/q1', { status: 'confirmed', updatedAt: ST }, D, 'distributor has an overdue invoice'],
  ['sa', 'update', 'distributorOrders/q1', { status: 'confirmed', creditOverride: true, statusNote: 'Paid by cheque', updatedAt: ST }, A],
  ['x1', 'create', 'distributorOrders/qn', { orderId: 'XO-N', distributorUid: 'x1', lines: [{ modelId: 'm1', qty: 3 }], status: 'placed', createdAt: ST }, A],
  ['d1', 'create', 'distributorOrders/qn', { orderId: 'XO-N', distributorUid: 'd1', lines: [{ modelId: 'm1', qty: 3 }], status: 'placed', createdAt: ST }, D],
  ['x1', 'update', 'distributorOrders/q1', { status: 'cancelled', updatedAt: ST }, A]
]);

runCases('Rules: prices, accounts, invoices, payments', [
  ['sa', 'set', 'priceLists/company_d1_m2', { seller: 'company', buyer: 'd1', modelId: 'm2', price: 100 }, A],
  ['wh', 'set', 'priceLists/company_d1_m2', { seller: 'company', buyer: 'd1', modelId: 'm2', price: 100 }, D, 'Super Admin sets company prices'],
  ['x1', 'set', 'priceLists/x1_d2_m2', { seller: 'x1', buyer: 'd2', modelId: 'm2', price: 1 }, A, 'for its own dealer'],
  ['x1', 'set', 'priceLists/x1_d1_m2', { seller: 'x1', buyer: 'd1', modelId: 'm2', price: 1 }, D, 'not its dealer'],
  ['x1', 'set', 'priceLists/company_d2_m2', { seller: 'company', buyer: 'd2', modelId: 'm2', price: 1 }, D, 'as Head Office'],
  ['sa', 'set', 'priceLists/company_d1_mX', { seller: 'company', buyer: 'd1', modelId: 'm2', price: 100 }, D, 'id must match'],
  ['sa', 'set', 'priceLists/company_d1_m2', { seller: 'company', buyer: 'd1', modelId: 'm2', price: -1 }, D, 'negative'],
  ['d1', 'set', 'priceLists/company_d1_m1', { seller: 'company', buyer: 'd1', modelId: 'm1', price: 1 }, D, 'buyer sets own price'],
  ['d1', 'update', 'tradeAccounts/d1', { creditLimit: 9999999 }, D],
  ['wh', 'update', 'tradeAccounts/d1', { creditLimit: 1 }, D, 'credit terms are Super Admin\'s'],
  ['sa', 'update', 'tradeAccounts/d1', { creditLimit: 60000, updatedAt: ST }, A],
  ['sa', 'update', 'tradeAccounts/d1', { outstanding: 0 }, D, 'balances are server-written'],
  ['sa', 'update', 'tradeAccounts/d1', { paymentTermsDays: 400 }, D, 'terms over a year'],
  ['wh', 'create', 'invoices/in', { buyerUid: 'd1' }, D, 'invoices are server-written'], ['sa', 'update', 'invoices/i1', { status: 'paid' }, D],
  ['sa', 'create', 'ledgerEntries/ln', { accountUid: 'd1' }, D],
  ['wh', 'add', 'tradePayments', { accountUid: 'd1', amount: 500, mode: 'UPI', recordedByUid: 'wh', createdAt: ST }, A],
  ['wh', 'add', 'tradePayments', { accountUid: 'd1', amount: 500, mode: 'UPI', recordedByUid: 'sa', createdAt: ST }, D, 'in someone else\'s name'],
  ['wh', 'add', 'tradePayments', { accountUid: 'ghost', amount: 500, mode: 'UPI', recordedByUid: 'wh', createdAt: ST }, D, 'unknown account'],
  ['wh', 'add', 'tradePayments', { accountUid: 'd1', amount: 0, mode: 'UPI', recordedByUid: 'wh', createdAt: ST }, D],
  ['d1', 'add', 'tradePayments', { accountUid: 'd1', amount: 500, mode: 'UPI', recordedByUid: 'd1', createdAt: ST }, D, 'buyer records own payment'],
  ['wh', 'update', 'tradePayments/tp1', { amount: 1 }, D, 'payments are not editable']
]);

runCases('Rules: finished goods stock', [
  ['wh', 'set', 'productStock/warehouse_m2', { location: 'warehouse', modelId: 'm2', onHand: 100 }, D, 'stock is server-written'],
  ['wh', 'update', 'unitSerials/SN-9', { status: 'delivered' }, D],
  ['wh', 'add', 'stockReceipts', { modelId: 'm1', serials: ['A-0001', 'A-0002'], createdByUid: 'wh', createdAt: ST }, A],
  ['sc1', 'add', 'stockReceipts', { modelId: 'm1', serials: ['A-0001'], createdByUid: 'sc1', createdAt: ST }, D],
  ['wh', 'add', 'stockReceipts', { modelId: 'm1', serials: Array.from({ length: 401 }, (_, i) => 'S' + (1000 + i)), createdByUid: 'wh', createdAt: ST }, D, 'over 400 units'],
  ['wh', 'add', 'stockReceipts', { modelId: 'm1', serials: ['A-0001'], createdByUid: 'wh', createdAt: ST, status: 'accepted' }, D, 'server-only field']
]);

runCases('Rules: spares, inventory and stock requests', [
  ['t1', 'update', 'inventory/inv_t1', { quantity: 50 }, D, 'own stock only via stockOps'],
  ['wh', 'update', 'inventory/inv_wh', { quantity: 20 }, A, 'add stock'],
  ['wh', 'update', 'inventory/inv_wh', { quantity: 5 }, D, 'reduce without a dispatch or approval'],
  ['sa', 'update', 'inventory/inv_wh', { quantity: 5 }, A], ['wh', 'update', 'inventory/inv_t1', { quantity: -1 }, D, 'negative'],
  ['wh', 'update', 'stockMovements/mv1', { quantity: 2 }, D, 'ledger is append-only'], ['sa', 'update', 'stockMovements/mv1', { quantity: 2 }, A],
  ['t1', 'add', 'stockMovements', { type: 'transfer', technicianUid: 't1', quantity: 1, createdAt: ST }, D],
  ['t1', 'add', 'stockOps', { type: 'consume', byUid: 't1', lines: [{ partId: 'sp1', qty: 1 }], status: 'pending', createdAt: ST }, A],
  ['t1', 'add', 'stockOps', { type: 'consume', byUid: 't1', lines: [{ partId: 'sp1', qty: 1 }], status: 'done', createdAt: ST }, D, 'pre-applied'],
  ['t1', 'add', 'stockOps', { type: 'consume', byUid: 'sc1', lines: [{ partId: 'sp1', qty: 1 }], status: 'pending', createdAt: ST }, D, 'in someone else\'s name'],
  ['t1', 'add', 'stockOps', { type: 'teleport', byUid: 't1', lines: [{ partId: 'sp1', qty: 1 }], status: 'pending', createdAt: ST }, D, 'unknown type'],
  ['d1', 'add', 'stockOps', { type: 'consume', byUid: 'd1', lines: [{ partId: 'sp1', qty: 1 }], status: 'pending', createdAt: ST }, D],
  ['wh', 'update', 'spareParts/sp1', { price: 1 }, D, 'price change needs approval'], ['wh', 'update', 'spareParts/sp1', { name: 'Thermostat 2' }, A],
  ['sa', 'update', 'spareParts/sp1', { price: 1 }, A],
  ['sc2', 'update', 'serviceChargeRates/center_sc2_geyser_repair_flat', { amount: 999 }, D, 'rate change goes through approval'],
  ['sc1', 'update', 'returns/rt1', { status: 'requested', updatedAt: ST }, A, 'send defective back'],
  ['sc1', 'update', 'returns/rt1', { status: 'received' }, D], ['sc2', 'update', 'returns/rt1', { status: 'requested' }, D],
  ['sc1', 'add', 'returns', { serviceCenterUid: 'sc1', status: 'awaiting_return' }, D]
]);

runCases('Rules: claims, wallet, approvals, audit', [
  ['t1', 'add', 'claims', { claimantUid: 't1', claimantType: 'technician', status: 'submitted', amount: 300, walletTxnIds: ['w1'] }, A],
  ['t1', 'add', 'claims', { claimantUid: 't1', claimantType: 'servicecenter', status: 'submitted', amount: 300, walletTxnIds: ['w1'] }, D, 'wrong claimant type'],
  ['t1', 'add', 'claims', { claimantUid: 't1', claimantType: 'technician', status: 'submitted', amount: 300, walletTxnIds: ['w1'], approvedAmount: 300 }, D],
  ['t1', 'add', 'claims', { claimantUid: 't1', claimantType: 'technician', status: 'submitted', amount: 300, claimType: 'travel' }, D, 'free-form claim needs a bill'],
  ['t1', 'add', 'claims', { claimantUid: 't1', claimantType: 'technician', status: 'submitted', amount: 300, claimType: 'travel', attachmentUrl: 'https://x.test/bill.jpg' }, A],
  ['t1', 'add', 'claims', { claimantUid: 't1', claimantType: 'technician', status: 'verified', amount: 300, walletTxnIds: ['w1'] }, D],
  ['wh', 'update', 'claims/cl1', { status: 'verified', approvedAmount: 500, verifiedByUid: 'wh', verifiedAt: ST }, A],
  ['wh', 'update', 'claims/cl1', { status: 'verified', approvedAmount: 600, verifiedByUid: 'wh', verifiedAt: ST }, D, 'more than claimed'],
  ['t1', 'update', 'claims/cl1', { status: 'verified', approvedAmount: 500, verifiedByUid: 't1', verifiedAt: ST }, D, 'verifies own claim'],
  ['wh', 'update', 'claims/cl1', { status: 'rejected', rejectReason: 'Duplicate', rejectedByUid: 'wh' }, A],
  ['sa', 'update', 'claims/cl2', { status: 'settled', paidByUid: 'sa', paidAt: ST, paymentMethod: 'UPI' }, A],
  ['sa', 'update', 'claims/cl3', { status: 'settled', paidByUid: 'sa', paidAt: ST, paymentMethod: 'UPI' }, D, 'pays a claim they verified'],
  ['wh', 'update', 'claims/cl2', { status: 'settled', paidByUid: 'wh', paidAt: ST, paymentMethod: 'UPI' }, D, 'only Super Admin pays'],
  ['t1', 'update', 'walletTransactions/w1', { status: 'claimed' }, D], ['t1', 'create', 'walletTransactions/wn', { technicianUid: 't1', amount: 999 }, D],
  ['wh', 'add', 'payments', { sourceType: 'claim', amount: 1 }, D, 'claim payments are server-written'],
  ['wh', 'add', 'payments', { sourceType: 'local_purchase', amount: 1 }, A],
  ['sa', 'update', 'changeRequests/ch1', { status: 'approved', reviewedByUid: 'sa', reviewedAt: ST }, A],
  ['wh', 'update', 'changeRequests/ch1', { status: 'approved', reviewedByUid: 'wh', reviewedAt: ST }, D, 'only Super Admin decides'],
  ['sa', 'update', 'changeRequests/ch2', { status: 'approved', reviewedByUid: 'sa', reviewedAt: ST }, D, 'own request'],
  ['sc1', 'add', 'changeRequests', { kind: 'center_rate', requestedByUid: 'sc1', status: 'pending', createdAt: ST, payload: { rates: [{ category: 'Geyser', amount: 400 }] } }, A],
  ['t1', 'add', 'changeRequests', { kind: 'center_rate', requestedByUid: 't1', status: 'pending', createdAt: ST, payload: { rates: [{ amount: 1 }] } }, D],
  ['wh', 'add', 'auditLogs', { action: 'x', performedByUid: 'wh', performedBy: 'wh@pe.test', createdAt: ST }, A],
  ['wh', 'add', 'auditLogs', { action: 'x', performedByUid: 'sa', performedBy: 'sa@pe.test', createdAt: ST }, D, 'as someone else'],
  ['wh', 'add', 'auditLogs', { action: 'x', performedByUid: 'wh', performedBy: 'wh@pe.test', createdAt: ST, source: 'server' }, D, 'pretends to be the server'],
  ['sa', 'update', 'auditLogs/a1', { action: 'y' }, D, 'append-only'],
  ['wh', 'update', 'rmaRequests/rm1', { status: 'approved', modelId: 'm1', approvedByUid: 'wh' }, A],
  ['wh', 'update', 'rmaRequests/rm1', { status: 'replacement_dispatched' }, D, 'dispatch is server-side'],
  ['wh', 'set', 'settings/companyProfile', { legalName: 'X' }, D, 'GST profile is Super Admin\'s'],
  ['sa', 'merge', 'settings/companyProfile', { legalName: 'Pushpak Enterprises' }, A]
]);

runCases('Rules: public website and customer writes', [
  ['anon', 'add', 'contactEnquiries', { ticketId: 'PE-ENQ-20261007-0001-CustomerSite', name: 'A', phone: '9876543210', message: 'Hello', createdAt: ST }, A],
  ['anon', 'add', 'contactEnquiries', { ticketId: 'PE-ENQ-20261007-0001-CustomerSite', name: 'A', phone: '12345', message: 'Hello', createdAt: ST }, D, 'bad phone'],
  ['anon', 'list', ['contactEnquiries'], null, D],
  ['anon', 'create', 'publicServiceRequests/PE-SVC-3', { requestId: 'PE-SVC-3', customerName: 'A', customerPhone: '9876543210', status: 'new', source: 'public-site', pincode: '584101', createdAt: ST }, A],
  ['anon', 'create', 'publicServiceRequests/PE-SVC-3', { requestId: 'PE-SVC-3', customerName: 'A', customerPhone: '9876543210', status: 'new', source: 'public-site', createdAt: ST, warrantyStatus: 'in_warranty' }, D, 'claims warranty'],
  ['anon', 'create', 'publicServiceRequests/PE-SVC-3', { requestId: 'PE-SVC-3', customerName: 'A', customerPhone: '9876543210', status: 'closed', source: 'public-site', createdAt: ST }, D, 'starts closed'],
  ['anon', 'create', 'publicServiceRequests/PE-SVC-3', { requestId: 'PE-SVC-4', customerName: 'A', customerPhone: '9876543210', status: 'new', source: 'public-site', createdAt: ST }, D, 'id mismatch'],
  ['anon', 'create', 'publicServiceRequests/PE-SVC-3', { requestId: 'PE-SVC-3', customerName: 'A', customerPhone: '9876543210', status: 'new', source: 'public-site', createdAt: ST, serviceCenterUid: 'sc1' }, D, 'picks a center'],
  ['anon', 'update', 'publicServiceRequests/PE-SVC-1', { status: 'closed' }, D],
  ['anon', 'add', 'productRegistrations', { source: 'public-site', registrationId: 'PE-REG-9', customerName: 'A', customerPhone: '9876543210', product: 'Geyser', createdAt: ST }, A],
  ['anon', 'add', 'productRegistrations', { source: 'public-site', registrationId: 'PE-REG-9', customerName: 'A', customerPhone: '9876543210', product: 'Geyser', createdAt: ST, serialCheck: { status: 'verified' } }, D, 'fakes the serial check'],
  ['d1', 'update', 'productRegistrations/r1', { serialNumber: 'OTHER' }, D, 'dealer edits the serial'],
  ['d1', 'update', 'productRegistrations/r1', { notes: 'Installed' }, A],
  ['anon', 'create', 'serviceFeedback/PE-CR-1', { ticketId: 'PE-CR-1', customerPhone: '9000000001', rating: 5, comment: 'Good', createdAt: ST }, A],
  ['anon', 'create', 'serviceFeedback/PE-CR-1', { ticketId: 'PE-CR-1', customerPhone: '9999999999', rating: 5, comment: 'Good', createdAt: ST }, D, 'wrong phone'],
  ['anon', 'create', 'serviceFeedback/PE-CR-2', { ticketId: 'PE-CR-2', customerPhone: '9000000002', rating: 5, comment: 'Good', createdAt: ST }, D, 'not finished yet'],
  ['anon', 'create', 'serviceFeedback/PE-CR-1', { ticketId: 'PE-CR-1', customerPhone: '9000000001', rating: 6, comment: 'Good', createdAt: ST }, D, 'rating out of range'],
  ['c1', 'create', 'serviceFeedback/PE-CR-1', { ticketId: 'PE-CR-1', customerPhone: '9000000001', rating: 4, comment: '', createdAt: ST }, A, 'from the portal'],
  ['anon', 'update', 'serviceFeedback/PE-CR-9', { rating: 1 }, D, 'cannot be edited'],
  ['t1', 'create', 'publicTicketStatus/PE-CR-5', { ticketId: 'PE-CR-5', customerPhone: '9000000001', status: 'new' }, A, 'staff keep the mirror'],
  ['sa', 'set', 'customerTracking/PE-SVC-1', { status: 'x' }, D, 'server only'], ['sa', 'set', 'supportTickets/PE-SUP-1', { status: 'x' }, D, 'server only'],
  ['anon', 'add', 'notifications', { recipientType: 'role', recipientValue: 'superadmin', title: 'Enquiry', message: 'm', read: false, createdAt: ST }, A],
  ['anon', 'add', 'notifications', { recipientType: 'uid', recipientValue: 't1', title: 'Spam', message: 'm', read: false, createdAt: ST }, D, 'cannot message a user'],
  ['anon', 'set', 'siteContent/landing', { heroHeadline: 'Hacked' }, D], ['anon', 'set', 'productModels/m1', { modelNumber: 'X' }, D],
  ['sa', 'set', 'someUnknownCollection/x', { a: 1 }, D, 'deny by default']
]);
