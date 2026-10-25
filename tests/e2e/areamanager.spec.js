// Area Service Manager portal: Super Admin powers inside the manager's own
// districts — every screen works, tickets can be routed / assigned / moved,
// centers and technicians approved; nothing outside the area is touched.
const { test, expect } = require('@playwright/test');
const { startStaticServer } = require('./support/static-server');
const { installFirebaseStub } = require('./support/firebase-stub');
const { sampleFor } = require('./support/sample-data');

let origin, server;
test.beforeAll(async () => { ({ server, origin } = await startStaticServer()); });
test.afterAll(async () => { if (server) server.close(); });

async function openAm(page, data = sampleFor('areamanager')) {
  await installFirebaseStub(page, { role: 'areamanager', uid: 'u1', data });
  await page.route(/^https?:\/\//, (r) => (r.request().url().startsWith(origin) || /gstatic\.com\/firebasejs/.test(r.request().url()) ? r.fallback() : r.abort()));
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => (d.type() === 'prompt' ? d.accept('Documents incomplete') : d.accept()));
  await page.goto(origin + '/crm/CRMareamanager.html', { waitUntil: 'load' });
  await page.waitForFunction(() => { const a = document.getElementById('app'); return a && getComputedStyle(a).display !== 'none'; }, null, { timeout: 10000 });
  await page.waitForTimeout(400);
  return errors;
}
const nav = (page, label) => page.locator('.sidebar .nav-item', { hasText: new RegExp('^\\s*' + label + '\\s*$') }).first().click();
const writes = (page) => page.evaluate(() => window.__stubWrites || []);

test('every Area Manager screen is built (no "not built yet") and loads without errors', async ({ page }) => {
  const errors = await openAm(page);
  await expect(page.locator('#content')).toContainText('Raichur');
  const labels = await page.locator('.sidebar .nav-item').allTextContents();
  expect(labels.length).toBe(14);
  for (const l of labels) {
    await nav(page, l.trim());
    await expect(page.locator('#content')).not.toContainText(/Loading your area|isn.t built|Could not load/, { timeout: 5000 });
  }
  expect(await page.locator('.nav-badge').count()).toBe(0);
  expect(errors).toEqual([]);
});

test('ticket queries are limited to the manager\'s districts', async ({ page }) => {
  await openAm(page);
  await nav(page, 'Service Requests');
  await expect(page.locator('#content table tbody tr').first()).toBeVisible();
  const reads = await page.evaluate(() => window.__reads.filter((r) => r.kind === 'query' && /^(centerRequests|serviceJobs|publicServiceRequests)$/.test(r.path)));
  expect(reads.length).toBeGreaterThan(0);
  expect(reads.every((r) => r.filtered)).toBe(true);
});

test('route a website request to a service center in the area', async ({ page }) => {
  await openAm(page);
  await nav(page, 'Assignment & Routing');
  await page.locator('.am-route').first().click();
  await page.selectOption('#am-r-center', 'servicecenter0');
  await page.click('#am-r-center-go');
  await expect(page.locator('.am-msg')).toContainText('Sent');
  const w = await writes(page);
  const add = w.find(([op, p]) => op === 'add' && p === 'centerRequests');
  expect(add[2]).toMatchObject({ serviceCenterUid: 'servicecenter0', district: 'Raichur', status: 'new' });
  expect(w.some(([op, p, d]) => op === 'update' && p.startsWith('publicServiceRequests/') && d.status === 'assigned_to_center')).toBe(true);
});

test('route a website request straight to a direct technician', async ({ page }) => {
  await openAm(page);
  await nav(page, 'Assignment & Routing');
  await page.locator('.am-route').first().click();
  await page.selectOption('#am-r-tech', 'technician0');
  await page.click('#am-r-tech-go');
  await expect(page.locator('.am-msg')).toContainText('technician');
  const job = (await writes(page)).find(([op, p]) => op === 'set' && p.startsWith('serviceJobs/route_'));
  expect(job[2]).toMatchObject({ technicianUid: 'technician0', status: 'assigned', district: 'Raichur', directTechnician: true });
});

test('assign a technician, and move a ticket to another center', async ({ page }) => {
  await openAm(page);
  await nav(page, 'Service Requests');
  await page.locator('.am-act').first().click();
  await page.selectOption('#am-tech', 'technician1');
  await page.click('#am-tech-save');
  await expect(page.locator('.am-msg')).toContainText('Assigned');
  let w = await writes(page);
  expect(w.some(([op, , d]) => op === 'update' && d.technicianUid === 'technician1')).toBe(true);
  await page.waitForTimeout(900);
  const center = page.locator('#content tr', { hasText: 'Center ticket' }).locator('.am-act').first();
  await center.click();
  await page.selectOption('#am-center', 'servicecenter1');
  await page.click('#am-center-save');
  await expect(page.locator('.am-msg')).toContainText('Moved');
  w = await writes(page);
  const fresh = w.filter(([op, p]) => op === 'add' && p === 'centerRequests').pop()[2];
  expect(fresh).toMatchObject({ serviceCenterUid: 'servicecenter1', status: 'new', district: 'Raichur', technicianUid: null });
  expect(fresh.billingTotal).toBeUndefined();
  expect(w.some(([op, p, d]) => op === 'update' && p.startsWith('centerRequests/') && d.status === 'cancelled')).toBe(true);
});

test('SLA screen lists the breached ticket; coverage flags the uncovered pincode', async ({ page }) => {
  await openAm(page);
  await nav(page, 'SLA & Escalation');
  await expect(page.locator('#content')).toContainText('Breached');
  await nav(page, 'Coverage Areas');
  await expect(page.locator('#content')).toContainText('584199');
  await expect(page.locator('#content')).toContainText('Nobody covers this pincode');
});

test('approve a pending center and a new technician', async ({ page }) => {
  await openAm(page);
  await nav(page, 'Service Center Approvals');
  await page.locator('.am-sc[data-s="ACTIVE"]').first().click();
  await expect.poll(async () => (await writes(page)).some(([op, p, d]) => op === 'update' && p === 'serviceCenterProfiles/servicecenter2' && d.status === 'ACTIVE')).toBe(true);
  await nav(page, 'Onboarding Approvals');
  await page.locator('.am-tc[data-s="TERMINATED"]').first().click();
  await expect.poll(async () => (await writes(page)).find(([op, p]) => op === 'update' && p === 'centerTechnicians/ct3')).toBeTruthy();
  const w = (await writes(page)).find(([op, p]) => op === 'update' && p === 'centerTechnicians/ct3');
  expect(w[2]).toMatchObject({ employmentStatus: 'TERMINATED', onboardingApproval: { decision: 'rejected', reason: 'Documents incomplete', byRole: 'areamanager' } });
});

test('a manager with no districts sees a clear message, not an error', async ({ page }) => {
  const data = sampleFor('areamanager'); data.users[0].districtsCovered = [];
  const errors = await openAm(page, data);
  await expect(page.locator('#content')).toContainText('No districts assigned');
  expect(errors).toEqual([]);
});
