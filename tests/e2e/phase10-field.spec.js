// Phase 10 items 8-10 - printable documents at every page size, and the
// technician's phone screen. Documents are rendered in a real browser, printed
// to PDF with the page size the document asks for, and checked on a 320px
// phone for sideways scrolling.
const { test, expect } = require('@playwright/test');
const { startStaticServer } = require('./support/static-server');
const { installFirebaseStub } = require('./support/firebase-stub');
const { sampleFor } = require('./support/sample-data');
const Docs = require('../../crm/documents.js');

let origin, server;
test.beforeAll(async () => { ({ server, origin } = await startStaticServer()); });
test.afterAll(async () => { if (server) server.close(); });

const LONG = 'A'.repeat(120);
const DATA = {
  warranty: { registrationId: 'PE-REG-1', customerName: 'Ravi ' + LONG, customerPhone: '9845012345', product: 'Geyser', serialNumber: LONG, purchaseDate: '2026-01-31', warrantyMonths: 24, warrantyComponents: [{ componentName: 'Element', durationYears: 5 }] },
  voucher: { requestId: 'PE-SR-1', customerName: 'Ravi', address: LONG + ' road, Raichur', issue: LONG, status: 'closed', billingType: 'customer', sparePartsCost: 500, serviceCharge: 250, billingTotal: 750, actionTaken: 'Replaced element ' + LONG },
  claim: { claimId: 'PE-CL-1', claimantName: 'Centre ' + LONG, claimantType: 'servicecenter', amount: 1500, status: 'approved' },
  challan: { requestId: 'PE-SP-1', item: 'Element', dispatchedQty: 3, transport: { transporter: 'VRL ' + LONG, docket: 'D123', dispatchDate: '2026-11-02' } },
};
// 1 mm = 2.8346 PDF points
const MM = 72 / 25.4;
const SIZE_MM = { a4: [210, 297], a5: [148, 210], a6: [105, 148], thermal: [80, 200] };

for (const kind of Object.keys(DATA)) for (const size of Object.keys(Docs.SIZES)) {
  test(`${kind} / ${size}: fits a 320px phone, hides the toolbar when printing, prints at the right paper size`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.setContent(Docs.render(kind, DATA[kind], size));
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over, 'sideways scroll on a 320px phone').toBeLessThanOrEqual(1);
    await expect(page.locator('.bar button')).toBeVisible();
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.bar')).toBeHidden();
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    const box = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(pdf.toString('latin1'));
    expect(box, 'PDF has a page size').toBeTruthy();
    const [w, h] = SIZE_MM[size];
    expect(Math.abs(Number(box[1]) - w * MM)).toBeLessThan(3);
    if (h) expect(Math.abs(Number(box[2]) - h * MM)).toBeLessThan(3);
  });
}

test('item 9: the toolbar prints, downloads and builds a WhatsApp link, in the page', async ({ page, context }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto(origin + '/crm/login.html');
  await page.addScriptTag({ url: origin + '/crm/documents.js' });
  await page.evaluate((d) => { const el = document.createElement('div'); el.id = 'host'; document.body.appendChild(el); PEDocs.attach(el, 'voucher', d); }, DATA.voucher);
  await expect(page.locator('.pe-docbar .pe-doc-wa')).toHaveCount(0); // no phone on this ticket
  await page.evaluate((d) => PEDocs.attach(document.getElementById('host'), 'voucher', Object.assign({ customerPhone: '9845012345' }, d)), DATA.voucher);
  await expect(page.locator('.pe-docbar')).toHaveCount(1);
  await expect(page.locator('.pe-doc-wa')).toHaveAttribute('href', /^https:\/\/wa\.me\/919845012345\?text=/);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.pe-doc-dl')]);
  expect(dl.suggestedFilename()).toBe('PE-SR-1-a4.html');
  await page.selectOption('.pe-doc-size', 'thermal');
  const [pop] = await Promise.all([context.waitForEvent('page'), page.click('.pe-doc-print')]);
  await pop.waitForLoadState();
  expect(await pop.content()).toContain('80mm 200mm');
  const bar = await page.locator('.pe-docbar').boundingBox();
  expect(bar.x + bar.width).toBeLessThanOrEqual(361);
});

test('item 10: the technician screen works on a 320px and a 360px phone', async ({ page }) => {
  for (const width of [320, 360]) {
    await page.setViewportSize({ width, height: 640 });
    await installFirebaseStub(page, { role: 'technician', uid: 'u1', data: sampleFor('technician') });
    await page.route(/^https?:\/\//, (r) => (r.request().url().startsWith(origin) || /gstatic\.com\/firebasejs/.test(r.request().url()) ? r.fallback() : r.abort()));
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(origin + '/crm/CRMtechnician.html', { waitUntil: 'load' });
    await page.waitForFunction(() => { const a = document.getElementById('app'); return a && getComputedStyle(a).display !== 'none'; }, null, { timeout: 10000 });
    expect(errors).toEqual([]);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over, `sideways scroll at ${width}px`).toBeLessThanOrEqual(1);
    const hasDocs = await page.evaluate(() => typeof window.PEDocs === 'object');
    expect(hasDocs, 'documents.js loaded on the technician page').toBe(true);
  }
});
