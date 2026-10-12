// SRV-36: Fleet, the staff landing.
import { expect, test } from './fixtures.js';

const section = (page, name) => page.getByRole('region', { name });
/** Machine ids in a section, in order (table rows on tablet/desktop, cards on phone). */
const idsIn = (region) => region.locator('.mono').filter({ hasText: /^[A-Z0-9]{8}$/ }).allInnerTexts();

test('staff lands on Fleet with problem machines first', async ({ page, signInAs, shot }) => {
  await signInAs('staff');
  await page.goto('');
  await expect(page).toHaveURL(/\/dashboard\/fleet$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/fleet/i);
  const pf = section(page, 'PowerFuel Gym');
  await expect(pf.getByRole('heading')).toContainText('4 machines');
  await expect(section(page, 'Globex Fitness').getByRole('heading')).toContainText('1 machine');
  const ids = await idsIn(pf);
  expect(ids).toEqual(['E2E00003', 'E2E00004', 'DEV00001', 'E2E00002']);   // offline, offline, fault, ok
  expect(ids.indexOf('DEV00001')).toBeLessThan(ids.indexOf('E2E00002'));
  // Chips: summed from the tenant counts.
  for (const [label, n] of [['Offline', 2], ['Fault', 1], ['Maintenance', 0], ['OK', 2]]) {
    await expect(page.getByRole('button', { name: new RegExp(`^${label} ${n}$`) })).toBeVisible();
  }
  await expect(pf).toContainText('1 not dispensed');
  await shot('fleet');

  // A row opens the machine page.
  await pf.getByRole('link', { name: /Bay 3/ }).click();
  await expect(page).toHaveURL(/\/dashboard\/t\/powerfuel\/machines\/E2E00002\/menu$/);
});

test('fault code and since are shown', async ({ page, signInAs }) => {
  await signInAs('staff');
  await page.goto('fleet');
  const pf = section(page, 'PowerFuel Gym');
  await expect(pf.getByText(/^HOMING_TIMEOUT since \d\d:\d\d IST$/)).toBeVisible();
  await expect(pf.getByText('Disabled')).toBeVisible();
  await expect(pf.getByText('Not configured')).toBeVisible();
});

test('chips, tenant and search filter together', async ({ page, signInAs, shot }) => {
  await signInAs('staff');
  await page.goto('fleet');
  const fault = page.getByRole('button', { name: /^Fault 1$/ });
  await fault.click();
  await expect(fault).toHaveAttribute('aria-pressed', 'true');
  expect(await idsIn(page.locator('main'))).toEqual(['DEV00001']);
  await page.getByRole('button', { name: /^OK 2$/ }).click();
  // Sections by tenant name: Globex (its OK machine), then PowerFuel (fault first, then OK).
  expect(await idsIn(page.locator('main'))).toEqual(['E2E00005', 'DEV00001', 'E2E00002']);
  // Pressed chips are lime; wait out antd's colour transition (and the hover) before the shot.
  await page.mouse.move(1, 1);
  await expect(page.getByRole('button', { name: /^OK 2$/ })).toHaveCSS('background-color', 'rgb(200, 255, 62)');
  await expect(fault).toHaveCSS('background-color', 'rgb(200, 255, 62)');
  await shot('fleet-filtered');
  await page.getByRole('textbox', { name: 'Search name or id' }).fill('bay 3');
  expect(await idsIn(page.locator('main'))).toEqual(['E2E00002']);
  await page.getByRole('textbox', { name: 'Search name or id' }).fill('nothing like this');
  await expect(page.getByText('No machines match these filters.')).toBeVisible();
});

test('refill panel loads only when opened', async ({ page, signInAs, shot }) => {
  const stock = [];
  page.on('request', (r) => { if (r.url().includes('/api/v1/stock')) stock.push(r.url()); });
  await signInAs('staff');
  await page.goto('fleet');
  await expect(section(page, 'PowerFuel Gym')).toBeVisible();
  expect(stock).toEqual([]);
  await page.getByRole('button', { name: /Refill soon/ }).click();
  await expect(page.getByText('Empty', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Bay 02 · hopper 1/)).toBeVisible();
  await expect(page.getByText('Refill needed').first()).toBeVisible();
  expect(stock).toHaveLength(1);
  expect(stock[0]).toContain('state=empty,low,refill_needed');
  await page.getByText(/Bay 02 · hopper 1/).scrollIntoViewIfNeeded();
  // Wait for the panel to finish expanding (it fades in).
  const panel = page.locator('.ant-collapse-panel');
  await expect(panel).not.toHaveClass(/motion/);
  await expect.poll(() => panel.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  await shot('fleet-refill-open');
});

test("tenant users can't open Fleet", async ({ page, signInAs }) => {
  const fleet = [];
  page.on('request', (r) => { if (r.url().includes('/api/v1/fleet')) fleet.push(r.url()); });
  await signInAs('owner');
  await page.goto('fleet');
  await expect(page.getByText('Not available')).toBeVisible();
  expect(fleet).toEqual([]);
});

test('Refresh refetches; nothing refetches by itself', async ({ page, signInAs }) => {
  await page.clock.install({ time: new Date() });
  const fleet = [];
  page.on('request', (r) => { if (r.url().endsWith('/api/v1/fleet')) fleet.push(r.url()); });
  await signInAs('staff');
  await page.goto('fleet');
  await expect(section(page, 'PowerFuel Gym')).toBeVisible();
  expect(fleet).toHaveLength(1);
  await page.clock.fastForward(70_000);
  await page.mouse.move(5, 5);                 // focus and pointer events don't refetch either
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.clock.fastForward(1_000);
  expect(fleet).toHaveLength(1);
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect.poll(() => fleet.length).toBe(2);
  await expect(page.getByText(/^Updated \d\d:\d\d IST$/)).toBeVisible();
});
