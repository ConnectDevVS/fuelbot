// SRV-42: the Machines list, registering a machine, the provisioning card and the Keys tab.
// All three widths. Specs that write reset.
import { expect, isPhone, resetData, test } from './fixtures.js';

const KEY_RE = /^[A-HJ-KM-NP-Z2-9]{4}(-[A-HJ-KM-NP-Z2-9]{4}){4}$/;
const KIOSK = 'http://127.0.0.1:8795/fuelbot/config';
const card = (page) => page.getByRole('region', { name: 'Provision machine' });

/** The card's three values, read from its visible text (as a technician would). */
async function readCard(page) {
  const c = card(page);
  const value = (file) => c.locator('[class*="cardRow"]').filter({ hasText: file }).locator('[class*="cardValue"]').innerText();
  return {
    tenant: (await value('tenant_id.txt')).trim(),
    machine: (await value('machine_id.txt')).replace(/\s+/g, ''),
    key: (await value('machine_key.txt')).replace(/[\s–]+/g, '').match(/.{4}/g).join('-'),
  };
}

const kiosk = (request, { tenant, machine, key }) => request.get(KIOSK, {
  headers: { 'X-Tenant-Id': tenant, 'X-Machine-Id': machine, Authorization: `Bearer ${key}` } });

async function acknowledgeAndDone(page) {
  await card(page).getByRole('checkbox', { name: "I've written down or printed the key" }).check();
  await card(page).getByRole('button', { name: 'Done' }).click();
}

/** Register "Bay 5" with a menu copied from Bay 02, then issue its key: the card is showing. */
async function registerBay5(page, shot = null) {
  await page.goto('t/powerfuel/machines');
  await page.getByRole('button', { name: 'Register a machine' }).click();
  await expect(page).toHaveURL(/\/machines\/new$/);
  // Exact, and only once the page is there: 'Name' alone also matches the list's "Search name…" box,
  // which is still on screen while the register page's chunk loads.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/register a machine/i);
  await page.getByLabel('Name', { exact: true }).fill('Bay 5');
  await page.getByLabel('Location label on the kiosk').fill('FUELBOT · BAY 05');
  await page.getByLabel('Site').fill('Level 1');
  if (shot) await shot('register-1-details');
  await page.getByRole('button', { name: 'Register' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/bay 5/i);
  await page.getByRole('radio', { name: 'Copy the menu from another machine' }).check();
  await page.getByRole('combobox', { name: 'Machine to copy from' }).click();
  await page.locator('.ant-select-dropdown:visible').getByTitle('Bay 02 · DEV00001').click();
  if (shot) {
    await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0);   // closed, not mid-fade
    await page.mouse.move(1, 1);
    await shot('register-2-menu');
  }
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('copied from Bay 02')).toBeVisible();
  await expect(page.getByLabel('Key label')).toHaveValue('Bay 5');
  if (shot) await shot('register-3-key');
  await page.getByRole('button', { name: 'Issue key' }).click();
  await expect(card(page)).toBeVisible();
}

test('list shows every visible machine with status and menu state', async ({ page, signInAs, shot }) => {
  await signInAs('owner');
  await page.goto('t/powerfuel/machines');
  const rows = page.locator('main [data-row]');
  await expect(rows).toHaveCount(4);
  await expect(rows.filter({ hasText: 'E2E00003' })).toContainText('Not configured');
  await expect(rows.filter({ hasText: 'E2E00004' })).toContainText('Disabled');
  // Menu from 760 px (a phone card keeps status, today, last seen); location on desktop only.
  if (!isPhone(page)) await expect(rows.filter({ hasText: 'DEV00001' })).toContainText(/\d+ items/);
  if (page.viewportSize().width >= 1100) await expect(rows.filter({ hasText: 'DEV00001' })).toContainText('FUELBOT · BAY 02 · Ground floor');
  await page.getByRole('textbox', { name: 'Search name, id or location' }).fill('bay 4');
  await expect(rows).toHaveCount(1);
  await page.getByRole('textbox', { name: 'Search name, id or location' }).fill('');
  await page.mouse.move(1, 1);
  await shot('machines-list');
  // A row opens the machine.
  await rows.filter({ hasText: 'E2E00002' }).getByRole('link').click();
  await expect(page).toHaveURL(/\/machines\/E2E00002\/menu$/);

  await signInAs('desk');
  await page.goto('t/powerfuel/machines');
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('DEV00001');
});

test('owner registers a machine, copies a menu, issues a key', async ({ page, request, signInAs, shot }) => {
  await signInAs('owner');
  try {
    await registerBay5(page, shot);
    const values = await readCard(page);
    expect(values.tenant).toBe('powerfuel');
    expect(values.machine).toMatch(/^[A-Z0-9]{8}$/);
    expect(values.key).toMatch(KEY_RE);
    await expect(card(page).getByRole('button', { name: 'Done' })).toBeDisabled();
    await page.mouse.move(1, 1);
    await shot('register-card');
    const machine = (await page.request.get(`/api/v1/tenants/powerfuel/machines/${values.machine}`).then((r) => r.json())).machine;
    expect(machine.configured).toBe(true);
    expect(machine.name).toBe('Bay 5');
    // The end-to-end proof: the kiosk's call with what the card says is accepted.
    const res = await kiosk(request, values);
    expect(res.status(), await res.text()).toBe(200);
    await acknowledgeAndDone(page);
    await expect(page).toHaveURL(new RegExp(`/machines/${values.machine}/menu$`));
  } finally {
    await resetData(request);
  }
});

test('the key never leaves the card', async ({ page, request, signInAs }) => {
  const urls = [];
  const bodies = [];
  page.on('request', (r) => { urls.push(r.url()); bodies.push(r.postData() ?? ''); });
  await signInAs('owner');
  try {
    await registerBay5(page);
    const { key } = await readCard(page);
    const compact = key.replace(/-/g, '');
    for (const u of urls) {
      expect(u).not.toContain(key);
      expect(u).not.toContain(compact);
    }
    for (const b of bodies) expect(b).not.toContain(key);   // the requests before the key existed, and the issue
    const stored = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage },
      href: location.href, state: history.state }));
    expect(stored).not.toContain(key);
    expect(stored).not.toContain(compact);
    // Leaving before acknowledging asks first; Stay keeps the card.
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Home' }).click();
    const leave = page.getByRole('dialog').filter({ hasText: "You haven't confirmed you saved the key. Leave anyway?" });
    await expect(leave).toBeVisible();
    await leave.getByRole('button', { name: 'Stay' }).click();
    await expect(card(page)).toBeVisible();
    await acknowledgeAndDone(page);
    await expect(page).toHaveURL(/\/menu$/);
    expect(await page.content()).not.toContain(key);
    for (const group of key.split('-')) expect(await page.locator('body').innerText()).not.toContain(group);
  } finally {
    await resetData(request);
  }
});

test('print shows only the card', async ({ page, request, signInAs, shot }) => {
  await signInAs('owner');
  try {
    await registerBay5(page);
    await page.emulateMedia({ media: 'print' });
    await expect(card(page)).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toBeHidden();
    await expect(page.getByText('Details', { exact: true })).toBeHidden();
    await expect(card(page).getByRole('checkbox')).toBeHidden();
    await expect(card(page).getByRole('button', { name: 'Print card' })).toBeHidden();
    await expect(card(page).getByRole('button', { name: /Copy/ }).first()).toBeHidden();
    await shot('register-card-print', { fullPage: false });
    await page.emulateMedia({ media: 'screen' });
    await acknowledgeAndDone(page);
  } finally {
    await resetData(request);
  }
});

test('revoke asks, then marks the key Revoked; the kiosk call with it → 401', async ({ page, request, signInAs, shot }) => {
  await signInAs('owner');
  try {
    await page.goto('t/powerfuel/machines/DEV00001/keys');
    await expect(page.getByRole('tab', { name: 'Keys' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('main [data-row]')).toHaveCount(1);   // the seeded "Bay 02 kiosk"
    await expect(page.locator('main [data-row]')).toContainText('Bay 02 kiosk');
    await page.mouse.move(1, 1);
    await shot('keys-tab');
    await page.getByRole('button', { name: 'Issue a new key' }).click();
    await page.getByRole('textbox', { name: 'Key label' }).fill('spare');
    await page.getByRole('button', { name: 'Issue key' }).click();
    const values = await readCard(page);
    expect(values.machine).toBe('DEV00001');
    expect((await kiosk(request, values)).status()).toBe(200);
    await acknowledgeAndDone(page);

    const row = page.locator('main [data-row]').filter({ hasText: 'spare' });
    await expect(row).toContainText('Active');
    await page.getByRole('button', { name: 'Refresh' }).click();   // nothing refetches by itself
    await expect(row).toContainText('just now');   // the kiosk call above used it
    await row.getByRole('button', { name: 'Revoke' }).click();
    const confirm = page.getByRole('dialog').filter({ hasText: /Revoke key/ });
    await expect(confirm).toContainText('will be refused until it has a valid key');
    await confirm.getByRole('button', { name: 'Revoke key' }).click();
    await expect(row).toContainText('Revoked');
    await expect(row.getByRole('button', { name: 'Revoke' })).toHaveCount(0);
    expect((await kiosk(request, values)).status()).toBe(401);
  } finally {
    await resetData(request);
  }
});

test("operators and viewers can't register or see keys", async ({ page, signInAs }) => {
  for (const who of ['desk', 'ops', 'look']) {
    await signInAs(who);
    await page.goto('t/powerfuel/machines');
    await expect(page.locator('main [data-row]').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Register a machine' }), who).toHaveCount(0);
    await page.goto('t/powerfuel/machines/new');
    await expect(page.getByText('Not available'), who).toBeVisible();
    await page.goto('t/powerfuel/machines/DEV00001/keys');
    await expect(page.getByText('Not available')).toBeVisible();   // no Keys tab, and not by URL either
    await page.goto('t/powerfuel/machines/DEV00001/menu');
    await expect(page.getByRole('tab', { name: 'Keys' })).toHaveCount(0);
  }
});
