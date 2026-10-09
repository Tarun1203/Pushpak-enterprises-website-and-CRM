const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const Customer = require('../../functions/customer');
const Intake = require('../../functions/intake');
const Billing = require('../../functions/billing');

test.describe('Phase 7 — Customer 360, product registration and warranty lifecycle', () => {
  test('public customer-service entry points are visible', async ({ page }) => {
    const base = process.env.BASE_URL || 'https://tarun1203.github.io/Pushpak-enterprises-website-and-CRM/';
    const response = await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    expect(response.status()).toBeLessThan(400);
    await expect(page.locator('body')).toBeVisible();

    // These are the labels actually exposed by the public site. Keep this
    // contract user-facing instead of assuming internal modal/control IDs.
    const bodyText = (await page.locator('body').innerText()).toLowerCase();
    for (const label of ['register product', 'book a service', 'track service', 'check warranty']) {
      expect(bodyText, `Missing customer-service entry point: ${label}`).toContain(label);
    }
  });

  test('customer registration validation is server-side and rejects unsafe input', () => {
    const now = Date.UTC(2026, 9, 7, 3, 0, 0);
    const valid = {
      brand: 'MakWell',
      categoryId: 'tv',
      category: 'LED TV',
      modelNo: 'MW43-X',
      serialNumber: ' mw-43-001 ',
      purchaseDate: '2026-09-01',
      name: 'Asha',
      address: '12 MG Road',
      city: 'Raichur',
      state: 'Karnataka',
      pincode: '584101'
    };

    const ok = Customer.validateRegistration(valid, now);
    expect(ok.value).toBeTruthy();
    expect(ok.value.serialNumber).toBe('MW-43-001');

    expect(Customer.validateRegistration({ ...valid, brand: 'Unknown' }, now).error).toMatch(/brand/i);
    expect(Customer.validateRegistration({ ...valid, purchaseDate: '2030-01-01' }, now).error).toMatch(/future/i);
    expect(Customer.validateRegistration({ ...valid, serialNumber: 'x/y' }, now).error).toMatch(/serial/i);
    expect(Customer.validateRegistration({ ...valid, pincode: '12345' }, now).error).toMatch(/pincode/i);
  });

  test('customer booking validation requires an actionable service request', () => {
    const contact = { name: 'Asha', address: '12 MG Road', city: 'Raichur', state: 'Karnataka', pincode: '584101' };
    const valid = Customer.validateBooking({
      requestType: 'service',
      registrationId: 'PE-REG-0001',
      issueDescription: 'TV has no picture',
      ...contact
    });
    expect(valid.value).toBeTruthy();
    expect(Customer.validateBooking({
      requestType: 'service',
      registrationId: 'PE-REG-0001',
      issueDescription: '',
      ...contact
    }).error).toMatch(/problem/i);
  });

  test('warranty lifecycle is deterministic and registration-first', () => {
    const now = new Date('2026-10-07T03:00:00.000Z');
    const reg = { purchaseDate: '2026-01-01', warrantyMonths: 12 };
    const inWarranty = Intake.computeIntakeWarranty(reg, {}, now);
    expect(inWarranty).toMatchObject({ status: 'in_warranty', source: 'registration' });

    const expired = Intake.computeIntakeWarranty({ purchaseDate: '2024-01-01', warrantyMonths: 12 }, {}, now);
    expect(expired).toMatchObject({ status: 'out_of_warranty', source: 'registration' });

    const component = Billing.computeClosureWarranty(
      { purchaseDate: '2026-01-01', warrantyMonths: 12, warrantyComponents: [{ componentName: 'Panel', durationYears: 3 }] },
      {},
      ['Panel'],
      now
    );
    expect(component).toMatchObject({ inWarranty: true, source: 'component' });
  });

  test('customer tracking is a safe projection and never exposes internal ticket fields', () => {
    const tracked = Customer.buildTrack(null, {
      requestId: 'PE-SVC-1001',
      customerPhone: '9000000001',
      customerName: 'Asha',
      address: 'Private address',
      closureNotes: 'Internal note',
      status: 'assigned',
      brand: 'MakWell',
      category: 'LED TV',
      technicianName: 'Ravi',
      serviceCenterName: 'Raichur Service Center',
      scheduledDate: '2026-10-09',
      scheduledStartTime: '10:00',
      scheduledEndTime: '12:00'
    }, { id: 'server-time' });

    expect(tracked).toBeTruthy();
    expect(tracked.data.ticketId).toBe('PE-SVC-1001');
    expect(tracked.data.technicianName).toBe('Ravi');
    expect(tracked.data.appointment).toEqual({ date: '2026-10-09', start: '10:00', end: '12:00' });
    expect(tracked.data.customerName).toBeUndefined();
    expect(tracked.data.address).toBeUndefined();
    expect(tracked.data.closureNotes).toBeUndefined();
  });

  test('Firestore rules keep customer access scoped and protect server-controlled tracking and feedback', () => {
    const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');
    expect(rules).toContain('function isCustomer()');
    expect(rules).toContain('function myPhone()');
    expect(rules).toContain('match /productRegistrations/{id}');
    expect(rules).toContain("isCustomer() && resource.data.customerPhone == myPhone()");
    expect(rules).toContain('match /publicServiceRequests/{requestId}');
    expect(rules).toContain('match /publicTicketStatus/{ticketId}');
    expect(rules).toContain('match /customerTracking/{ticketId}');
    expect(rules).toContain('allow write: if false;');

    // Customer feedback is server-controlled on the service job rather than
    // exposed as a customer-writable top-level collection. Technicians are
    // explicitly prevented from modifying this field directly.
    expect(rules).toContain("['warrantyStatus', 'serviceCharge', 'billingType', 'billingStatus', 'billingTotal', 'billedAt', 'billingComputedAt', 'customerFeedback', 'lifecycleRejected', 'scheduleRejected', 'assignmentRejected', 'appointmentMissed', 'escalation', 'idCheck']");
  });
});
