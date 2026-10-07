// Phase 5 item 3 — role tests. Who can see and touch what, for every role:
// Super Admin (sa), Warehouse (wh), service centers (sc1, sc2), technicians
// (t1 on sc1's roster, t2 unlinked), dealers (d1 direct, d2 under
// distributor x1), distributors (x1, x2), customers (c1, c2) and signed-out
// visitors (anon). Seed data: env.mjs.
import { runCases } from './runner.mjs';
const A = 'allow', D = 'deny';

runCases('Role access: user accounts', [
  ['sa', 'get', 'users/t1', null, A], ['wh', 'get', 'users/sc1', null, A],
  ['t1', 'get', 'users/t1', null, A, 'own'], ['t1', 'get', 'users/sc1', null, A, 'staff read centers'],
  ['sc1', 'get', 'users/t2', null, A, 'staff read technicians'], ['t1', 'get', 'users/d1', null, D, 'not dealers'],
  ['d1', 'get', 'users/d1', null, A, 'own'], ['d1', 'get', 'users/t1', null, D], ['d1', 'get', 'users/sa', null, D],
  ['x1', 'get', 'users/d2', null, A, 'own dealer'], ['x1', 'get', 'users/d1', null, D, 'not its dealer'], ['x2', 'get', 'users/d2', null, D],
  ['c1', 'get', 'users/c1', null, A, 'own'], ['c1', 'get', 'users/c2', null, D], ['c1', 'get', 'users/t1', null, D, 'customer is not staff'],
  ['anon', 'get', 'users/t1', null, D], ['anon', 'list', ['users'], null, D], ['t1', 'list', ['users'], null, D, 'cannot list everyone']
]);

runCases('Role access: service tickets', [
  ['t1', 'get', 'serviceJobs/j1', null, A, 'own job'], ['t2', 'get', 'serviceJobs/j1', null, D],
  ['sc1', 'get', 'serviceJobs/j1', null, D], ['x1', 'get', 'serviceJobs/j1', null, A, 'open job, escalation view'],
  ['x1', 'get', 'serviceJobs/j2', null, D, 'closed job'], ['c1', 'get', 'serviceJobs/j1', null, D], ['anon', 'get', 'serviceJobs/j1', null, D],
  ['d1', 'get', 'serviceJobs/j1', null, D], ['wh', 'get', 'serviceJobs/j2', null, A],
  ['sc1', 'get', 'centerRequests/cr1', null, A, 'own center'], ['sc2', 'get', 'centerRequests/cr1', null, D],
  ['t1', 'get', 'centerRequests/cr1', null, A, 'assigned technician'], ['t2', 'get', 'centerRequests/cr1', null, D],
  ['x1', 'get', 'centerRequests/cr2', null, A, 'open ticket'], ['x1', 'get', 'centerRequests/cr3', null, D, 'closed ticket'],
  ['c1', 'get', 'centerRequests/cr1', null, D, 'customer reads tracking, not the ticket'], ['anon', 'get', 'centerRequests/cr1', null, D],
  ['d1', 'get', 'centerRequests/cr1', null, D],
  ['sc1', 'list', ['centerRequests', ['serviceCenterUid', '==', 'sc1']], null, A], ['sc1', 'list', ['centerRequests'], null, D, 'cannot list other centers'],
  ['sc1', 'add', 'centerRequests/cr1/statusLog', { status: 'assigned', note: 'x' }, A], ['sc2', 'add', 'centerRequests/cr1/statusLog', { status: 'x' }, D],
  ['t1', 'get', 'centerTechnicians/ct1', null, A, 'own roster record'], ['sc1', 'get', 'centerTechnicians/ct1', null, A],
  ['sc2', 'get', 'centerTechnicians/ct1', null, D], ['t2', 'get', 'centerTechnicians/ct1', null, D],
  ['sc1', 'get', 'serviceCenterProfiles/sc1', null, A], ['sc2', 'get', 'serviceCenterProfiles/sc1', null, D], ['wh', 'get', 'serviceCenterProfiles/sc1', null, A]
]);

runCases('Role access: customer records (portal and website)', [
  ['anon', 'get', 'productRegistrations/r1', null, D, 'no longer public'], ['anon', 'list', ['productRegistrations', ['customerPhone', '==', '9000000001']], null, D],
  ['c1', 'list', ['productRegistrations', ['customerPhone', '==', '9000000001']], null, A, 'own phone'],
  ['c1', 'list', ['productRegistrations', ['customerPhone', '==', '9000000002']], null, D], ['c1', 'get', 'productRegistrations/r2', null, D],
  ['c1', 'list', ['productRegistrations'], null, D, 'unfiltered'], ['d1', 'get', 'productRegistrations/r1', null, A], ['t1', 'get', 'productRegistrations/r2', null, A],
  ['anon', 'get', 'publicServiceRequests/PE-SVC-1', null, D], ['t1', 'get', 'publicServiceRequests/PE-SVC-1', null, A],
  ['c1', 'get', 'publicServiceRequests/PE-SVC-1', null, A], ['c1', 'get', 'publicServiceRequests/PE-SVC-2', null, D],
  ['c1', 'list', ['publicServiceRequests', ['customerPhone', '==', '9000000001']], null, A], ['c1', 'list', ['publicServiceRequests', ['customerPhone', '==', '9000000002']], null, D],
  ['t1', 'list', ['publicServiceRequests'], null, D, 'list is admin-only'], ['wh', 'list', ['publicServiceRequests'], null, A],
  ['anon', 'get', 'publicTicketStatus/PE-CR-1', null, D], ['anon', 'list', ['publicTicketStatus', ['customerPhone', '==', '9000000001']], null, D],
  ['c1', 'get', 'publicTicketStatus/PE-CR-1', null, A], ['c1', 'list', ['publicTicketStatus', ['customerPhone', '==', '9000000002']], null, D],
  ['c1', 'get', 'customerTracking/PE-SVC-1', null, A], ['c1', 'get', 'customerTracking/PE-SVC-2', null, D],
  ['c1', 'list', ['customerTracking', ['customerPhone', '==', '9000000001']], null, A], ['anon', 'get', 'customerTracking/PE-SVC-1', null, D],
  ['t1', 'get', 'customerTracking/PE-SVC-1', null, A, 'staff'], ['d1', 'get', 'customerTracking/PE-SVC-1', null, D, 'dealer is not staff'],
  ['c1', 'get', 'supportTickets/PE-SUP-1', null, A], ['c1', 'get', 'supportTickets/PE-SUP-2', null, D], ['sa', 'list', ['supportTickets'], null, A],
  ['t1', 'get', 'supportTickets/PE-SUP-1', null, D, 'Head Office only'], ['anon', 'get', 'supportTickets/PE-SUP-1', null, D],
  ['c1', 'get', 'serviceFeedback/PE-CR-9', null, A, 'own feedback'], ['c1', 'get', 'serviceFeedback/PE-NONE', null, A, 'learn none exists'],
  ['c2', 'get', 'serviceFeedback/PE-CR-9', null, D], ['sc1', 'get', 'serviceFeedback/PE-CR-9', null, A, 'center of the job'],
  ['sc2', 'get', 'serviceFeedback/PE-CR-9', null, D], ['anon', 'get', 'serviceFeedback/PE-CR-9', null, D]
]);

runCases('Role access: trade and finance', [
  ['d1', 'get', 'dealerOrders/o1', null, A, 'own'], ['d2', 'get', 'dealerOrders/o1', null, D], ['x1', 'get', 'dealerOrders/o2', null, A, 'its dealer'],
  ['x1', 'get', 'dealerOrders/o1', null, D, 'direct dealer'], ['x2', 'get', 'dealerOrders/o2', null, D], ['wh', 'get', 'dealerOrders/o2', null, A],
  ['t1', 'get', 'dealerOrders/o1', null, D], ['c1', 'get', 'dealerOrders/o1', null, D],
  ['x1', 'get', 'distributorOrders/q1', null, A], ['x2', 'get', 'distributorOrders/q1', null, D], ['d1', 'get', 'distributorOrders/q1', null, D],
  ['d1', 'get', 'priceLists/company_default-dealer_m1', null, A, 'standard dealer price'], ['d1', 'get', 'priceLists/company_d1_m1', null, A, 'own price'],
  ['d1', 'get', 'priceLists/company_default-distributor_m1', null, D], ['d1', 'get', 'priceLists/x1_default_m1', null, D, 'not its distributor'],
  ['d2', 'get', 'priceLists/x1_default_m1', null, A, 'its distributor standard'], ['d2', 'get', 'priceLists/x1_d2_m1', null, A],
  ['x1', 'get', 'priceLists/company_default-distributor_m1', null, A], ['x1', 'get', 'priceLists/company_d1_m1', null, D],
  ['x1', 'get', 'priceLists/x1_d2_m1', null, A, 'its own price'], ['x2', 'get', 'priceLists/x1_d2_m1', null, D],
  ['t1', 'get', 'priceLists/company_default-dealer_m1', null, D], ['c1', 'get', 'priceLists/company_default-dealer_m1', null, D],
  ['anon', 'get', 'priceLists/company_default-dealer_m1', null, D], ['wh', 'get', 'priceLists/x1_d2_m1', null, A],
  ['d1', 'get', 'tradeAccounts/d1', null, A], ['d1', 'get', 'tradeAccounts/x1', null, D], ['wh', 'get', 'tradeAccounts/x1', null, A],
  ['d1', 'get', 'invoices/i1', null, A], ['d1', 'get', 'invoices/i2', null, D], ['x1', 'list', ['invoices', ['buyerUid', '==', 'x1']], null, A],
  ['x1', 'list', ['invoices'], null, D], ['d1', 'get', 'ledgerEntries/l1', null, A], ['x1', 'get', 'ledgerEntries/l1', null, D],
  ['d1', 'get', 'tradePayments/tp1', null, A], ['x1', 'get', 'tradePayments/tp1', null, D],
  ['x1', 'get', 'productStock/dist_x1_m1', null, A, 'own stock'], ['x1', 'get', 'productStock/warehouse_m1', null, D],
  ['x2', 'get', 'productStock/dist_x1_m1', null, D], ['wh', 'get', 'productStock/warehouse_m1', null, A], ['d1', 'get', 'productStock/warehouse_m1', null, D],
  ['x1', 'get', 'unitSerials/SN-1', null, A], ['d1', 'get', 'unitSerials/SN-1', null, D], ['x1', 'get', 'unitSerials/SN-9', null, D], ['wh', 'get', 'unitSerials/SN-9', null, A]
]);

runCases('Role access: spares, claims, wallet, settings', [
  ['t1', 'get', 'claims/cl1', null, A, 'own claim'], ['t2', 'get', 'claims/cl1', null, D], ['wh', 'get', 'claims/cl1', null, A],
  ['t1', 'get', 'walletTransactions/w1', null, A], ['t2', 'get', 'walletTransactions/w1', null, D], ['sc1', 'get', 'walletTransactions/w1', null, D],
  ['t1', 'get', 'inventory/inv_t1', null, A, 'own stock'], ['t1', 'get', 'inventory/inv_sc2', null, D], ['sc2', 'get', 'inventory/inv_sc2', null, A],
  ['sc1', 'get', 'inventory/inv_wh', null, D], ['wh', 'get', 'inventory/inv_wh', null, A],
  ['t1', 'get', 'stockMovements/mv1', null, A], ['sc2', 'get', 'stockMovements/mv1', null, D],
  ['t1', 'get', 'spareParts/sp1', null, A, 'staff'], ['d1', 'get', 'spareParts/sp1', null, D], ['c1', 'get', 'spareParts/sp1', null, D],
  ['t1', 'get', 'serviceChargeRates/default_geyser_repair_flat', null, A], ['sc1', 'get', 'serviceChargeRates/center_sc2_geyser_repair_flat', null, D],
  ['sc2', 'get', 'serviceChargeRates/center_sc2_geyser_repair_flat', null, A],
  ['t1', 'get', 'notifications/n1', null, A], ['t2', 'get', 'notifications/n1', null, D], ['sa', 'get', 'notifications/n2', null, A], ['wh', 'get', 'notifications/n1', null, A],
  ['c1', 'get', 'notifications/n2', null, D], ['wh', 'get', 'rmaRequests/rm1', null, A], ['sc1', 'get', 'rmaRequests/rm1', null, D],
  ['sc1', 'get', 'returns/rt1', null, A], ['sc2', 'get', 'returns/rt1', null, D],
  ['t1', 'get', 'settings/companyProfile', null, A], ['d1', 'get', 'settings/companyProfile', null, D], ['c1', 'get', 'settings/companyProfile', null, D],
  ['wh', 'get', 'changeRequests/ch1', null, A], ['t1', 'get', 'changeRequests/ch1', null, D],
  ['wh', 'get', 'auditLogs/a1', null, A], ['t1', 'get', 'auditLogs/a1', null, D],
  ['sa', 'get', 'lookupLimits/x', null, D, 'server only'], ['sa', 'get', 'someUnknownCollection/x', null, D, 'deny by default'],
  ['anon', 'get', 'siteContent/landing', null, A, 'public'], ['anon', 'get', 'productModels/m1', null, A, 'public'], ['anon', 'get', 'counters/enquiry-202610', null, A]
]);

runCases('Role access: a customer account never acts as staff', [
  ['c1', 'list', ['serviceJobs'], null, D], ['c1', 'add', 'stockOps', { type: 'consume', byUid: 'c1', lines: [{ partId: 'sp1', qty: 1 }], status: 'pending', createdAt: '__ST__' }, D],
  ['c1', 'create', 'counters/sparerequest-202612', { value: 1 }, D], ['c1', 'add', 'claims', { claimantUid: 'c1', claimantType: 'customer', status: 'submitted', amount: 10, walletTxnIds: ['w1'] }, D],
  ['c1', 'update', 'centerRequests/cr1', { status: 'closed' }, D], ['c1', 'update', 'users/c1', { name: 'New' }, D, 'profile is server-written'],
  ['c1', 'create', 'publicTicketStatus/PE-CR-7', { ticketId: 'PE-CR-7', customerPhone: '9000000001', status: 'completed' }, D],
  ['c1', 'add', 'dealerCustomers', { dealerUid: 'c1' }, D], ['c1', 'create', 'serviceCenterProfiles/c1', { displayName: 'x' }, D],
  ['c1', 'update', 'customerTracking/PE-SVC-1', { status: 'closed' }, D], ['c1', 'update', 'supportTickets/PE-SUP-1', { status: 'closed' }, D]
]);
