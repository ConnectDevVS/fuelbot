// SRV-44: the machine's Settings, Bases and Sales tabs. Desktop first (DP §0.1 row 3). Specs that write reset.
import { CSRF, expect, resetData, test } from './fixtures.js';

test.skip(({ viewport }) => viewport.width < 1100, 'desktop first (DP §0.1 row 3)');

const API = '/api/v1/tenants/powerfuel/machines/DEV00001';
const config = async (page) => (await page.request.get(`${API}/config`).then((r) => r.json())).config;
const machine = async (page) => (await page.request.get(API).then((r) => r.json())).machine;
const unsaved = (page) => page.getByRole('region', { name: 'Unsaved changes' });

async function open(page, tab) {
  await page.goto(`t/powerfuel/machines/DEV00001/${tab}`);
  await expect(page.getByRole('tab', { name: tab[0].toUpperCase() + tab.slice(1) })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
}

test('owner edits the location label; the config preview shows it', async ({ page, request, signInAs, shot }) => {
  await signInAs('owner');
  try {
    await open(page, 'settings');
    await page.getByLabel('Location label').fill('FUELBOT · BAY 2A');
    await expect(unsaved(page)).toContainText('Changes reach the machine at its next restart.');
    await page.mouse.move(1, 1);
    await shot('settings-owner');
    const [req] = await Promise.all([page.waitForRequest((r) => r.method() === 'PATCH'), unsaved(page).getByRole('button', { name: 'Save' }).click()]);
    expect(req.headers()['if-match']).toMatch(/^\d+$/);
    expect(req.postDataJSON()).toMatchObject({ name: 'Bay 02', location_label: 'FUELBOT · BAY 2A' });
    await expect(page.getByText(/^Settings saved/)).toBeVisible();
    expect((await config(page)).tenant.location_label).toBe('FUELBOT · BAY 2A');
    await page.getByRole('tab', { name: 'Config' }).click();
    await expect(page.getByRole('figure', { name: 'Kiosk preview' })).toContainText('FUELBOT · BAY 2A');
  } finally {
    await resetData(request);
  }
});

test("empty support phone clears it; the config falls back to the tenant's", async ({ page, request, signInAs }) => {
  await signInAs('owner');
  try {
    const tenantPhone = (await config(page)).tenant.support_phone;
    await open(page, 'settings');
    await page.getByLabel('Support phone').fill('1800 111 2222');
    await unsaved(page).getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/^Settings saved/)).toBeVisible();
    expect((await config(page)).tenant.support_phone).toBe('1800 111 2222');
    await page.getByLabel('Support phone').fill('');
    const [req] = await Promise.all([page.waitForRequest((r) => r.method() === 'PATCH'), unsaved(page).getByRole('button', { name: 'Save' }).click()]);
    expect(req.postDataJSON().support_phone).toBeNull();
    await expect(unsaved(page)).toHaveCount(0);
    expect((await machine(page)).support_phone).toBeNull();
    expect((await config(page)).tenant.support_phone).toBe(tenantPhone);
  } finally {
    await resetData(request);
  }
});

test('bases: at least one enabled (client + server 400)', async ({ page, signInAs, shot }) => {
  await signInAs('owner');
  await open(page, 'bases');
  const water = page.getByRole('listitem', { name: 'Water' });
  await water.getByRole('switch', { name: 'Water on' }).click();   // Milk is off already
  const puts = [];
  page.on('request', (r) => { if (r.method() === 'PUT') puts.push(r.url()); });
  await unsaved(page).getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('At least one base must be on.')).toBeVisible();
  expect(puts).toEqual([]);
  await page.mouse.move(1, 1);
  await shot('bases-client-error');
  // The server has the same rule.
  const m = await machine(page);
  const res = await page.request.put(`${API}/bases`, { headers: { ...CSRF, 'If-Match': String(m.menu_version) },
    data: { bases: m.bases.map((b) => ({ ...b, enabled: false })) } });
  expect(res.status()).toBe(400);
  expect((await res.json()).details).toEqual([{ field: 'bases', error: 'at least one enabled base' }]);
});

test("code must be B<digit> (the server's field error shown)", async ({ page, signInAs, shot }) => {
  await signInAs('owner');
  await open(page, 'bases');
  const before = await machine(page);
  await page.getByRole('listitem', { name: 'Milk' }).getByRole('textbox', { name: 'Code of Milk' }).fill('X9');
  await unsaved(page).getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('listitem', { name: 'Milk' }).locator('.ant-form-item-explain-error')).toHaveText('B<digit>');
  await expect(page.getByRole('alert').filter({ hasText: 'Some fields need fixing' })).toContainText('Code · Milk: B<digit>');
  expect((await machine(page)).menu_version).toBe(before.menu_version);
  await expect.poll(() => page.locator('.ant-form-item-explain-error').evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  await page.mouse.move(1, 1);
  await shot('bases-server-error');
});

test('disable asks, then the machine shows Disabled on the list; enable restores it', async ({ page, request, signInAs, shot }) => {
  await signInAs('owner');
  try {
    await open(page, 'settings');
    await page.getByRole('region', { name: 'Danger zone' }).getByRole('button', { name: 'Disable machine' }).click();
    const confirm = page.getByRole('dialog').filter({ hasText: 'Disable Bay 02?' });
    await expect(confirm).toContainText('stops receiving its menu');
    await expect.poll(() => confirm.evaluate((el) => getComputedStyle(el.closest('.ant-modal') ?? el).opacity)).toBe('1');
    await page.mouse.move(1, 1);
    await shot('settings-disable-confirm', { fullPage: false });
    await confirm.getByRole('button', { name: 'Disable machine' }).click();
    await expect(page.getByText('Bay 02 disabled')).toBeVisible();
    await expect(page.getByText('This machine is disabled')).toBeVisible();
    await page.goto('t/powerfuel/machines');
    await expect(page.locator('main tbody tr').filter({ hasText: 'DEV00001' })).toContainText('Disabled');
    await open(page, 'settings');
    await page.getByRole('button', { name: 'Enable machine' }).click();
    await expect(page.getByText('Bay 02 enabled')).toBeVisible();
    expect((await machine(page)).disabled).toBe(false);
  } finally {
    await resetData(request);
  }
});

test('operators and viewers see read-only settings and bases', async ({ page, signInAs, shot }) => {
  for (const who of ['desk', 'look']) {
    await signInAs(who);
    await open(page, 'settings');
    await expect(page.getByLabel('Name')).toBeDisabled();
    await expect(page.getByLabel('Location label')).toBeDisabled();
    await expect(page.getByRole('region', { name: 'Danger zone' })).toHaveCount(0);
    if (who === 'look') {
      await page.mouse.move(1, 1);
      await shot('settings-viewer');
    }
    await open(page, 'bases');
    await expect(page.getByRole('textbox', { name: 'Code of Water' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Add base' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(0);
  }
});

test('machine Sales tab totals equal /sales/summary?machine=', async ({ page, signInAs, shot }) => {
  await signInAs('owner');
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/v1/sales/summary') && new URL(r.url()).searchParams.get('group') === 'day'),
    open(page, 'sales'),
  ]);
  const q = new URL(res.url()).searchParams;
  expect(q.get('machine')).toBe('DEV00001');
  const direct = await page.request.get(`/api/v1/sales/summary?${new URLSearchParams({ group: 'day', tenant: 'powerfuel',
    machine: 'DEV00001', from: q.get('from'), to: q.get('to') })}`).then((r) => r.json());
  const totals = direct.totals;
  await expect(page.getByRole('group', { name: 'Revenue', exact: true })).toContainText(`₹${new Intl.NumberFormat('en-IN').format(totals.revenue)}`);
  await expect(page.getByRole('group', { name: 'Orders', exact: true })).toContainText(String(totals.count));
  await expect(page.getByRole('combobox', { name: 'Machine' })).toHaveCount(0);   // fixed
  await expect(page.getByRole('region', { name: 'By machine' })).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/bay 02/i);   // the machine page's own
  // Every listed sale is this machine's.
  const list = await page.request.get(`/api/v1/sales?machine=DEV00001&limit=5&from=${encodeURIComponent(q.get('from'))}`).then((r) => r.json());
  expect(list.items.every((s) => s.machine_id === 'DEV00001')).toBe(true);
  await page.mouse.move(1, 1);
  await shot('machine-sales');
});
