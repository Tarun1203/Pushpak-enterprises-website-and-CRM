const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const CRM_BASE = './crm/';

function readRuleFile(name) {
  return fs.readFileSync(path.join(ROOT, name), 'utf8');
}

function countMatches(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

async function loginAsQa(page) {
  test.skip(!process.env.QA_EMAIL || !process.env.QA_PASSWORD,
    'Phase 5 browser isolation checks require QA_EMAIL and QA_PASSWORD GitHub Actions secrets.');
  test.skip((process.env.QA_ROLE || '').toLowerCase() !== 'servicecenter',
    'Phase 5 browser isolation checks require QA_ROLE=servicecenter.');

  await page.goto(`${CRM_BASE}login.html`, { waitUntil: 'domcontentloaded' });
  await page.locator('#email').fill(process.env.QA_EMAIL);
  await page.locator('#password').fill(process.env.QA_PASSWORD);
  await page.locator('#login-btn').click();
  await page.waitForURL(/CRMservicecenter\.html$/, { timeout: 20_000 });
  await expect(page.locator('#app')).toBeVisible({ timeout: 10_000 });
}

test('Phase 5 Firestore rules enforce role, ownership and protected-field boundaries', async () => {
  const rules = readRuleFile('firestore.rules');

  expect(rules).toContain("function isSignedIn()");
  expect(rules).toContain("function isSuperAdmin()");
  expect(rules).toContain("function isAdmin()");
  expect(rules).toContain("function isStaff()");

  // No client-side wildcard write escape hatch.
  expect(rules).not.toMatch(/match\s+\/\{[^}]*\}\s*\{[\s\S]*?allow\s+read,\s*write:\s*if\s+true/i);
  expect(rules).toMatch(/match\s+\/\{allPaths=\*\*\}[\s\S]*?allow\s+read,\s*write:\s*if\s+false/i);

  // Service jobs must remain technician-owned or admin-readable/writable.
  expect(rules).toMatch(/match\s+\/serviceJobs\/\{jobId\}[\s\S]*?resource\.data\.technicianUid\s*==\s*request\.auth\.uid/);
  expect(rules).toMatch(/serviceJobs\/[\s\S]*?warrantyStatus[\s\S]*?billingTotal/);

  // Center requests must remain scoped to the center/assigned technician.
  expect(rules).toMatch(/match\s+\/centerRequests\/\{reqId\}[\s\S]*?serviceCenterUid\s*==\s*request\.auth\.uid/);
  expect(rules).toMatch(/centerRequests\/[\s\S]*?technicianUid\s*==\s*request\.auth\.uid/);

  // Users cannot self-edit routing, authorization or employment-control fields.
  const protectedUserFields = [
    'districtsCovered', 'pincodesCovered', 'brandsAuthorized',
    'linkedServiceCenterUid', 'createdAt', 'distributionType',
    'distributorUid', 'accountType', 'contractEndDate', 'skills',
  ];
  for (const field of protectedUserFields) {
    expect(rules, `users self-edit protection missing for ${field}`)
      .toContain(`'${field}'`);
  }

  // Only Super Admin may create/change Super Admin accounts.
  expect(rules).toMatch(/request\.resource\.data\.role\s*!=\s*'superadmin'\s*\|\|\s*isSuperAdmin\(\)/);

  // Service Center / Technician human-readable codes must not be client counters.
  expect(rules).toContain('counters/servicecenter-master');
  expect(rules).toContain('counters/technician-master');
  expect(rules).toMatch(/servicecenter-master[\s\S]*?only the Cloud Functions[\s\S]*?may write/i);
  expect(rules).toMatch(/technician-master[\s\S]*?only the Cloud Functions[\s\S]*?may write/i);

  // Counter mutation is monotonic and limited to +1.
  expect(countMatches(rules, /request\.resource\.data\.value\s*==\s*resource\.data\.value\s*\+\s*1/g)).toBeGreaterThanOrEqual(1);
});

test('Phase 5 Storage rules enforce ownership, file type and size boundaries', async () => {
  const rules = readRuleFile('storage.rules');

  expect(rules).toContain("function signedIn()");
  expect(rules).toContain("function role()");
  expect(rules).toContain("function isAdmin()");
  expect(rules).toContain("function isStaff()");
  expect(rules).toMatch(/request\.resource\.size\s*<\s*10\s*\*\s*1024\s*\*\s*1024/);
  expect(rules).toMatch(/request\.resource\.contentType\.matches\('image\/\.\*'\)/);
  expect(rules).toMatch(/match\s+\/\{allPaths=\*\*\}[\s\S]*?allow\s+read,\s*write:\s*if\s+false/);

  // Job photos are scoped to the job technician / service center.
  expect(rules).toMatch(/match\s+\/serviceJobs\/\{jobId\}\/diagnosis\/[\s\S]*?technicianUid\s*==\s*request\.auth\.uid/);
  expect(rules).toMatch(/serviceJobs\/\{jobId\}\/diagnosis[\s\S]*?serviceCenterUid\s*==\s*request\.auth\.uid/);

  // Center documents and technician documents are owner/roster scoped.
  expect(rules).toMatch(/match\s+\/serviceCenterProfiles\/\{centerId\}\/documents\/[\s\S]*?request\.auth\.uid\s*==\s*centerId/);
  expect(rules).toMatch(/match\s+\/centerTechnicians\/\{techDocId\}\/documents\/[\s\S]*?serviceCenterUid\s*==\s*request\.auth\.uid/);
  expect(rules).toMatch(/centerTechnicians\/\{techDocId\}\/documents[\s\S]*?technicianUid\s*==\s*request\.auth\.uid/);

  // Product media is public-read but admin-write only; claim documents are owner scoped.
  expect(rules).toMatch(/match\s+\/products\/\{productId\}\/[\s\S]*?allow\s+read:\s*if\s+true[\s\S]*?allow\s+write:\s*if\s+isAdmin\(\)/);
  expect(rules).toMatch(/match\s+\/claims\/\{uid\}\/[\s\S]*?request\.auth\.uid\s*==\s*uid/);
});

test('Phase 5 Service Center UI does not expose cross-tenant administration controls', async ({ page }) => {
  await loginAsQa(page);

  const forbiddenSelectors = [
    '#create-super-admin',
    '#manage-users-admin',
    '#warehouse-adjustment-admin',
    '#delete-user-admin',
    '#edit-user-role-admin',
    '#service-center-create-admin',
  ];

  for (const selector of forbiddenSelectors) {
    await expect(page.locator(selector), `Forbidden admin control exposed: ${selector}`).toHaveCount(0);
  }

  // The authenticated center should still expose its operational surface.
  for (const selector of ['#req-form', '#req-schedule-form', '#req-assign-tech-form', '#spare-req-form', '#sc-closure-form']) {
    await expect(page.locator(selector), `Operational control missing: ${selector}`).toBeAttached();
  }
});

test('Phase 5 Service Center cannot use privileged role values through visible forms', async ({ page }) => {
  await loginAsQa(page);

  const privilegedRoleInputs = page.locator('select option[value="superadmin"], select option[value="warehouse"], input[value="superadmin"], input[value="warehouse"]');
  expect(await privilegedRoleInputs.count()).toBe(0);
});
