// SRV-33: the shell. Navigation per role (DP §3.1), tenant scope, the switcher, gating, layouts.
import { expect, signOutViaUi, test, USERS } from './fixtures.js';

const TENANT_ITEMS = ['Home', 'Sales', 'Stock', 'Machines', 'Products'];
const PLATFORM_ITEMS = ['Tenants', 'Faults', 'Telemetry', 'Audit', 'Unregistered', 'All users', 'All sales'];
const EXPECTED = {
  staff: ['Fleet', ...TENANT_ITEMS, 'Users', 'Company', ...PLATFORM_ITEMS],
  owner: [...TENANT_ITEMS, 'Users', 'Company'],
  desk: TENANT_ITEMS,
  ops: TENANT_ITEMS,
  look: TENANT_ITEMS,
};

/** Every nav destination the user can reach: sidebar links, or tab bar + More sheet on a phone. */
async function navItems(page) {
  const more = page.getByRole('button', { name: 'More' });
  if (await more.isVisible()) {
    const tabs = await page.getByRole('navigation', { name: 'Main' }).getByRole('link').allInnerTexts();
    await more.click();
    const sheet = page.getByRole('dialog');
    const rest = await sheet.getByRole('link').allInnerTexts();
    await sheet.getByRole('button', { name: 'Close' }).click();
    await expect(sheet).toBeHidden();
    return [...tabs, ...rest].map((s) => s.trim());
  }
  return (await page.getByRole('navigation', { name: 'Main' }).getByRole('link').allInnerTexts()).map((s) => s.trim());
}

test('nav per role', async ({ page, signInAs, shot }, testInfo) => {
  // The tablet rail shows the desktop items as icons: checked on desktop and phone, shot on all three.
  const check = testInfo.project.name !== 'tablet';
  for (const [key, expected] of Object.entries(EXPECTED)) {
    await signInAs(key);
    await page.goto('t/powerfuel/home');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/home/i);
    if (check) expect((await navItems(page)).sort(), key).toEqual([...expected].sort());
    if (key === 'staff' || key === 'owner') await shot(`shell-${key}`);
    if (key === 'owner' && testInfo.project.name === 'phone') {
      await page.getByRole('button', { name: 'More' }).click();
      const signOut = page.getByRole('dialog').getByRole('button', { name: 'Sign out' });
      await expect(signOut).toBeInViewport();
      const sheetBottom = async () => {
        const box = await page.locator('.ant-drawer-content-wrapper').boundingBox();
        return Math.round(box.y + box.height);
      };
      await expect.poll(sheetBottom).toBe(page.viewportSize().height);   // finished sliding up
      await shot('shell-more-sheet', { fullPage: false });
      await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
    }
    await signOutViaUi(page);
    await expect(page).toHaveURL(/\/sign-in$/);
  }
});

test("tenant user can't open another tenant", async ({ page, signInAs }) => {
  const asked = [];
  page.on('request', (r) => { if (r.url().includes('/api/v1/tenants/globex')) asked.push(r.url()); });
  await signInAs('owner');
  await page.goto('t/globex/home');
  await expect(page.getByText("Not found, or you don't have access")).toBeVisible();
  await page.goto('t/globex/machines/E2E00005/menu');
  await expect(page.getByText("Not found, or you don't have access")).toBeVisible();
  expect(asked).toEqual([]);
  await expect(page).toHaveTitle(/FuelBot/);
});

test('staff tenant switcher', async ({ page, signInAs, shot }) => {
  await signInAs('staff');
  await page.goto('');
  await expect(page).toHaveURL(/\/dashboard\/fleet$/);
  const switcher = page.getByRole('combobox', { name: 'Tenant' });
  await switcher.click();
  await page.getByRole('option', { name: 'PowerFuel Gym' }).click();
  await expect(page).toHaveURL(/\/dashboard\/t\/powerfuel\/home$/);
  await expect(page).toHaveTitle('Home · PowerFuel Gym · FuelBot');
  await switcher.click();
  await page.getByRole('option', { name: 'All tenants' }).click();
  await expect(page).toHaveURL(/\/dashboard\/fleet$/);
  // An unknown tenant is Not found (the API's 404).
  await page.goto('t/nosuch/home');
  await expect(page.getByText("Not found, or you don't have access")).toBeVisible();
  await shot('shell-not-found');
});

test('gated route shows Not available', async ({ page, signInAs, shot }) => {
  const asked = [];
  page.on('request', (r) => { if (r.url().includes('/api/v1/users')) asked.push(r.url()); });
  await signInAs('look');
  await page.goto('t/powerfuel/users');
  await expect(page.getByText('Not available')).toBeVisible();
  await page.goto('fleet');
  await expect(page.getByText('Not available')).toBeVisible();
  expect(asked).toEqual([]);
  await shot('shell-not-available');
});

test('stays light in OS dark mode', async ({ page, signInAs }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await signInAs('owner');
  await page.goto('t/powerfuel/home');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(244, 245, 242)');
  await expect(page.locator('main')).toHaveCSS('color', 'rgb(17, 18, 21)');
});

test('layouts by width', async ({ page, signInAs }, testInfo) => {
  await signInAs('owner');
  await page.goto('t/powerfuel/home');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const layout = await page.locator('[data-layout]').first().getAttribute('data-layout');
  const sider = page.locator('.ant-layout-sider');
  const tabbar = page.getByRole('button', { name: 'More' });
  if (testInfo.project.name === 'desktop') {
    expect(layout).toBe('desktop');
    await expect(sider).toHaveCSS('width', '232px');
    await expect(page.getByRole('navigation', { name: 'Main' }).getByText('Products')).toBeVisible();
    await expect(tabbar).toHaveCount(0);
  } else if (testInfo.project.name === 'tablet') {
    expect(layout).toBe('tablet');
    await expect(sider).toHaveCSS('width', '72px');
    await expect(tabbar).toHaveCount(0);
  } else {
    expect(layout).toBe('phone');
    await expect(sider).toHaveCount(0);
    await expect(tabbar).toBeVisible();
    const box = await page.getByRole('navigation', { name: 'Main' }).getByRole('link').first().boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  // The active page is marked for assistive tech.
  await expect(page.locator('[aria-current="page"]').first()).toBeAttached();
  expect(USERS.owner.email).toContain('owner');
});
