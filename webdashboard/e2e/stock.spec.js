// SRV-41: Stock (the machine page frame, the Stock tab, Record refill / Adjust, the low mark, and
// Refill soon). Specs that write reset the data afterwards.
import { CSRF, expect, resetData, test } from './fixtures.js';

const hopper = (page, n) => page.getByRole('region', { name: `Hopper ${n}`, exact: true });
const history = (page) => page.getByRole('region', { name: 'History', exact: true });
const isPhone = (info) => info.project.name === 'phone';

/** Waits for a sheet (bottom on phone, right elsewhere) to finish sliding in. */
async function sheetOpen(page) {
  const wrapper = page.locator('.ant-drawer-content-wrapper');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect.poll(async () => {
    const box = await wrapper.boundingBox();
    const view = page.viewportSize();
    if (!box) return false;
    return Math.round(box.y + box.height) === view.height && Math.round(box.x + box.width) === view.width;
  }).toBe(true);
}

async function openStock(page, mid = 'DEV00001') {
  await page.goto(`t/powerfuel/machines/${mid}/stock`);
  await expect(hopper(page, 1)).toBeVisible();
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
}

test('states render as seeded', async ({ page, signInAs, shot }) => {
  await signInAs('owner');
  await openStock(page);
  for (const [n, state] of [[1, 'Empty'], [2, 'Low'], [3, 'OK'], [4, 'Not estimated'], [5, 'Unknown']]) {
    await expect(hopper(page, n).locator('.ant-tag'), `hopper ${n}`).toHaveText(state);
  }
  await expect(hopper(page, 5)).toContainText('No refill recorded yet.');
  await expect(hopper(page, 4)).toContainText("Set the product's portion size to estimate.");
  await expect(hopper(page, 2)).toContainText('10 portions left');
  await expect(hopper(page, 1)).toContainText(/Last refill 20 g · .* · by owner@powerfuel\.test/);
  await page.mouse.move(1, 1);
  await shot('stock-owner');

  await openStock(page, 'E2E00002');
  await expect(hopper(page, 1).locator('.ant-tag')).toHaveText('Refill needed');
  await expect(hopper(page, 1)).toContainText(/Hopper now holds .+ per the menu, but the last refill was Prymor Guava\. Record a refill\./);
});

test('owner records a refill on a phone', async ({ page, request, signInAs, shot }, info) => {
  test.skip(!isPhone(info), 'the technician case: a phone');
  await signInAs('owner');
  try {
    await openStock(page);
    await hopper(page, 1).getByRole('button', { name: 'Record refill' }).click();
    await sheetOpen(page);
    const sheet = page.getByRole('dialog');
    await expect(sheet).toContainText('Product in this hopper: Prymor Guava (from the menu).');
    await sheet.getByRole('spinbutton', { name: /Level after filling/ }).fill('2000');
    await sheet.getByPlaceholder('e.g. new bag').fill('new bag');
    await shot('stock-refill-dialog', { fullPage: false });
    await sheet.getByRole('button', { name: 'Save refill' }).click();
    await expect(page.getByText('Hopper 1 set to 2,000 g')).toBeVisible();
    await expect(hopper(page, 1).locator('.ant-tag')).toHaveText('OK');
    await expect(hopper(page, 1)).toContainText('61 portions left');   // 2,000 g / 32.5 g
    const top = history(page).locator('.ant-card').first();
    await expect(top).toContainText('Refill');
    await expect(top).toContainText('owner@powerfuel.test');
    await expect(top).toContainText('2,000 g');
    // Home's refill list no longer has Bay 02 hopper 1.
    await page.goto('t/powerfuel/home');
    const refill = page.getByRole('region', { name: 'Refill soon', exact: true });
    await expect(refill.getByText('Bay 02 · hopper 2')).toBeVisible();
    await expect(refill.getByText('Bay 02 · hopper 1')).toHaveCount(0);
  } finally {
    await resetData(request);
  }
});

test('adjust changes the level', async ({ page, request, signInAs }) => {
  await signInAs('owner');
  try {
    await openStock(page);
    await hopper(page, 3).getByRole('button', { name: 'Adjust' }).click();
    await sheetOpen(page);
    const sheet = page.getByRole('dialog');
    await expect(sheet).toContainText('Use after weighing the hopper.');
    await sheet.getByRole('spinbutton', { name: /Level now/ }).fill('1234');
    await sheet.getByRole('button', { name: 'Save level' }).click();
    await expect(sheet).toBeHidden();
    await expect(hopper(page, 3)).toContainText(/Adjusted to 1,234 g/);
    await expect(history(page)).toContainText('Adjust');
    await expect(history(page)).toContainText('1,234 g');
  } finally {
    await resetData(request);
  }
});

test('threshold edit uses If-Match and handles a conflict', async ({ page, request, signInAs, shot }, info) => {
  test.skip(isPhone(info), 'the same form on every width; the conflict once on tablet and desktop');
  await signInAs('owner');
  try {
    const path = '/api/v1/tenants/powerfuel/machines/DEV00001';
    const machine = (await page.request.get(path).then((r) => r.json())).machine;
    const pid = (h) => machine.menu.find((i) => i.hopper === h).product_id;
    await openStock(page);

    // Someone else changes the menu (hopper 2's low mark) after the page loaded it.
    const other = await page.request.patch(`${path}/menu/${pid(2)}`, {
      headers: { ...CSRF, 'If-Match': String(machine.menu_version) }, data: { low_portions: 20 } });
    expect(other.status()).toBe(200);

    const patches = [];
    page.on('request', (r) => { if (r.method() === 'PATCH') patches.push(r.headers()['if-match']); });
    await hopper(page, 3).getByRole('spinbutton', { name: 'Low mark for hopper 3 (portions)' }).fill('5');
    await hopper(page, 3).getByRole('button', { name: 'Save' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Someone else changed this since you opened it.');
    await expect.poll(() => dialog.evaluate((el) => getComputedStyle(el.closest('.ant-modal') ?? el).opacity)).toBe('1');
    await page.mouse.move(1, 1);
    await shot('stock-conflict', { fullPage: false });
    await dialog.getByRole('button', { name: 'Keep my changes' }).click();
    await expect(page.getByText('Low mark saved')).toBeVisible();
    expect(patches).toEqual([String(machine.menu_version), String(machine.menu_version + 1)]);
    const after = (await page.request.get(path).then((r) => r.json())).machine;
    expect(after.menu.find((i) => i.hopper === 3).low_portions).toBe(5);
    expect(after.menu.find((i) => i.hopper === 2).low_portions).toBe(20);   // theirs kept
  } finally {
    await resetData(request);
  }
});

test('operators and viewers see no stock actions', async ({ page, signInAs, shot }) => {
  for (const who of ['desk', 'ops', 'look']) {
    await signInAs(who);
    await openStock(page);
    await expect(page.getByRole('button', { name: 'Record refill' }), who).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Adjust' }), who).toHaveCount(0);
    await expect(page.getByRole('spinbutton'), who).toHaveCount(0);
    await expect(hopper(page, 2)).toContainText(/Low below \d+ portions/);
    if (who === 'look') {
      await page.mouse.move(1, 1);
      await shot('stock-viewer');
    }
  }
});

test('refill soon lists every non-ok hopper, most urgent first, and filters by chip', async ({ page, signInAs, shot }) => {
  await signInAs('owner');
  const api = (await page.request.get('/api/v1/stock?tenant=powerfuel').then((r) => r.json())).items;
  const label = { empty: 'Empty', low: 'Low', refill_needed: 'Refill needed', unknown: 'Unknown', not_estimated: 'Not estimated' };
  expect(api.map((r) => r.state)).not.toContain('ok');
  await page.goto('t/powerfuel/stock');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/refill soon/i);
  const tags = page.locator('main .ant-tag');
  await expect(tags).toHaveText(api.map((r) => label[r.state]));   // the server's urgency order
  for (const [state, text] of Object.entries(label)) {
    const n = api.filter((r) => r.state === state).length;
    await expect(page.getByRole('button', { name: new RegExp(`^${text} ${n}$`) })).toBeVisible();
  }
  await page.mouse.move(1, 1);
  await shot('stock-refill-soon');
  // Chips: Unknown and Not estimated off → only the rest.
  await page.getByRole('button', { name: /^Unknown \d+$/ }).click();
  await page.getByRole('button', { name: /^Not estimated \d+$/ }).click();
  const urgent = api.filter((r) => ['empty', 'low', 'refill_needed'].includes(r.state));
  await expect(tags).toHaveText(urgent.map((r) => label[r.state]));
  // A row opens the machine's Stock tab.
  await page.locator('main').getByRole('link', { name: /Prymor Guava/ }).first().click();
  await expect(page).toHaveURL(/\/machines\/DEV00001\/stock$/);
});

test('machine page frame', async ({ page, signInAs }) => {
  // The tabs built so far that each role may see (Keys: keys:manage, SRV-42; Menu, Config: SRV-43;
  // Sales, Settings, Bases: SRV-44).
  const common = ['Menu', 'Config', 'Stock', 'Sales', 'Settings', 'Bases'];
  for (const [who, tabs] of [['owner', [...common, 'Keys']], ['look', common]]) {
    await signInAs(who);
    await page.goto('t/powerfuel/machines/DEV00001/nosuch');   // an unknown tab → the first one
    await expect(page).toHaveURL(/\/machines\/DEV00001\/menu$/);
    await expect(page.getByRole('tab')).toHaveText(tabs);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/bay 02/i);
    await expect(page.getByText('Machine · DEV00001')).toBeVisible();
  }
  await signInAs('desk');
  await page.goto('t/powerfuel/machines/E2E00002/stock');
  await expect(page.getByText("Machine not found, or you don't have access.")).toBeVisible();
});
