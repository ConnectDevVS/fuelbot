// SRV-43: the Menu tab and the Config preview. Desktop first (DP §0.1 row 3). Specs that write reset.
import { CSRF, expect, resetData, test } from './fixtures.js';

test.skip(({ viewport }) => viewport.width < 1100, 'desktop first (DP §0.1 row 3)');

const API = '/api/v1/tenants/powerfuel/machines/DEV00001';
const list = (page) => page.getByRole('list', { name: 'Menu' });
const row = (page, name) => list(page).getByRole('listitem', { name, exact: true });
const order = (page) => list(page).getByRole('listitem').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
const machine = async (page) => (await page.request.get(API).then((r) => r.json())).machine;

async function openMenu(page, mid = 'DEV00001') {
  await page.goto(`t/powerfuel/machines/${mid}/menu`);
  await expect(page.getByRole('tab', { name: 'Menu' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
}

/** Saves through the unsaved bar and returns the PUT's JSON body. */
async function save(page) {
  const [req] = await Promise.all([
    page.waitForRequest((r) => r.method() === 'PUT' && r.url().endsWith('/menu')),
    page.getByRole('region', { name: 'Unsaved changes' }).getByRole('button', { name: 'Save' }).click(),
  ]);
  return { json: req.postDataJSON(), ifMatch: req.headers()['if-match'] };
}

test('operator reorders and marks sold out; price is locked', async ({ page, request, signInAs, shot }) => {
  await signInAs('desk');
  try {
    const before = await machine(page);
    await openMenu(page);
    expect(await order(page)).toEqual(['Prymor Guava', 'MMN Chocolate', 'Prymor Electro', 'ON Vanilla', 'Cookies & Cream', 'Beast Coffee']);
    await expect(page.getByRole('spinbutton', { name: /^Price for / })).toHaveCount(0);   // no price inputs
    await expect(page.getByRole('button', { name: 'Override price' })).toHaveCount(0);
    await page.mouse.move(1, 1);
    await shot('menu-operator');

    // Sold out first: after a drop, dnd-kit swallows clicks for 50 ms (so the drop isn't a click).
    const soldOut = row(page, 'Prymor Guava').getByRole('switch', { name: 'Prymor Guava sold out' });
    await soldOut.click();
    await expect(soldOut).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('Changes reach the machine at its next restart.')).toBeVisible();
    // ↑ on the keyboard path, then a real drag: Beast Coffee to the top.
    await row(page, 'MMN Chocolate').getByRole('button', { name: 'Move MMN Chocolate up' }).click();
    const handle = row(page, 'Beast Coffee').getByRole('button', { name: 'Drag to reorder Beast Coffee' });
    const target = await row(page, 'MMN Chocolate').boundingBox();
    const from = await handle.boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, from.y - 20, { steps: 5 });
    // closestCenter: the dragged row's centre has to pass the first row's, so drop above it.
    await page.mouse.move(from.x + from.width / 2, target.y - 30, { steps: 20 });
    await page.mouse.up();
    // dnd-kit swallows clicks for 50 ms after a drop (so the drop isn't a click); wait that out.
    await page.evaluate(() => new Promise((resolve) => { setTimeout(resolve, 60); }));
    expect(await order(page)).toEqual(['Beast Coffee', 'MMN Chocolate', 'Prymor Guava', 'Prymor Electro', 'ON Vanilla', 'Cookies & Cream']);

    const { json, ifMatch } = await save(page);
    expect(ifMatch).toBe(String(before.menu_version));
    expect(json.menu.map((i) => i.product_id)).toEqual(['coffee', 'chocolate', 'guava', 'electro', 'vanilla', 'cookie']);
    const priceOf = (menu, id) => menu.find((i) => i.product_id === id).price ?? null;
    for (const item of json.menu) expect(item.price, item.product_id).toEqual(priceOf(before.menu, item.product_id));
    await expect(page.getByText('Menu saved. Reaches Bay 02 at its next restart.')).toBeVisible();

    await page.getByRole('tab', { name: 'Config' }).click();
    const preview = page.getByRole('figure', { name: 'Kiosk preview' });
    await expect(preview.getByRole('listitem').first()).toContainText('Beast Coffee');
    await expect(preview.getByRole('listitem').nth(2)).toContainText('Prymor Guava');
    await expect(preview.getByRole('listitem').nth(2)).toContainText('Sold out');
  } finally {
    await resetData(request);
  }
});

test('owner sets a price override; kiosk config has it', async ({ page, request, signInAs, shot }) => {
  await signInAs('owner');
  try {
    await openMenu(page);
    const guava = row(page, 'Prymor Guava');
    await guava.getByRole('button', { name: 'Override price' }).click();
    await guava.getByRole('spinbutton', { name: 'Price for Prymor Guava', exact: true }).fill('85');
    await guava.getByRole('spinbutton', { name: 'Offer price for Prymor Guava' }).fill('70');
    await page.mouse.move(1, 1);
    await shot('menu-owner');
    const { json } = await save(page);
    expect(json.menu.find((i) => i.product_id === 'guava').price).toEqual({ actual_price: 85, offer_price: 70 });
    await expect(page.getByText(/^Menu saved/)).toBeVisible();
    const config = await page.request.get(`${API}/config`).then((r) => r.json());
    expect(config.config.flavors.find((f) => f.id === 'guava')).toMatchObject({ actual_price: 85, offer_price: 70 });
    // Back to the product's price.
    await guava.getByRole('button', { name: /^Use product price/ }).click();
    const again = await save(page);
    expect(again.json.menu.find((i) => i.product_id === 'guava').price).toBeNull();
  } finally {
    await resetData(request);
  }
});

test("duplicate hopper: warning, then the server's 422 in the panel, nothing saved", async ({ page, request, signInAs, shot }) => {
  await signInAs('owner');
  try {
    const before = await machine(page);
    await openMenu(page);
    const chocolate = row(page, 'MMN Chocolate');
    await chocolate.getByRole('combobox', { name: 'Hopper for MMN Chocolate' }).click();
    await page.locator('.ant-select-dropdown:visible').getByTitle('1', { exact: true }).click();
    await expect(chocolate).toContainText('Hopper 1 is also used by Prymor Guava. The machine would reject this menu.');
    await save(page);
    await expect(page.getByRole('alert').filter({ hasText: 'Nothing was saved.' })).toContainText('The machine would reject this');
    await expect(chocolate).toContainText('chocolate: hopper 1 already used by guava');
    await expect(page.getByText('Nothing was saved.')).toBeVisible();
    expect((await machine(page)).menu_version).toBe(before.menu_version);
    await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0);   // closed, not mid-fade
    await page.mouse.move(1, 1);
    await shot('menu-422');
  } finally {
    await resetData(request);
  }
});

test('conflict: two tabs edit the menu; the second Save opens the Conflict dialog; Keep mine saves', async ({ page, request, signInAs, shot }) => {
  await signInAs('owner');
  try {
    const before = await machine(page);
    await openMenu(page);
    // "Another tab" saves first.
    const menu = before.menu.map(({ product_id: p, hopper, enabled, sold_out: s, badge, price, low_portions: l }) =>
      ({ product_id: p, hopper, enabled, sold_out: s, badge, price, low_portions: l }));
    menu.find((i) => i.product_id === 'electro').badge = 'NEW';
    const other = await page.request.put(`${API}/menu`, { headers: { ...CSRF, 'If-Match': String(before.menu_version) }, data: { menu } });
    expect(other.status()).toBe(200);

    await row(page, 'ON Vanilla').getByRole('switch', { name: 'ON Vanilla sold out' }).click();
    await save(page);
    const dialog = page.getByRole('dialog').filter({ hasText: 'Someone else changed this since you opened it.' });
    await expect(dialog).toBeVisible();
    await expect.poll(() => dialog.evaluate((el) => getComputedStyle(el.closest('.ant-modal') ?? el).opacity)).toBe('1');
    await page.mouse.move(1, 1);
    await shot('menu-conflict', { fullPage: false });
    await dialog.getByRole('button', { name: 'Keep my changes' }).click();
    await expect(page.getByText(/^Menu saved/)).toBeVisible();
    const after = await machine(page);
    expect(after.menu_version).toBe(before.menu_version + 2);
    // Mine (the whole menu is one field, so theirs is replaced): vanilla toggled, electro's badge not theirs.
    const was = before.menu.find((i) => i.product_id === 'vanilla').sold_out;
    expect(after.menu.find((i) => i.product_id === 'vanilla').sold_out).toBe(!was);
    expect(after.menu.find((i) => i.product_id === 'electro').badge).toBeNull();
  } finally {
    await resetData(request);
  }
});

test('copy menu from Bay 02 to Bay 4 makes it configured', async ({ page, request, signInAs }) => {
  await signInAs('owner');
  try {
    await openMenu(page, 'E2E00003');
    await expect(page.getByText('This machine has no menu yet.')).toBeVisible();
    await page.getByRole('combobox', { name: 'Machine to copy the menu from' }).click();
    await page.locator('.ant-select-dropdown:visible').getByTitle('Bay 02 · DEV00001').click();
    const confirm = page.getByRole('dialog').filter({ hasText: 'Copy the menu from Bay 02 to Bay 4?' });
    await expect(confirm).toContainText('price overrides included');
    await confirm.getByRole('button', { name: 'Copy menu' }).click();
    await expect(page.getByText('Menu copied from Bay 02. Reaches Bay 4 at its next restart.')).toBeVisible();
    await expect(list(page).getByRole('listitem')).toHaveCount(6);
    const bay4 = (await page.request.get('/api/v1/tenants/powerfuel/machines/E2E00003').then((r) => r.json())).machine;
    expect(bay4.configured).toBe(true);
    expect(bay4.menu).toHaveLength(6);
  } finally {
    await resetData(request);
  }
});

test('viewer sees a read-only menu', async ({ page, signInAs, shot }) => {
  await signInAs('look');
  await openMenu(page);
  await expect(list(page).getByRole('listitem')).toHaveCount(6);
  await expect(page.getByRole('button', { name: /^Drag to reorder/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Move / })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Pick a product to add' })).toHaveCount(0);
  for (const s of await page.getByRole('switch').all()) await expect(s).toBeDisabled();
  await row(page, 'Prymor Guava').getByRole('switch', { name: 'Prymor Guava sold out' }).click({ force: true });
  await expect(page.getByRole('region', { name: 'Unsaved changes' })).toHaveCount(0);
  await page.mouse.move(1, 1);
  await shot('menu-viewer');
});

test('tenant config preview has no maintenance block', async ({ page, signInAs, shot }) => {
  await signInAs('owner');
  const res = await page.request.get(`${API}/config`).then((r) => r.json());
  expect(res.config).not.toHaveProperty('maintenance');
  await page.goto('t/powerfuel/machines/DEV00001/config');
  const preview = page.getByRole('figure', { name: 'Kiosk preview' });
  await expect(preview.getByRole('listitem')).toHaveCount(6);
  await expect(page.getByText(/^Version /)).toBeVisible();
  expect((await page.locator('main').innerText()).toLowerCase()).not.toContain('maintenance');
  await page.getByRole('button', { name: 'Raw JSON' }).click();
  await expect(page.locator('main pre')).toContainText('"flavors"');
  await page.mouse.move(1, 1);
  await shot('config-preview');

  // Staff see the maintenance line.
  await signInAs('staff');
  await page.goto('t/powerfuel/machines/DEV00001/config');
  await expect(page.getByText(/^Maintenance: (on|off)/)).toBeVisible();
});

test('unsaved changes block leaving the tab', async ({ page, signInAs }) => {
  await signInAs('owner');
  await openMenu(page);
  await row(page, 'ON Vanilla').getByRole('switch', { name: 'ON Vanilla sold out' }).click();
  await expect(page.getByRole('region', { name: 'Unsaved changes' })).toBeVisible();
  await page.getByRole('tab', { name: 'Stock' }).click();
  const leave = page.getByRole('dialog').filter({ hasText: 'Leave without saving?' });
  await expect(leave).toBeVisible();
  await leave.getByRole('button', { name: 'Stay' }).click();
  await expect(page).toHaveURL(/\/menu$/);
  await page.getByRole('tab', { name: 'Stock' }).click();
  await page.getByRole('dialog').filter({ hasText: 'Leave without saving?' }).getByRole('button', { name: 'Leave' }).click();
  await expect(page).toHaveURL(/\/stock$/);
});
