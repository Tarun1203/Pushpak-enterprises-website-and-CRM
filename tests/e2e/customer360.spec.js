// Phase 9 item 1 — Customer 360 (Super Admin). Searching a phone number must
// show everything that customer has: registrations with warranty, service
// history, appointments, warranty & billing, feedback and enquiries — all
// consistent with each other — and must show hostile text as text.
const { test, expect } = require('@playwright/test');
const { startStaticServer } = require('./support/static-server');
const { openPage } = require('./support/device-checks');
const { sampleFor, XSS } = require('./support/sample-data');

const PHONE = '9100000061';
const DAY = 86400000;
const iso = (daysAgo) => new Date(Date.now() - daysAgo * DAY).toISOString().slice(0, 10);

function customerData(name) {
  const data = sampleFor('superadmin');
  data.productRegistrations = [
    { id: 'rg1', registrationId: 'PE-REG-1', customerName: name, customerPhone: PHONE, product: 'MakWell Geyser — G25', serialNumber: 'C360-0001', brand: 'MakWell', category: 'Geyser', modelNo: 'G25',
      purchaseDate: iso(200), warrantyMonths: 24, warrantyComponents: [{ componentName: 'Full Product', durationYears: 2 }, { componentName: 'Heating Element', durationYears: 5 }], address: '1 Main Rd', city: 'Raichur', pincode: '584101' },
    { id: 'rg2', registrationId: 'PE-REG-2', customerName: name, customerPhone: PHONE, product: 'Flyvision LED TV — F43', serialNumber: 'C360-0002', purchaseDate: iso(900), warrantyMonths: 12 },
    { id: 'rgX', registrationId: 'PE-REG-X', customerName: 'Someone Else', customerPhone: '9100000099', product: 'Not this customer', serialNumber: 'OTHER-1', purchaseDate: iso(10), warrantyMonths: 12 }
  ];
  data.publicServiceRequests = [{ id: 'PE-SVC-1', requestId: 'PE-SVC-1', customerName: name, customerPhone: PHONE, status: 'assigned_to_center', issueDescription: 'No hot water', serialNumber: 'C360-0001' }];
  data.centerRequests = [
    { id: 'route_PE-SVC-1', requestId: 'PE-SVC-1', sourceRequestId: 'PE-SVC-1', customerName: name, customerPhone: PHONE, status: 'completed', product: 'MakWell Geyser — G25', serialNumber: 'C360-0001',
      scheduledDate: iso(-2), scheduledStartTime: '10:00', scheduledEndTime: '12:00', technicianName: 'Tech Ravi', warrantyStatus: 'in_warranty', billingType: 'claim', billingStatus: 'claimed', claimId: 'CL-77',
      customerFeedback: { rating: 4, comment: 'Quick and polite' }, closureCode: 'REPAIRED', actionTaken: 'Replaced element' },
    { id: 'cr2', requestId: 'PE-CR-2', customerName: name, customerPhone: PHONE, status: 'closed', product: 'Flyvision LED TV', serialNumber: 'C360-0002',
      warrantyStatus: 'out_of_warranty', billingType: 'customer', billingStatus: 'collected', billingTotal: 1850 },
    { id: 'crX', requestId: 'PE-CR-X', customerName: 'Someone Else', customerPhone: '9100000099', status: 'new' }
  ];
  const at = (daysAgo) => ({ __ms: Date.now() - daysAgo * DAY });
  data.customerTracking = [
    { id: 'PE-CR-2', ticketId: 'PE-CR-2', customerPhone: PHONE, events: [{ type: 'status', label: 'Service closed', at: at(3) }, { type: 'request', label: 'Request received', at: at(9) }] },
    { id: 'PE-SVC-1', ticketId: 'PE-SVC-1', customerPhone: PHONE, events: [{ type: 'feedback', label: 'Feedback received', at: at(1) }, { type: 'assignment', label: 'Technician assigned: Tech Ravi', at: at(6) }, { type: 'spare', label: 'Spare part dispatched', at: at(5) }] },
    { id: 'PE-OTHER', ticketId: 'PE-OTHER', customerPhone: '9100000099', events: [{ type: 'request', label: 'Someone else request', at: at(2) }] }
  ];
  data.contactEnquiries = [{ id: 'e1', ticketId: 'PE-ENQ-1', phone: PHONE, subject: 'Price of G25', message: 'What is the price?' }];
  return data;
}

let origin, server;
test.beforeAll(async () => { ({ server, origin } = await startStaticServer()); });
test.afterAll(async () => { if (server) server.close(); });
test.use({ viewport: { width: 1366, height: 900 } });

async function search(page, phone) {
  await page.locator('.sidebar .nav-item', { hasText: 'Customer 360' }).click();
  await page.locator('#c360-phone-input').fill(phone);
  await page.locator('#c360-search-btn').click();
}

test('Customer 360 shows the whole customer, consistent across sections, and nobody else', async ({ page }) => {
  const errors = await openPage(page, origin, 'crm/CRMsuperadmin.html', 'superadmin', customerData('Lakshmi'));
  await search(page, PHONE);
  const profile = page.locator('#c360-profile');
  await expect(profile.locator('h2').first()).toContainText('Lakshmi');
  await expect(profile.locator('h2').first()).toContainText(PHONE);
  await expect(profile).toContainText('2 registration(s)');
  await expect(profile).toContainText('3 service record(s)');
  // Registrations & warranty: 200 days into a 24-month cover, and 900 days into a 12-month cover.
  const regRows = profile.locator('#c360-regs-tbody tr');
  await expect(regRows).toHaveCount(2);
  await expect(regRows.filter({ hasText: 'PE-REG-1' })).toContainText(/in warranty|active|valid/i);
  await expect(regRows.filter({ hasText: 'PE-REG-2' })).toContainText(/expired|out of warranty/i);
  // Service history: all three of this customer's records, none of the other customer's.
  const svc = profile.locator('#c360-service-tbody tr');
  await expect(svc).toHaveCount(3);
  await expect(profile).not.toContainText('PE-CR-X');
  await expect(profile).not.toContainText('Someone Else');
  // Appointments.
  const appts = profile.locator('#c360-appts');
  await expect(appts).toContainText('PE-SVC-1');
  await expect(appts).toContainText('10:00–12:00');
  await expect(appts).toContainText('Tech Ravi');
  // Warranty & billing: warranty job is a claim at no charge to the customer; out-of-warranty job paid by the customer.
  const bill = profile.locator('#c360-billing');
  await expect(bill.locator('tr', { hasText: 'PE-SVC-1' })).toContainText('Warranty claim');
  await expect(bill.locator('tr', { hasText: 'PE-SVC-1' })).toContainText('No charge to customer');
  await expect(bill.locator('tr', { hasText: 'PE-SVC-1' })).toContainText('CL-77');
  await expect(bill.locator('tr', { hasText: 'PE-CR-2' })).toContainText('Paid by customer');
  await expect(bill.locator('tr', { hasText: 'PE-CR-2' })).toContainText('1,850');
  // Feedback.
  await expect(profile.locator('#c360-feedback')).toContainText('4/5');
  await expect(profile.locator('#c360-feedback')).toContainText('Quick and polite');
  // One timeline for all of this customer's requests, oldest first, nobody else's.
  const tl = profile.locator('#c360-timeline tbody tr');
  await expect(tl).toHaveCount(5);
  const labels = await tl.locator('td:nth-child(3)').allTextContents();
  expect(labels).toEqual(['Request received', 'Technician assigned: Tech Ravi', 'Spare part dispatched', 'Service closed', 'Feedback received']);
  await expect(profile).not.toContainText('Someone else request');
  // Enquiries.
  await expect(profile).toContainText('Price of G25');
  // A registration opens with the service history of that very serial.
  await regRows.filter({ hasText: 'PE-REG-1' }).locator('.c360-open-link').click();
  const detail = page.locator('#c360-detail-body');
  await expect(detail).toContainText('C360-0001');
  await expect(detail).toContainText('PE-SVC-1');
  await expect(detail).not.toContainText('PE-CR-2');
  expect(errors, 'page errors').toEqual([]);
});

test('Customer 360 handles a phone with nothing on file, and bad input', async ({ page }) => {
  await openPage(page, origin, 'crm/CRMsuperadmin.html', 'superadmin', customerData('Lakshmi'));
  await search(page, '9100000777');
  await expect(page.locator('#c360-profile')).toContainText('No records found for 9100000777');
  await search(page, '12345');
  await expect(page.locator('#c360-error')).toContainText('valid 10-digit');
  await search(page, '+91 91000-00061'); // formatted input is cleaned to the same 10 digits
  await expect(page.locator('#c360-profile h2').first()).toContainText('Lakshmi');
});

test('Customer 360 shows hostile names, notes and comments as text', async ({ page }) => {
  const data = customerData('Mallory' + XSS);
  data.centerRequests[0].technicianName = 'Tech' + XSS;
  data.centerRequests[0].customerFeedback.comment = 'Great' + XSS;
  data.centerRequests[0].claimId = 'CL-1' + XSS;
  data.customerTracking[0].events[0].label += XSS; data.customerTracking[0].ticketId += XSS;
  data.contactEnquiries[0].subject = 'Hi' + XSS;
  await openPage(page, origin, 'crm/CRMsuperadmin.html', 'superadmin', data);
  await search(page, PHONE);
  await expect(page.locator('#c360-profile h2').first()).toContainText('Mallory');
  await page.locator('#c360-regs-tbody .c360-open-link').first().click();
  await page.locator('#close-c360-detail').click();
  await page.locator('#c360-service-tbody .c360-open-link').first().click();
  const injected = await page.evaluate(() => (window.__xss || 0) + document.querySelectorAll('img[src="x"], svg[onload]').length);
  expect(injected, 'payload ran or was rendered as HTML').toBe(0);
});
