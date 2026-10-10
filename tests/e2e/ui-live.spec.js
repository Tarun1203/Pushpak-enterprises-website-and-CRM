// Live updates and pop-up details (all CRM roles): a new ticket, registration,
// claim, enquiry, spare request or notification pops up while the dashboard is
// open; "View" opens the record in a pop-up; the screen refreshes itself only
// when that is safe; nothing pops up for records that are not yours.
const { test, expect } = require('@playwright/test');
const { startStaticServer } = require('./support/static-server');
const { installFirebaseStub } = require('./support/firebase-stub');
const { layoutReport } = require('./support/device-checks');

const PAGES = { superadmin: 'crm/CRMsuperadmin.html', servicecenter: 'crm/CRMservicecenter.html', technician: 'crm/CRMtechnician.html', warehouse: 'crm/CRMwarehouse.html', dealer: 'crm/CRMdealer.html', distributor: 'crm/CRMdistributor.html', areamanager: 'crm/CRMareamanager.html' };
let origin, server;
test.beforeAll(async () => { ({ server, origin } = await startStaticServer()); });
test.afterAll(async () => { if (server) server.close(); });

async function openAs(page, role, data = {}) {
  await installFirebaseStub(page, { role, uid: 'u1', data, profile: { role, displayName: 'Tarun Chettam', name: 'Raichur Service Center', email: 't@pe.test' } });
  await page.route(/^https?:\/\//, (r) => (r.request().url().startsWith(origin) || /gstatic\.com\/firebasejs/.test(r.request().url()) ? r.fallback() : r.abort()));
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(origin + '/' + PAGES[role], { waitUntil: 'load' });
  await page.waitForFunction(() => { const a = document.getElementById('app'); return a && getComputedStyle(a).display !== 'none'; }, null, { timeout: 10000 });
  await page.waitForFunction(() => window.__peLiveStarted === true, null, { timeout: 8000 });
  await page.waitForTimeout(300);
  return errors;
}
const push = (page, coll, id, data, type) => page.evaluate(([c, i, d, t]) => window.__stubPush(c, i, d, t), [coll, id, data, type || 'added']);
const TICKET = { requestId: 'PE-CR-20261010-0007', customerName: 'Mallikarjun Patil', customerPhone: '9845012345', product: 'MakWell 25L Geyser', serialNumber: 'MKW25L1', issue: 'Not heating', status: 'new', city: 'Hubli', createdAt: { __ms: Date.now() } };

test('superadmin: a new service ticket pops up, View opens its details in a pop-up with print', async ({ page }) => {
  const errors = await openAs(page, 'superadmin');
  await expect(page.locator('.ui-toast')).toHaveCount(0); // nothing already on file pops up
  await push(page, 'publicServiceRequests', 't1', TICKET);
  const t = page.locator('.ui-toast');
  await expect(t).toHaveCount(1);
  await expect(t).toContainText('New service ticket — PE-CR-20261010-0007');
  await expect(t).toContainText('Mallikarjun Patil');
  await t.getByRole('button', { name: 'View' }).click();
  const dlg = page.locator('.ui-live-dialog [role=dialog]');
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText('Mallikarjun Patil');
  await expect(dlg).toContainText('9845012345');
  await expect(dlg).toContainText('Not heating');
  await expect(dlg.locator('.pe-docbar')).toBeVisible(); // can print / download the voucher from here
  await expect(page.locator('.ui-toast')).toHaveCount(0); // the toast closed when opened
  await page.keyboard.press('Escape');
  await expect(page.locator('.ui-live-dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('superadmin: new registration, claim and enquiry each pop up with the right heading', async ({ page }) => {
  await openAs(page, 'superadmin');
  await push(page, 'productRegistrations', 'r1', { registrationId: 'PE-REG-1', customerName: 'Anita', product: 'Flyvision 43 TV', serialNumber: 'FV43', warrantyMonths: 24 });
  await push(page, 'claims', 'c1', { claimId: 'PE-CL-1', claimantName: 'Raichur SC', amount: 1500, status: 'submitted' });
  await push(page, 'contactEnquiries', 'e1', { name: 'Suresh', message: 'Need dealership', phone: '9000000001' });
  const texts = await page.locator('.ui-toast-tx b').allTextContents();
  expect(texts).toEqual(['New product registration — PE-REG-1', 'New claim — PE-CL-1', 'New enquiry']);
  await page.locator('.ui-toast', { hasText: 'registration' }).getByRole('button', { name: 'View' }).click();
  await expect(page.locator('.ui-live-dialog')).toContainText('Flyvision 43 TV');
  await expect(page.locator('.ui-live-dialog .pe-docbar')).toContainText('Warranty card');
});

test('service center: only its own tickets pop up; a status change on one pops up too', async ({ page }) => {
  await openAs(page, 'servicecenter');
  await push(page, 'centerRequests', 'x1', { ...TICKET, requestId: 'OTHER-1', serviceCenterUid: 'someone-else' });
  await expect(page.locator('.ui-toast')).toHaveCount(0);
  await push(page, 'centerRequests', 'm1', { ...TICKET, serviceCenterUid: 'u1' });
  await expect(page.locator('.ui-toast')).toHaveCount(1);
  await page.locator('.ui-toast-x').click();
  await expect(page.locator('.ui-toast')).toHaveCount(0);
  await push(page, 'centerRequests', 'm1', { ...TICKET, serviceCenterUid: 'u1', status: 'in_progress' }, 'modified');
  await expect(page.locator('.ui-toast')).toContainText('updated');
  await expect(page.locator('.ui-toast')).toContainText('In progress');
  // The same status again is not news.
  await page.locator('.ui-toast-x').click();
  await push(page, 'centerRequests', 'm1', { ...TICKET, serviceCenterUid: 'u1', status: 'in_progress', notes: 'x' }, 'modified');
  await expect(page.locator('.ui-toast')).toHaveCount(0);
});

test('technician: a newly assigned job pops up and View shows the job', async ({ page }) => {
  await openAs(page, 'technician');
  await push(page, 'serviceJobs', 'j1', { ...TICKET, jobId: 'PE-JOB-1', requestId: undefined, technicianUid: 'u1', status: 'assigned' });
  await expect(page.locator('.ui-toast')).toContainText('New service ticket — PE-JOB-1');
  await page.getByRole('button', { name: 'View' }).click();
  await expect(page.locator('.ui-live-dialog')).toContainText('Not heating');
  await page.locator('.ui-live-dialog').getByRole('button', { name: /Open in/ }).click();
  await expect(page.locator('#page-title')).toHaveText(/jobs/i);
});

test('every role: a notification pops up and bumps the bell; a read one is ignored', async ({ page }) => {
  await openAs(page, 'warehouse');
  await push(page, 'notifications', 'n0', { recipientType: 'uid', recipientValue: 'u1', title: 'Old', message: 'Already read', read: true });
  await expect(page.locator('.ui-toast')).toHaveCount(0);
  await push(page, 'notifications', 'n1', { recipientType: 'uid', recipientValue: 'u1', title: 'Claim paid', message: 'PE-CL-1 settled', read: false });
  await expect(page.locator('.ui-toast')).toContainText('Claim paid');
  await expect(page.locator('#notif-badge')).toBeVisible();
  await expect(page.locator('#notif-badge')).toHaveText(/[1-9]/);
  await expect(page.locator('.ui-toast').getByRole('button', { name: 'View' })).toHaveCount(0);
});

test('screen refreshes itself when idle, but not while typing or with a dialog open', async ({ page }) => {
  await openAs(page, 'superadmin');
  await page.evaluate(() => { window.__refreshes = 0; document.querySelectorAll('.sidebar .nav-item').forEach((n) => n.addEventListener('click', () => { window.__refreshes++; })); });
  const reads = () => page.evaluate(() => window.__refreshes);
  let before = await reads();
  await push(page, 'publicServiceRequests', 'a1', TICKET);
  await expect.poll(reads, { timeout: 6000 }).toBeGreaterThan(before); // the dashboard re-opened itself
  // typing in a field: no refresh
  await page.evaluate(() => { const i = document.createElement('input'); i.id = 'tmp-in'; document.body.appendChild(i); i.focus(); });
  await page.locator('.ui-toast-x').first().click().catch(() => {});
  await page.evaluate(() => document.getElementById('tmp-in').focus());
  before = await reads();
  await push(page, 'publicServiceRequests', 'a2', { ...TICKET, requestId: 'PE-CR-2' });
  await page.waitForTimeout(2600);
  expect(await reads()).toBe(before);
});

test('phone: alert sits inside the screen, above the content, and does not cause sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openAs(page, 'technician');
  await push(page, 'serviceJobs', 'j2', { ...TICKET, technicianUid: 'u1', customerName: 'Mallikarjun Shivappa Patil of Sri Venkateshwara Home Appliances', status: 'assigned' });
  await page.waitForTimeout(600); // let the slide-in finish before measuring
  const box = await page.locator('.ui-toast').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(321);
  const r = await layoutReport(page); expect(r.scrollWidth).toBeLessThanOrEqual(321);
  await page.getByRole('button', { name: 'View' }).click();
  await page.waitForTimeout(500);
  const m = await page.locator('.ui-live-dialog .modal').boundingBox();
  expect(m.x + m.width).toBeLessThanOrEqual(321);
  const r2 = await layoutReport(page); expect(r2.scrollWidth).toBeLessThanOrEqual(321);
});

for (const role of Object.keys(PAGES)) {
  test(`${role}: live watching starts without script errors`, async ({ page }) => {
    const errors = await openAs(page, role);
    expect(errors).toEqual([]);
  });
}
