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
  expect(rules).toMatch(/match\s+\/\{(?:allPaths|document)=\*\*\}[\s\S]*?allow\s+read,\s*write:\s*if\s+false/i);

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

// Expanded Phase 5 contract: these checks cover the security/integrity areas
// that must remain true across later feature work, without writing production data.
test('Phase 5 identity model keeps CRM roles separated from customer accounts', async () => {
  const rules = readRuleFile('firestore.rules');
  expect(rules).toContain("function isCustomer()");
  expect(rules).toContain("function callerRole()");
  expect(rules).toContain("callerRole() != 'customer'");
  expect(rules).toContain("callerRole() == 'customer'");
  expect(rules).toContain("function isDistributor()");
});

test('Phase 5 counter security covers public serials and privileged operational IDs', async () => {
  const rules = readRuleFile('firestore.rules');
  expect(rules).toContain("match /counters/{counterId}");
  expect(rules).toMatch(/counterId\.matches\('\^\(enquiry\|productreg\|publicservice\)-\[0-9\]\{6\}\$'\)/);
  expect(rules).toMatch(/counterId\.matches\('\^\(sparerequest\|localpurchase\|claim\|return\|servicejob\|centerrequest\|dealerorder\|dealersale\|distributororder\|distributorsale\|rma\)-\[0-9\]\{6\}\$'\)/);
  expect(rules).toContain("counterId == 'sparepart-master'");
  expect(rules).toContain("request.resource.data.keys().hasOnly(['value'])");
});

test('Phase 5 service-job integrity protects server-computed billing and feedback fields', async () => {
  const rules = readRuleFile('firestore.rules');
  const protectedFields = ['warrantyStatus', 'serviceCharge', 'billingType', 'billingStatus', 'billingTotal', 'billedAt', 'billingComputedAt', 'customerFeedback'];
  for (const field of protectedFields) {
    expect(rules, `service-job protected field missing: ${field}`).toContain(`'${field}'`);
  }
  // Firestore permits nested match blocks, so statusLog is declared under
  // serviceJobs rather than repeating the full path in the match statement.
  expect(rules).toMatch(/match\s+\/serviceJobs\/\{jobId\}\s*\{[\s\S]*?match\s+\/statusLog\/\{logId\}/);
  expect(rules).toContain('allow update, delete: if isAdmin()');
});

test('Phase 5 trade-order integrity protects pricing, approval and status transitions', async () => {
  const rules = readRuleFile('firestore.rules');
  expect(rules).toContain('function orderStepOk');
  expect(rules).toContain('function sellerOrderUpdateOk');
  expect(rules).toContain('function approvalCreditOk');
  expect(rules).toContain("request.resource.data.status == 'placed'");
  // The seller transition check validates the existing server pricing state
  // before confirmation; it intentionally reads resource.data rather than
  // trusting request.resource.data from the browser.
  expect(rules).toMatch(/resource\.data\.get\('pricing',\s*\{\}\)\.get\('status',\s*''\)\s*==\s*'ok'/);
  expect(rules).toContain('creditOverride');
  expect(rules).toContain('statusNote');
});

test('Phase 5 public-write surface remains narrowly validated', async () => {
  const rules = readRuleFile('firestore.rules');
  expect(rules).toContain('match /contactEnquiries/{enquiryId}');
  expect(rules).toContain("request.resource.data.ticketId.matches('^PE-[A-Z]+-[0-9]{8}-[0-9]{4}-[A-Za-z]+$')");
  expect(rules).toContain("request.resource.data.phone.matches('^[6-9][0-9]{9}$')");
  expect(rules).toContain('request.resource.data.message.size() <= 2000');
  expect(rules).toContain('allow read, update, delete: if isAdmin()');
});

test('Phase 5 account escalation boundaries remain explicit', async () => {
  const rules = readRuleFile('firestore.rules');
  expect(rules).toContain("request.resource.data.role != 'superadmin' || isSuperAdmin()");
  expect(rules).toContain("resource.data.role != 'superadmin' || isSuperAdmin()");
  expect(rules).toContain("'districtsCovered'");
  expect(rules).toContain("'pincodesCovered'");
  expect(rules).toContain("'brandsAuthorized'");
  expect(rules).toContain("'linkedServiceCenterUid'");
  expect(rules).toContain("'contractEndDate'");
});

test('Phase 5 production source files contain no obvious hardcoded credential assignments', async () => {
  const candidates = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.git', 'qa-results', 'tests'].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|mjs|html|json)$/i.test(entry.name)) candidates.push(full);
    }
  };
  walk(ROOT);

  const suspicious = [];
  const secretAssignment = /(password|passwd|secret|private[_-]?key|api[_-]?secret)\s*[:=]\s*['"][^'"]{8,}['"]/i;
  for (const file of candidates) {
    const text = fs.readFileSync(file, 'utf8');
    if (secretAssignment.test(text) && !/node_modules|package-lock\.json/i.test(file)) {
      suspicious.push(path.relative(ROOT, file));
    }
  }
  expect(suspicious, 'Possible hardcoded credential assignments').toEqual([]);
});
