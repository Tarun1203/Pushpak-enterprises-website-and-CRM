// MakWell CRM changes list (12 Oct 2026): add service center button, technicians
// for areas with no service center, installation closure, rate card in center
// billing, approved rates taking effect, line-by-line rate approval.
const { test, expect } = require('@playwright/test');
const { startStaticServer } = require('./support/static-server');
const { installFirebaseStub } = require('./support/firebase-stub');
const { sampleFor } = require('./support/sample-data');

const PAGES = { superadmin: 'crm/CRMsuperadmin.html', servicecenter: 'crm/CRMservicecenter.html', technician: 'crm/CRMtechnician.html' };
let origin, server;
test.beforeAll(async () => { ({ server, origin } = await startStaticServer()); });
test.afterAll(async () => { if (server) server.close(); });

async function openAs(page, role, data) {
  await installFirebaseStub(page, { role, uid: 'u1', data, profile: { role, displayName: 'Tarun', email: 't@pe.test' } });
  await page.route(/^https?:\/\//, (r) => (r.request().url().startsWith(origin) || /gstatic\.com\/firebasejs/.test(r.request().url()) ? r.fallback() : r.abort()));
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(origin + '/' + PAGES[role], { waitUntil: 'load' });
  await page.waitForFunction(() => { const a = document.getElementById('app'); return a && getComputedStyle(a).display !== 'none'; }, null, { timeout: 10000 });
  await page.waitForTimeout(400);
  return errors;
}
const nav = (page, label) => page.locator('.sidebar .nav-item', { hasText: new RegExp('^\\s*' + label + '\\s*$') }).first().click();
const writes = (page) => page.evaluate(() => window.__stubWrites || []);

test('1. Service Centers has "+ Add service center", opening the account form with Service Center already chosen', async ({ page }) => {
  const errors = await openAs(page, 'superadmin', sampleFor('superadmin'));
  await nav(page, 'Service Centers');
  const btn = page.locator('#open-add-center');
  await expect(btn).toBeVisible();
  await btn.click();
  await expect(page.locator('#new-user-role')).toHaveValue('servicecenter');
  await expect(page.locator('#new-user-districts-row')).toBeVisible();
  await expect(page.locator('#new-user-categories-row')).toBeVisible();
  expect(errors).toEqual([]);
});

test('3. a technician account can be given areas (districts / pincodes) to serve directly', async ({ page }) => {
  await openAs(page, 'superadmin', sampleFor('superadmin'));
  await nav(page, 'Users & Access');
  await page.click('#open-add-user');
  await page.selectOption('#new-user-role', 'technician');
  await expect(page.locator('#new-user-districts-row')).toBeVisible();
  await expect(page.locator('#new-user-pincodes-row')).toBeVisible();
  await expect(page.locator('#new-user-districts-row')).toContainText('For a technician');
});

test('3. Super Admin can assign a website ticket straight to a technician who covers the area (no service center)', async ({ page }) => {
  const data = sampleFor('superadmin');
  data.publicServiceRequests = [{ id: 'PE-SVC-20261012-0001-CustomerSite', requestId: 'PE-SVC-20261012-0001-CustomerSite', customerName: 'Guru', customerPhone: '9342618555', address: 'Main Road', city: 'Sindhanur', pincode: '584128', brand: 'MakWell', category: 'Geyser', requestType: 'service', issueDescription: 'No power', status: 'new', source: 'public-site', createdAt: { __ms: Date.now() - 3600000 } }];
  data.users = (data.users || []).concat([
    { id: 'tA', role: 'technician', name: 'Anand (Sindhanur)', email: 'anand@pe.test', pincodesCovered: ['584128'] },
    { id: 'tB', role: 'technician', name: 'Basava', email: 'basava@pe.test' }
  ]);
  const errors = await openAs(page, 'superadmin', data);
  await nav(page, 'Service');
  await page.locator('.content tbody tr', { hasText: 'Guru' }).first().locator('a.c360-open-link').click();
  const sel = page.locator('#svc-popup-tech-select');
  await expect(sel).toBeVisible();
  await expect(sel.locator('option').nth(1)).toContainText('Anand (Sindhanur) — ✓ covers this pincode');
  await sel.selectOption('tA');
  await page.click('#svc-popup-tech-btn');
  await expect.poll(async () => (await writes(page)).some(([op, p]) => op === 'set' && p === 'serviceJobs/route_PE-SVC-20261012-0001-CustomerSite')).toBe(true);
  const w = await writes(page);
  const job = w.find(([op, p]) => op === 'set' && p === 'serviceJobs/route_PE-SVC-20261012-0001-CustomerSite')[2];
  expect(job).toMatchObject({ jobId: 'PE-SVC-20261012-0001-CustomerSite', technicianUid: 'tA', status: 'assigned', customerPhone: '9342618555', type: 'service', directTechnician: true, sourceRequestId: 'PE-SVC-20261012-0001-CustomerSite' });
  expect(w.some(([op, p, d]) => op === 'update' && p === 'publicServiceRequests/PE-SVC-20261012-0001-CustomerSite' && d.status === 'assigned' && d.technicianUid === 'tA')).toBe(true);
  expect(errors).toEqual([]);
});

function centerTickets() {
  const base = { serviceCenterUid: 'u1', customerName: 'Guru', customerPhone: '9342618555', address: 'Raichur', status: 'in_progress', createdAt: { __ms: Date.now() - 86400000 }, updatedAt: { __ms: Date.now() - 86400000 } };
  return [
    { ...base, id: 'crI', requestId: 'PE-CR-20261012-0001-ServiceCenter', type: 'installation', product: 'MakWell 25L Geyser', category: 'Geyser' },
    { ...base, id: 'crR', requestId: 'PE-CR-20261012-0002-ServiceCenter', type: 'service', product: '40 Iron Box', category: 'Iron Box', customerName: 'Mallik' }
  ];
}

test('4. Installation closure: installation outcomes and a checklist (repair keeps repair codes)', async ({ page }) => {
  const data = sampleFor('servicecenter'); data.centerRequests = centerTickets(); data.spareRequests = [];
  const errors = await openAs(page, 'servicecenter', data);
  await nav(page, 'Center Requests');
  await page.locator('tr', { hasText: 'PE-CR-20261012-0001' }).locator('.req-complete-btn').first().click();
  const ov = page.locator('#sc-closure-overlay');
  await expect(ov).toBeVisible();
  await expect(ov.locator('h3')).toHaveText('Complete installation');
  await expect(page.locator('#sc-closure-code option')).toHaveText(['Select…', 'Installed & working', 'Installed + demo given to customer', 'Unable to install — escalated', 'Customer Cancelled']);
  await expect(ov.locator('.install-checklist')).toBeVisible();
  await page.selectOption('#sc-closure-code', 'installed_demo');
  await page.fill('#sc-closure-notes', 'Bathroom wall, inlet/outlet connected, MCB checked');
  await page.fill('#sc-closure-parts-notes', 'None');
  await page.check('#sc-inst-check-2'); await page.check('#sc-inst-check-3');
  await page.click('#sc-closure-form button[type=submit]');
  await expect.poll(async () => (await writes(page)).some(([op, p, d]) => op === 'update' && p === 'centerRequests/crI' && d.status === 'completed')).toBe(true);
  const upd = (await writes(page)).find(([op, p, d]) => op === 'update' && p === 'centerRequests/crI' && d.status === 'completed')[2];
  expect(upd).toMatchObject({ closureCode: 'installed_demo', installationChecklist: ['Tested and working', 'Demo given to customer'] });
  await page.waitForTimeout(1000);
  await page.locator('tr', { hasText: 'PE-CR-20261012-0002' }).locator('.req-complete-btn').first().click();
  await expect(ov.locator('h3')).toHaveText('Complete request');
  await expect(page.locator('#sc-closure-code option').nth(1)).toHaveText('Repaired');
  await expect(ov.locator('.install-checklist')).toBeHidden();
  expect(errors).toEqual([]);
});

test('5. Center billing finds the rate-card charge even when the ticket has no size recorded (size guessed, can be changed)', async ({ page }) => {
  const data = sampleFor('servicecenter');
  data.productCategories = [{ id: 'c1', name: 'Geyser', sizeBuckets: ['15L', '25L'] }];
  data.serviceChargeRates = [{ id: 'default_geyser_repair_25l', scope: 'default', category: 'Geyser', type: 'repair', bucket: '25L', amount: 450 },
    { id: 'default_geyser_repair_15l', scope: 'default', category: 'Geyser', type: 'repair', bucket: '15L', amount: 350 }];
  data.productRegistrations = [{ id: 'r1', serialNumber: 'MKW25L01', purchaseDate: new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10), warrantyMonths: 24, customerPhone: '9342618555' }];
  data.centerRequests = [{ id: 'crB', requestId: 'PE-CR-20261012-0003-ServiceCenter', serviceCenterUid: 'u1', customerName: 'Guru', serialNumber: 'MKW25L01', product: 'MakWell 25L Storage Water Heater', category: 'Geyser', type: 'service', status: 'completed', closedAt: { __ms: Date.now() - 3600000 }, updatedAt: { __ms: Date.now() - 3600000 } }];
  const errors = await openAs(page, 'servicecenter', data);
  await nav(page, 'Service Billing');
  await page.locator('.billing-bill-btn').first().click();
  await expect(page.locator('#billing-rate-bucket')).toHaveValue('25L');
  await expect(page.locator('#billing-rate-amount')).toHaveText('₹450');
  await page.selectOption('#billing-rate-bucket', '15L');
  await expect(page.locator('#billing-rate-amount')).toHaveText('₹350');
  await page.click('#submit-billing');
  await expect.poll(async () => (await writes(page)).some(([op, p, d]) => op === 'update' && p === 'centerRequests/crB' && d.billingRequest)).toBe(true);
  const upd = (await writes(page)).find(([op, p, d]) => op === 'update' && p === 'centerRequests/crB' && d.billingRequest)[2];
  expect(upd.sizeBucket).toBe('15L');
  expect(upd.billingRequest.treatAs).toBe('in');
  expect(errors).toEqual([]);
});

test('6 + 7. Rate request: one row per line, each approved / rejected / edited; approved rates written at once', async ({ page }) => {
  const data = sampleFor('superadmin');
  data.changeRequests = [{ id: 'cr1', kind: 'center_rate', status: 'pending', requestedByUid: 'scX', requestedByEmail: 'center@pe.test', createdAt: { __ms: Date.now() - 3600000 },
    payload: { rates: [{ category: 'Geyser', rateType: 'repair', bucket: '25L', amount: 500 }, { category: 'Iron Box', rateType: 'repair', bucket: null, amount: 200 }] }, summary: 'x' }];
  data.serviceChargeRates = [{ id: 'default_geyser_repair_25l', scope: 'default', amount: 450 }];
  const errors = await openAs(page, 'superadmin', data);
  await nav(page, 'Approvals');
  const lines = page.locator('.rate-req-table tbody tr');
  await expect(lines).toHaveCount(2);
  await expect(lines.nth(0).locator('.rr-current')).toHaveText('₹450 (HO default)');
  await expect(lines.nth(1).locator('.rr-current')).toHaveText('Not set');
  // nothing chosen yet → refused with a reason
  await page.click('.rr-save');
  await expect(page.locator('.rr-msg')).toContainText('Choose Approve or Reject');
  await lines.nth(0).locator('input[value=approve]').check();
  await lines.nth(0).locator('.rr-amount').fill('480');
  await lines.nth(1).locator('input[value=reject]').check();
  await page.waitForTimeout(900); // the CRM ignores a second tap on the same button within 0.8 s
  await page.click('.rr-save');
  await expect(page.locator('.rr-msg')).toContainText('1 approved');
  const w = await writes(page);
  const rate = w.find(([op, p]) => op === 'set' && p === 'serviceChargeRates/center_scX_geyser_repair_25l');
  expect(rate[2]).toMatchObject({ scope: 'center', serviceCenterUid: 'scX', amount: 480, type: 'repair', bucket: '25L' });
  expect(w.some(([op, p]) => p === 'serviceChargeRates/center_scX_iron_box_repair_flat')).toBe(false);
  const upd = w.find(([op, p]) => op === 'update' && p === 'changeRequests/cr1')[2];
  expect(upd.status).toBe('approved');
  expect(upd.payload.rates).toEqual([{ category: 'Geyser', rateType: 'repair', bucket: '25L', amount: 480 }]);
  expect(upd.decisions.map((d) => d.decision)).toEqual(['approved', 'rejected']);
  expect(upd.reviewedByUid).toBe('u1');
  expect(errors).toEqual([]);
});

test('6 + 7. Rejecting every line closes the request as rejected and writes no rate', async ({ page }) => {
  const data = sampleFor('superadmin');
  data.changeRequests = [{ id: 'cr2', kind: 'center_rate', status: 'pending', requestedByUid: 'scX', requestedByEmail: 'center@pe.test', createdAt: { __ms: Date.now() },
    payload: { rates: [{ category: 'Geyser', rateType: 'installation', bucket: null, amount: 300 }] } }];
  await openAs(page, 'superadmin', data);
  await nav(page, 'Approvals');
  await page.click('.rr-all-reject');
  await page.fill('.rr-note', 'Too high for this area');
  await page.click('.rr-save');
  await expect(page.locator('.rr-msg')).toContainText('0 approved');
  const w = await writes(page);
  expect(w.some(([op, p]) => /^serviceChargeRates\//.test(p))).toBe(false);
  const upd = w.find(([op, p]) => op === 'update' && p === 'changeRequests/cr2')[2];
  expect(upd).toMatchObject({ status: 'rejected', reviewNote: 'Too high for this area', payload: { rates: [] } });
});

test('who pays: Warehouse sets it per rate card row (e.g. free installation for some models) and it is saved', async ({ page }) => {
  const data = sampleFor('warehouse');
  data.productCategories = [{ id: 'c1', name: 'LED TV', sizeBuckets: ['Skevia 43"', 'MakWell 32"'] }];
  data.serviceChargeRates = [{ id: 'default_led_tv_installation_skevia_43_', scope: 'default', amount: 400, payer: 'company' }];
  await installFirebaseStub(page, { role: 'warehouse', uid: 'u1', data, profile: { role: 'warehouse', displayName: 'W', email: 'w@pe.test' } });
  await page.route(/^https?:\/\//, (r) => (r.request().url().startsWith(origin) || /gstatic\.com\/firebasejs/.test(r.request().url()) ? r.fallback() : r.abort()));
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(origin + '/crm/CRMwarehouse.html', { waitUntil: 'load' });
  await page.waitForFunction(() => { const a = document.getElementById('app'); return a && getComputedStyle(a).display !== 'none'; }, null, { timeout: 10000 });
  await page.locator('.sidebar .nav-item', { hasText: /Service Charge Rates|Rate Card/ }).first().click();
  const sel = (bucket, type) => page.locator(`.rate-card-payer[data-category="LED TV"][data-bucket='${bucket}'][data-type="${type}"]`);
  await expect(sel('Skevia 43"', 'installation')).toHaveValue('company');
  await expect(sel('MakWell 32"', 'installation')).toHaveValue('warranty');
  await sel('MakWell 32"', 'installation').selectOption('customer');
  await page.locator(`.rate-card-input[data-category="LED TV"][data-bucket='MakWell 32"'][data-type="installation"]`).fill('350');
  await page.click('#save-rate-card');
  await expect(page.locator('#rate-card-success')).toContainText('Saved');
  const w = await writes(page);
  expect(w.find(([op, p]) => op === 'set' && p === 'serviceChargeRates/default_led_tv_installation_makwell_32_')[2]).toMatchObject({ amount: 350, payer: 'customer', scope: 'default' });
  expect(w.find(([op, p]) => op === 'set' && p === 'serviceChargeRates/default_led_tv_installation_skevia_43_')[2]).toMatchObject({ payer: 'company' });
  expect(errors).toEqual([]);
});

function billingData(payer, purchaseDaysAgo, type) {
  const data = sampleFor('servicecenter');
  data.productCategories = [{ id: 'c1', name: 'LED TV', sizeBuckets: [] }];
  data.serviceChargeRates = [{ id: `default_led_tv_${type}_flat`, scope: 'default', amount: 400, payer }];
  data.productRegistrations = [{ id: 'r1', serialNumber: 'SKV43X1', purchaseDate: new Date(Date.now() - purchaseDaysAgo * 86400000).toISOString().slice(0, 10), warrantyMonths: 12 }];
  data.centerRequests = [{ id: 'crP', requestId: 'PE-CR-20261012-0009-ServiceCenter', serviceCenterUid: 'u1', customerName: 'Guru', serialNumber: 'SKV43X1', product: 'Skevia 43 LED TV', category: 'LED TV', type, status: 'completed', closedAt: { __ms: Date.now() }, updatedAt: { __ms: Date.now() } }];
  return data;
}

test('who pays in center billing: company-paid installation is claimed from Head Office even out of warranty', async ({ page }) => {
  const errors = await openAs(page, 'servicecenter', billingData('company', 800, 'installation'));
  await nav(page, 'Service Billing');
  await page.locator('.billing-bill-btn').first().click();
  await expect(page.locator('#billing-payer-note')).toContainText('company pays');
  await expect(page.locator('#billing-billas-row')).toBeHidden();
  await expect(page.locator('#billing-rate-amount')).toHaveText('₹400');
  await expect(page.locator('#billing-customer-fields')).toBeHidden();
  await page.click('#submit-billing');
  await expect.poll(async () => (await writes(page)).some(([op, p, d]) => op === 'update' && p === 'centerRequests/crP' && d.billingRequest)).toBe(true);
  expect((await writes(page)).find(([op, p, d]) => op === 'update' && p === 'centerRequests/crP' && d.billingRequest)[2].billingRequest.treatAs).toBe('in');
  expect(errors).toEqual([]);
});

test('who pays in center billing: customer-paid job is billed to the customer even in warranty', async ({ page }) => {
  await openAs(page, 'servicecenter', billingData('customer', 30, 'installation'));
  await nav(page, 'Service Billing');
  await page.locator('.billing-bill-btn').first().click();
  await expect(page.locator('#billing-payer-note')).toContainText('customer pays');
  await expect(page.locator('#billing-customer-fields')).toBeVisible();
  await expect(page.locator('#billing-in-warranty-fields')).toBeHidden();
});

test('who pays in center billing: "as per warranty" keeps today\'s behaviour (no note)', async ({ page }) => {
  await openAs(page, 'servicecenter', billingData('warranty', 30, 'service'));
  await nav(page, 'Service Billing');
  await page.locator('.billing-bill-btn').first().click();
  await expect(page.locator('#billing-billas-row')).toBeVisible();
  await expect(page.locator('#billing-payer-note')).toBeHidden();
});

test('center rate card shows Head Office\'s rate and who pays, also for sizes like 43" (quotes)', async ({ page }) => {
  const data = sampleFor('servicecenter');
  data.productCategories = [{ id: 'c1', name: 'LED TV', sizeBuckets: ['Skevia 43"'] }];
  data.serviceChargeRates = [{ id: 'default_led_tv_installation_skevia_43_', scope: 'default', amount: 400, payer: 'company' },
    { id: 'center_u1_led_tv_repair_skevia_43_', scope: 'center', serviceCenterUid: 'u1', amount: 275 }];
  const errors = await openAs(page, 'servicecenter', data);
  await page.locator('.sidebar .nav-item', { hasText: /Service Charge Rates/ }).first().click();
  const row = page.locator('#rate-card-tbody tr', { hasText: 'Skevia 43"' });
  await expect(row).toContainText('₹400 · company pays (free to customer)');
  await expect(row.locator('.rate-card-input[data-type="repair"]')).toHaveValue('275');
  expect(errors).toEqual([]);
});

test('Who pays by brand: Warehouse sets "Skevia: company pays" for installation / demo and service', async ({ page }) => {
  const data = sampleFor('warehouse');
  data.brands = [{ id: 'makwell', name: 'MakWell' }, { id: 'skevia', name: 'Skevia' }];
  data.serviceChargeRates = [{ id: 'brandpayer_makwell_installation', scope: 'default', kind: 'brand_payer', payer: 'customer' }];
  await installFirebaseStub(page, { role: 'warehouse', uid: 'u1', data, profile: { role: 'warehouse', displayName: 'W', email: 'w@pe.test' } });
  await page.route(/^https?:\/\//, (r) => (r.request().url().startsWith(origin) || /gstatic\.com\/firebasejs/.test(r.request().url()) ? r.fallback() : r.abort()));
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(origin + '/crm/CRMwarehouse.html', { waitUntil: 'load' });
  await page.waitForFunction(() => { const a = document.getElementById('app'); return a && getComputedStyle(a).display !== 'none'; }, null, { timeout: 10000 });
  await nav(page, 'Service Charge Rates');
  const sk = page.locator('#brand-payer-tbody tr', { hasText: 'Skevia' });
  await expect(page.locator('#brand-payer-tbody tr', { hasText: 'MakWell' }).locator('select[data-type=installation]')).toHaveValue('customer');
  await sk.locator('select[data-type=installation]').selectOption('company');
  await sk.locator('select[data-type=repair]').selectOption('company');
  await page.click('#save-brand-payer');
  await expect(page.locator('#brand-payer-success')).toContainText('Saved 2 brand rules');
  const w = await writes(page);
  expect(w.find(([op, p]) => op === 'set' && p === 'serviceChargeRates/brandpayer_skevia_installation')[2]).toMatchObject({ kind: 'brand_payer', brand: 'Skevia', type: 'installation', payer: 'company', scope: 'default' });
  expect(w.find(([op, p]) => op === 'set' && p === 'serviceChargeRates/brandpayer_skevia_repair')[2]).toMatchObject({ payer: 'company' });
  expect(errors).toEqual([]);
});

test('Who pays by brand: a Skevia installation out of warranty is still billed to the company (free to the customer)', async ({ page }) => {
  const data = sampleFor('servicecenter');
  data.productCategories = [{ id: 'c1', name: 'Smart TV' }];
  data.serviceChargeRates = [{ id: 'default_smart_tv_installation_flat', scope: 'default', amount: 300, payer: 'customer' },
    { id: 'brandpayer_skevia_installation', scope: 'default', kind: 'brand_payer', payer: 'company' }];
  data.productRegistrations = [{ id: 'r1', serialNumber: 'SKV43', purchaseDate: '2023-01-01', warrantyMonths: 12 }];
  data.centerRequests = [{ id: 'crS', requestId: 'PE-CR-20261013-0001-ServiceCenter', serviceCenterUid: 'u1', customerName: 'Guru', serialNumber: 'SKV43', brand: 'Skevia', product: 'Skevia 43 inch TV', category: 'Smart TV', type: 'installation', status: 'completed', closedAt: { __ms: Date.now() - 3600000 }, updatedAt: { __ms: Date.now() - 3600000 } }];
  const errors = await openAs(page, 'servicecenter', data);
  await nav(page, 'Service Billing');
  await page.locator('.billing-bill-btn').first().click();
  await expect(page.locator('#billing-payer-note')).toContainText('Skevia rule: company pays');
  await expect(page.locator('#billing-warranty-override')).toHaveValue('in');
  await expect(page.locator('#billing-rate-amount')).toHaveText('₹300');
  expect(errors).toEqual([]);
});

test('Website booking tells the customer when the brand gives free installation / demo', async ({ page }) => {
  await installFirebaseStub(page, { role: 'none', uid: 'u1', data: { serviceChargeRates: [{ id: 'brandpayer_skevia_installation', scope: 'default', kind: 'brand_payer', payer: 'company' }] } });
  await page.route(/^https?:\/\//, (r) => (r.request().url().startsWith(origin) || /gstatic\.com\/firebasejs/.test(r.request().url()) ? r.fallback() : r.abort()));
  await page.addInitScript(() => localStorage.setItem('pe.consent', JSON.stringify({ v: 1, essential: true, analytics: false, preferences: false, at: new Date().toISOString() })));
  await page.goto(origin + '/index.html#book-service', { waitUntil: 'load' });
  await page.waitForTimeout(500);
  const ov = page.locator('#book-overlay');
  await expect(ov).toBeVisible();
  const cont = ov.locator('button', { hasText: /continue without/i });
  if (await cont.count()) await cont.first().click();
  await page.selectOption('#book-request-type', 'installation');
  await page.selectOption('#book-form select[name=brand]', 'Skevia');
  await expect(page.locator('#book-payer-note')).toHaveText('Installation and demo for Skevia products is free — no charge to you.');
  await page.selectOption('#book-form select[name=brand]', 'MakWell');
  await expect(page.locator('#book-payer-note')).toBeHidden();
});
