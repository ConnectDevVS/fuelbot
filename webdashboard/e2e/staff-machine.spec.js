// SRV-47: staff's Tenants page and a machine's Maintenance, Telemetry and Faults tabs. All three
// widths. Specs that write reset.
import { CSRF, expect, isPhone, modalReady, openFilters, PASSWORD, resetData, test, USERS } from './fixtures.js';

const KIOSK = 'http://127.0.0.1:8795/fuelbot/config';
const row = (page, text) => page.locator('main [data-row]').filter({ hasText: text });

/** DEV00001's kiosk config, with a key issued for the test (the seeded one isn't kept). */
async function kioskConfig(page) {
  const { key } = await page.request.post('/api/v1/tenants/powerfuel/machines/DEV00001/keys', { headers: CSRF, data: { label: 'e2e' } })
    .then((r) => r.json());
  const res = await page.request.get(KIOSK, { headers: { 'X-Tenant-Id': 'powerfuel', 'X-Machine-Id': 'DEV00001', Authorization: `Bearer ${key}` } });
  expect(res.status()).toBe(200);
  return res.json();
}

test("staff creates a tenant; a duplicate id → 'That id is taken'", async ({ page, request, signInAs, shot }) => {
  await signInAs('staff');
  try {
    await page.goto('tenants');
    await expect(row(page, 'powerfuel')).toContainText('PowerFuel Gym');
    await page.mouse.move(1, 1);
    await shot('tenants');
    await page.getByRole('button', { name: 'New tenant' }).click();
    const d = page.getByRole('dialog');
    await d.getByLabel('Id').fill('globex');
    await d.getByLabel('Name', { exact: true }).fill('Another Globex');
    await modalReady(page, d);
    await page.mouse.move(1, 1);
    await shot('tenants-new', { fullPage: false });
    await d.getByRole('button', { name: 'Create tenant' }).click();
    await expect(d.locator('.ant-form-item-explain-error').filter({ hasText: 'That id is taken' })).toBeVisible();
    await d.getByLabel('Id').fill('acme');
    await d.getByLabel('Name', { exact: true }).fill('Acme Health');
    await d.getByRole('button', { name: 'Create tenant' }).click();
    await expect(page.getByText('Tenant Acme Health created')).toBeVisible();
    await expect(row(page, 'acme')).toContainText('Acme Health');
    await row(page, 'acme').getByRole('button', { name: 'Open' }).click();
    await expect(page).toHaveURL(/\/t\/acme\/home$/);
  } finally {
    await resetData(request);
  }
});

test('disabling a tenant blocks its users', async ({ page, request, browser, signInAs }) => {
  await signInAs('staff');
  try {
    await page.goto('tenants');
    await row(page, 'globex').getByRole('button', { name: 'Disable' }).click();
    const confirm = page.getByRole('dialog').filter({ hasText: 'Disable Globex Fitness?' });
    await expect(confirm).toContainText("All its machines are refused and its users can't sign in.");
    await confirm.getByRole('button', { name: 'Disable tenant' }).click();
    await expect(row(page, 'globex')).toContainText('Disabled');

    const context = await browser.newContext({ baseURL: 'http://127.0.0.1:8795/dashboard/' });
    const boss = await context.newPage();
    await boss.goto('sign-in');
    await boss.getByLabel('Email').fill(USERS.boss.email);
    await boss.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await boss.getByRole('button', { name: 'Sign in' }).click();
    await expect(boss.getByText("Your company's access is disabled. Contact FuelBot")).toBeVisible();
    await context.close();

    await row(page, 'globex').getByRole('button', { name: 'Enable' }).click();
    await expect(row(page, 'globex')).toContainText('Active');
  } finally {
    await resetData(request);
  }
});

test('maintenance on/off', async ({ page, request, signInAs, shot }) => {
  await signInAs('staff');
  try {
    await page.goto('t/powerfuel/machines/DEV00001/maintenance');
    const state = page.getByRole('region', { name: 'Maintenance', exact: true });
    await expect(state).toContainText('Off');
    await expect(page.getByRole('region', { name: 'Machine-reported faults (clear automatically)' })).toContainText('HOMING_TIMEOUT');
    await page.mouse.move(1, 1);
    await shot('maintenance-off');
    await page.getByLabel('Message on the kiosk').fill('Cleaning, back at 3');
    await page.getByRole('button', { name: 'Add fault' }).click();
    await page.getByRole('textbox', { name: 'Code of fault 1' }).fill('E42');
    await page.getByRole('textbox', { name: 'Description of fault 1' }).fill('Blender jammed');
    await page.getByRole('button', { name: 'Switch maintenance on' }).click();
    const confirm = page.getByRole('dialog').filter({ hasText: 'Put Bay 02 into maintenance?' });
    await modalReady(page, confirm);
    await expect(confirm).toContainText('within about 2 minutes');
    await confirm.getByRole('button', { name: 'Turn maintenance on' }).click();
    await expect(state).toContainText('On: the kiosk shows Out of service');
    await expect(state).toContainText(/Switched on by Staff at \d/);
    // Settled: the confirm gone, and Update no longer fading from the red "Switch on" it replaced.
    await expect(confirm).toBeHidden();
    await page.mouse.move(1, 1);
    await expect(page.getByRole('button', { name: 'Update message and faults' })).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await shot('maintenance-on');

    const on = await kioskConfig(page);
    expect(on.maintenance).toMatchObject({ enabled: true, message: 'Cleaning, back at 3' });
    expect(on.maintenance.faults).toEqual([{ code: 'E42', description: 'Blender jammed' }]);
    await page.goto('fleet');
    await expect(page.getByRole('region', { name: 'PowerFuel Gym' })).toContainText('Maintenance: Cleaning, back at 3');

    // The tenant sees only "Out of service".
    await signInAs('owner');
    await page.goto('t/powerfuel/home');
    const machines = page.getByRole('region', { name: 'Machines', exact: true });
    await expect(machines.locator('tr, .ant-card').filter({ hasText: 'DEV00001' }).first()).toContainText('Out of service');
    expect((await page.locator('main').innerText()).toLowerCase()).not.toContain('maintenance');

    await signInAs('staff');
    await page.goto('t/powerfuel/machines/DEV00001/maintenance');
    await page.getByRole('button', { name: 'Switch maintenance off' }).click();
    await expect(page.getByRole('region', { name: 'Maintenance', exact: true })).toContainText('Off');
    expect((await kioskConfig(page)).maintenance.enabled).toBe(false);
  } finally {
    await resetData(request);
  }
});

test('telemetry tab lists cycles with a stage timeline and filters by type', async ({ page, signInAs, shot }) => {
  await signInAs('staff');
  await page.goto('t/powerfuel/machines/DEV00001/telemetry');
  const cycles = row(page, 'dispense_cycle');
  await expect(cycles.first()).toBeVisible();
  if (!isPhone(page)) await cycles.first().getByRole('button', { name: /expand/i }).click();   // a phone card shows it
  // Desktop and tablet: the expanded row (one figure); a phone shows every card's.
  const timeline = page.getByRole('figure', { name: 'Stages of the dispense cycle' }).first();
  await expect(timeline).toContainText('HOMING_DONE');
  await page.mouse.move(1, 1);
  await shot('telemetry-expanded');
  await expect(cycles.first().getByRole('link')).toHaveAttribute('href', /\/orders\/E2E-PF-\d{4}$/);
  const close = await openFilters(page);
  await page.getByRole('combobox', { name: 'Event type' }).click();
  await page.locator('.ant-select-dropdown:visible').getByTitle('machine_fault', { exact: true }).click();
  await close();
  await expect(page.locator('main [data-row]')).toHaveCount(1);
  await expect(row(page, 'machine_fault')).toContainText('HOMING_TIMEOUT');
});

test('faults tab shows the open HOMING_TIMEOUT and the closed BRIDGE_DOWN with a duration', async ({ page, signInAs, shot }) => {
  await signInAs('staff');
  await page.goto('t/powerfuel/machines/DEV00001/faults');
  await expect(row(page, 'HOMING_TIMEOUT')).toContainText(/ongoing since \d/);
  await expect(row(page, 'HOMING_TIMEOUT')).toContainText('Ongoing');
  await page.mouse.move(1, 1);
  await shot('faults');
  await page.goto('t/powerfuel/machines/E2E00002/faults');
  await expect(row(page, 'BRIDGE_DOWN')).toContainText('Cleared');
  await expect(row(page, 'BRIDGE_DOWN')).toContainText('15 min 0 s');
});

test('tenant roles never get these tabs or the Tenants page', async ({ page, signInAs }) => {
  const platform = [];
  page.on('request', (r) => {
    const u = r.url();
    if (/\/api\/v1\/(telemetry|faults)|\/api\/v1\/.*\/maintenance$/.test(u)) platform.push(u);   // API calls, not page URLs
  });
  for (const who of ['owner', 'ops', 'desk', 'look']) {
    await signInAs(who);
    await page.goto('t/powerfuel/machines/DEV00001/menu');
    await expect(page.getByRole('tab', { name: 'Menu' }), who).toBeVisible();
    for (const tab of ['Maintenance', 'Telemetry', 'Faults']) await expect(page.getByRole('tab', { name: tab }), `${who} ${tab}`).toHaveCount(0);
    for (const tab of ['maintenance', 'telemetry', 'faults']) {
      await page.goto(`t/powerfuel/machines/DEV00001/${tab}`);
      await expect(page.getByText('Not available'), `${who} ${tab}`).toBeVisible();
    }
    await page.goto('tenants');
    await expect(page.getByText('Not available'), `${who} tenants`).toBeVisible();
  }
  expect(platform).toEqual([]);
});
