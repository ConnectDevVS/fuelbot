// SRV-48: staff's fleet-wide Faults, Telemetry, Audit and Unregistered pages. Desktop first
// (DP §0.1 row 3). Specs that write reset.
import { CSRF, expect, resetData, test, USERS } from './fixtures.js';

test.skip(({ viewport }) => viewport.width < 1100, 'desktop first (DP §0.1 row 3)');

const rows = (page) => page.locator('main tbody tr.ant-table-row');
const row = (page, text) => rows(page).filter({ hasText: text });

async function pick(page, label, option) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.locator('.ant-select-dropdown:visible').last().getByTitle(option, { exact: true }).click();
}

test('faults page lists open and closed intervals across tenants and filters by tenant', async ({ page, signInAs, shot }) => {
  await signInAs('staff');
  await page.goto('faults');
  await expect(row(page, 'HOMING_TIMEOUT')).toContainText('powerfuel · DEV00001');
  await expect(row(page, 'HOMING_TIMEOUT')).toContainText(/ongoing since/);
  await expect(row(page, 'BRIDGE_DOWN')).toContainText('powerfuel · E2E00002');
  await expect(row(page, 'BRIDGE_DOWN')).toContainText('15 min 0 s');
  expect(await rows(page).first().textContent()).toContain('HOMING_TIMEOUT');   // ongoing first
  await page.mouse.move(1, 1);
  await shot('staff-faults');
  await row(page, 'HOMING_TIMEOUT').getByRole('link').click();
  await expect(page).toHaveURL(/\/t\/powerfuel\/machines\/DEV00001\/faults$/);
  await page.goBack();
  await pick(page, 'Filter by tenant', 'Globex Fitness');
  await expect(page.getByText('No faults recorded.')).toBeVisible();
});

test('telemetry search by order id finds the cycle', async ({ page, signInAs, shot }) => {
  await signInAs('staff');
  await page.goto('telemetry');
  await expect(rows(page).first()).toBeVisible();
  await page.getByRole('textbox', { name: 'Order id' }).fill('E2E-PF-0001');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('dispense_cycle');
  await expect(rows(page).first()).toContainText(/powerfuel · (DEV00001|E2E00002)/);
  await rows(page).first().getByRole('button', { name: /expand/i }).click();
  await expect(page.getByRole('figure', { name: 'Stages of the dispense cycle' })).toContainText('HOMING_DONE');
  await page.mouse.move(1, 1);
  await shot('staff-telemetry');
});

test('audit shows the refill recorded earlier in this run with its after-values, and filters by user and action', async ({ page, request, signInAs, shot }) => {
  await signInAs('owner');
  try {
    const res = await page.request.post('/api/v1/tenants/powerfuel/machines/DEV00001/stock/refills', { headers: CSRF,
      data: { hopper: 3, level_g: 2000, note: 'full' } });
    expect(res.status()).toBe(201);
    await signInAs('staff');
    await page.goto('audit');
    const refill = row(page, 'stock.refill').first();
    await expect(refill).toContainText(USERS.owner.email);
    await expect(refill).toContainText('hopper:3');
    await expect(refill).toContainText('powerfuel · DEV00001');
    await refill.getByRole('button', { name: /expand/i }).click();
    const diff = page.locator('main table').filter({ hasText: 'Before' }).first();
    await expect(diff).toContainText('level_g');
    await expect(diff).toContainText('2000');
    await expect(diff).toContainText('full');
    await page.mouse.move(1, 1);
    await shot('staff-audit');
    await pick(page, 'User', USERS.owner.email);
    await pick(page, 'Action', 'stock.refill');
    await expect(rows(page)).toHaveCount(1);
    await pick(page, 'Action', 'key.issue');
    await expect(page.getByText('Nothing recorded for these filters.')).toBeVisible();
  } finally {
    await resetData(request);
  }
});

test('unregistered lists the seeded id with 1 sale', async ({ page, signInAs, shot }) => {
  await signInAs('staff');
  await page.goto('unregistered');
  const typo = row(page, 'ZZTYPO01');
  await expect(typo).toContainText('powerfuel');
  await expect(typo.locator('td').nth(2)).toHaveText('1');   // sales
  await expect(typo.locator('td').last()).toHaveText('—');   // registered under nobody
  await expect(page.getByText(/Machine ids come only from the server/)).toBeVisible();
  await page.mouse.move(1, 1);
  await shot('staff-unregistered');
});

test('tenant roles: every staff page URL → NotAvailable with no API request', async ({ page, signInAs }) => {
  const staffApi = [];
  page.on('request', (r) => { if (/\/api\/v1\/(faults|telemetry|audit|unregistered)/.test(r.url())) staffApi.push(r.url()); });
  for (const who of ['owner', 'ops', 'desk', 'look']) {
    await signInAs(who);
    for (const path of ['faults', 'telemetry', 'audit', 'unregistered']) {
      await page.goto(path);
      await expect(page.getByText('Not available'), `${who} ${path}`).toBeVisible();
    }
  }
  expect(staffApi).toEqual([]);
});
