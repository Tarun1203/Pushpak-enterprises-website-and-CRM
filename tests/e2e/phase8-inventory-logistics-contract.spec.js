const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const Spares = require('../../functions/spares');

test.describe('Phase 8 — inventory, spare parts and logistics contract', () => {
  test('spare operation validation rejects unsafe quantities and duplicate parts', () => {
    expect(Spares.validateOpLines([{ partId: 'SP-001', qty: 1 }])).toBeNull();
    expect(Spares.validateOpLines([])).toMatch(/No parts/i);
    expect(Spares.validateOpLines([{ partId: 'SP-001', qty: 0 }])).toMatch(/whole numbers/i);
    expect(Spares.validateOpLines([{ partId: 'SP-001', qty: 1.5 }])).toMatch(/whole numbers/i);
    expect(Spares.validateOpLines([{ partId: 'SP-001', qty: 1 }, { partId: 'SP-001', qty: 1 }])).toMatch(/twice/i);
    expect(Spares.validateOpLines([{ partId: 'SP-001', qty: Spares.MAX_QTY + 1 }])).toMatch(/whole numbers/i);
  });

  test('inventory transfers preserve source and destination quantities', () => {
    const lines = [{ partId: 'SP-001', qty: 3 }, { partId: 'SP-002', qty: 2 }];
    expect(Spares.stockChanges('transfer_to_technician', lines, {
      role: 'servicecenter', uid: 'SC-001', techUid: 'TECH-001'
    })).toEqual([
      { loc: 'servicecenter', uid: 'SC-001', partId: 'SP-001', delta: -3 },
      { loc: 'technician', uid: 'TECH-001', partId: 'SP-001', delta: 3 },
      { loc: 'servicecenter', uid: 'SC-001', partId: 'SP-002', delta: -2 },
      { loc: 'technician', uid: 'TECH-001', partId: 'SP-002', delta: 2 },
    ]);

    expect(Spares.stockChanges('draw_from_center', [{ partId: 'SP-001', qty: 2 }], {
      role: 'technician', uid: 'TECH-001', centerUid: 'SC-001'
    })).toEqual([
      { loc: 'servicecenter', uid: 'SC-001', partId: 'SP-001', delta: -2 },
      { loc: 'technician', uid: 'TECH-001', partId: 'SP-001', delta: 2 },
    ]);
  });

  test('inventory ledger cannot apply an operation that would make stock negative', () => {
    const changes = [{ loc: 'servicecenter', uid: 'SC-001', partId: 'SP-001', delta: -5 }];
    const blocked = Spares.applyChanges(changes, { 'servicecenter_SC-001_SP-001': 4 }, { 'SP-001': 'Panel' });
    expect(blocked.error).toMatch(/Only 4 of Panel/);

    const allowed = Spares.applyChanges(changes, { 'servicecenter_SC-001_SP-001': 5 });
    expect(allowed.next).toEqual({ 'servicecenter_SC-001_SP-001': 0 });
  });

  test('defective spare returns have deterministic due dates and system IDs', () => {
    const usedAt = new Date('2026-10-06T10:00:00Z');
    expect(Spares.defectiveDueDate(usedAt).toISOString()).toBe('2026-11-30T18:29:59.999Z');
    expect(Spares.returnId(usedAt, 7, 'ServiceCenter')).toBe('PE-RT-20261006-0007-ServiceCenter');
  });

  test('inventory counters are server-sequenced patterns and not arbitrary client counters', () => {
    const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');
    expect(rules).toContain("counterId.matches('^(sparerequest|localpurchase|claim|return|servicejob|centerrequest|dealerorder|dealersale|distributororder|distributorsale|rma)-[0-9]{6}$')");
    expect(rules).toContain('request.resource.data.value == resource.data.value + 1');
    expect(rules).toContain("counterId == 'sparepart-master'");
    expect(rules).toContain('isAdmin()');
  });

  test('warehouse CRM surface remains authentication protected', async ({ page }) => {
    const base = process.env.BASE_URL || 'https://tarun1203.github.io/Pushpak-enterprises-website-and-CRM/';
    await page.goto(new URL('crm/CRMwarehouse.html', base).toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await expect(page).toHaveURL(/crm\/login\.html$/);
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
  });
});
