// SRV-38: tenant Home, the tenant users' landing.
import { expect, resetData, test } from './fixtures.js';

const money = (n) => `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(n))}`;
const count = (n) => new Intl.NumberFormat('en-IN').format(n);
const tile = (page, label) => page.getByRole('group', { name: label, exact: true });
const panel = (page, name) => page.getByRole('region', { name, exact: true });
const revenueChart = (page) => panel(page, 'Revenue').getByRole('figure');
/** Machine ids in a region (table rows on tablet/desktop, cards on phone). */
const idsIn = (region) => region.locator('.mono').filter({ hasText: /^[A-Z0-9]{8}$/ }).allInnerTexts();

/** Opens Home and waits until every panel has loaded (no skeleton left). */
async function openHome(page, tid = 'powerfuel') {
  await page.goto(`t/${tid}/home`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/today/i);
  await expect(tile(page, 'Revenue today')).toBeVisible();
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
}

/** The sums the tiles must show, from the API as the signed-in user sees it. */
async function expectedKpis(page, tid = 'powerfuel') {
  const res = await page.request.get(`/api/v1/fleet?tenant=${tid}`);
  expect(res.status()).toBe(200);
  const { items } = await res.json();
  const sum = (f) => items.reduce((s, m) => s + (m.today?.[f] ?? 0), 0);
  return {
    items,
    revenue: sum('revenue'), count: sum('count'), nd: sum('not_dispensed'), ndAmount: sum('not_dispensed_amount'),
    online: items.filter((m) => m.online).length, total: items.length, out: items.filter((m) => !m.in_service).length,
  };
}

async function expectTiles(page, k) {
  await expect(tile(page, 'Revenue today')).toContainText(money(k.revenue));
  if (k.count > 0) await expect(tile(page, 'Revenue today')).toContainText(`${money(Math.round(k.revenue / k.count))} avg`);
  await expect(tile(page, 'Orders')).toContainText(count(k.count));
  await expect(tile(page, 'Not dispensed')).toContainText(count(k.nd));
  await expect(tile(page, 'Machines')).toContainText(`${k.online}/${k.total}`);
  if (k.out > 0) await expect(tile(page, 'Machines')).toContainText(`${k.out} out of service`);
}

test("owner sees today's KPIs matching the API", async ({ page, signInAs, shot }) => {
  await signInAs('owner');
  await openHome(page);
  const k = await expectedKpis(page);
  expect(k.count, 'the seed has sales today').toBeGreaterThan(0);
  expect(k.total).toBe(4);
  await expectTiles(page, k);
  await expect(tile(page, 'Orders')).toContainText(/last at \d\d:\d\d IST/);
  // Machines: the tenant view's chips; Refill soon: the seeded hoppers, most urgent first.
  const machines = panel(page, 'Machines');
  expect((await idsIn(machines)).sort()).toEqual(['DEV00001', 'E2E00002', 'E2E00003', 'E2E00004']);
  await expect(machines.getByText('Out of service').first()).toBeVisible();
  const refill = panel(page, 'Refill soon');
  await expect(refill.getByText('Prymor Guava').first()).toBeVisible();
  await expect(refill.getByText('Empty', { exact: true })).toBeVisible();
  await expect(refill.getByText('Low', { exact: true })).toBeVisible();
  await expect(refill.getByText('Refill needed', { exact: true })).toBeVisible();
  await expect(panel(page, 'Flavor mix').getByRole('listitem').first()).toBeVisible();
  await expect(revenueChart(page).locator('[data-bucket]')).toHaveCount(14);
  await page.mouse.move(1, 1);
  await shot('home-owner');
});

test('limited operator sees only DEV00001', async ({ page, signInAs, shot }) => {
  await signInAs('desk');
  await openHome(page);
  const k = await expectedKpis(page);
  expect(k.items.map((m) => m.id)).toEqual(['DEV00001']);
  expect(await idsIn(panel(page, 'Machines'))).toEqual(['DEV00001']);
  await expectTiles(page, k);
  // Stock: only DEV00001's hoppers (E2E00002's "refill needed" isn't theirs).
  await expect(panel(page, 'Refill soon').getByText('Refill needed', { exact: true })).toHaveCount(0);
  await page.mouse.move(1, 1);
  await shot('home-desk');
});

test('tenant Home shows no platform data', async ({ page, signInAs }) => {
  for (const who of ['owner', 'desk', 'look']) {
    await signInAs(who);
    await openHome(page);
    const text = await page.locator('body').innerText();
    for (const word of ['HOMING', 'fault', 'maintenance', 'timeout', 'no DONE', '127.0.0.1', 'last_seen_ip']) {
      expect(text.toLowerCase(), `${who}: "${word}"`).not.toContain(word.toLowerCase());
    }
  }
});

test('Day/Week/Month switch changes the range and the chart buckets', async ({ page, signInAs }) => {
  const summaries = [];
  page.on('request', (r) => { if (r.url().includes('/api/v1/sales/summary')) summaries.push(new URL(r.url()).searchParams); });
  await signInAs('owner');
  await openHome(page);
  const chart = revenueChart(page);
  const range = (group) => summaries.filter((q) => q.get('group') === group).at(-1);
  const flavorRange = () => summaries.filter((q) => q.get('group') === 'flavor').at(-1);
  await expect(chart.locator('[data-bucket]')).toHaveCount(14);
  const day = range('day');
  expect(day.get('tenant')).toBe('powerfuel');
  expect(day.get('from')).toMatch(/T00:00:00\+05:30$/);
  expect(day.get('to')).toMatch(/T00:00:00\+05:30$/);
  expect((Date.parse(day.get('to')) - Date.parse(day.get('from'))) / 86400000).toBe(14);
  expect(flavorRange().get('from')).toBe(day.get('from'));

  const pick = async (label, n, sub) => {
    await panel(page, 'Revenue').getByRole('radio', { name: label }).locator('..').click();
    await expect(page.getByRole('radio', { name: label })).toBeChecked();
    await expect(chart.locator('[data-bucket]')).toHaveCount(n);
    await expect(panel(page, 'Revenue')).toContainText(sub);
    await expect(panel(page, 'Flavor mix')).toContainText(sub);
  };
  for (const [label, group, sub] of [['Week', 'week', 'Last 12 weeks'], ['Month', 'month', 'Last 12 months']]) {
    await pick(label, 12, sub);
    const q = range(group);
    expect(q.get('to')).toBe(day.get('to'));
    expect(flavorRange().get('from')).toBe(q.get('from'));
    if (group === 'week') expect(new Date(Date.parse(q.get('from')) + 5.5 * 3600000).getUTCDay()).toBe(1);   // a Monday
    if (group === 'month') expect(q.get('from')).toMatch(/-01T00:00:00\+05:30$/);
  }
  // Day again: back from the cache, no new request.
  await pick('Day', 14, 'Last 14 days');
  expect(summaries.filter((q) => q.get('group') === 'day')).toHaveLength(1);
});

test('Not dispensed tile links to the preset list', async ({ page, signInAs }) => {
  await signInAs('owner');
  await openHome(page);
  const k = await expectedKpis(page);
  expect(k.nd, "the seed's newest sale today is not dispensed").toBeGreaterThan(0);
  const nd = tile(page, 'Not dispensed');
  await expect(nd).toContainText(money(k.ndAmount));
  await expect(nd).toHaveCSS('background-color', 'rgb(254, 247, 230)');   // the warn surface
  await expect(tile(page, 'Orders')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await nd.getByRole('link', { name: /see list/ }).click();
  await expect(page).toHaveURL(/\/dashboard\/t\/powerfuel\/sales\?view=not-dispensed&period=today$/);
});

test('empty tenant', async ({ page, request, signInAs, shot }) => {
  await resetData(request, { withoutSales: 'globex' });
  try {
    await signInAs('boss');
    await openHome(page, 'globex');
    await expect(tile(page, 'Revenue today')).toContainText('₹0');
    await expect(tile(page, 'Revenue today')).toContainText('No orders yet today');
    await expect(tile(page, 'Not dispensed')).toContainText('None today');
    await expect(panel(page, 'Revenue').getByText('No sales in the last 14 days')).toBeVisible();
    await expect(panel(page, 'Flavor mix').getByText('No sales in the last 14 days')).toBeVisible();
    await expect(revenueChart(page).locator('svg[role="group"]')).toHaveCount(0);
    expect(await idsIn(panel(page, 'Machines'))).toEqual(['E2E00005']);
    await page.getByRole('radio', { name: 'Month' }).locator('..').click();
    await expect(panel(page, 'Revenue').getByText('No sales in the last 12 months')).toBeVisible();
    await expect(page.locator('.ant-segmented-thumb')).toHaveCount(0);   // its slide animation is over
    await page.mouse.move(1, 1);
    await shot('home-empty');
  } finally {
    await resetData(request);
  }
});

test('staff inside a tenant see the platform badge', async ({ page, signInAs }) => {
  await signInAs('staff');
  await openHome(page);
  await expect(panel(page, 'Machines').getByText('Fault', { exact: true })).toBeVisible();
  await expect(panel(page, 'Machines').getByText(/^HOMING_TIMEOUT since/)).toBeVisible();
});

test('Refresh refetches all five; nothing refetches by itself', async ({ page, signInAs }) => {
  await page.clock.install({ time: new Date() });
  const calls = { fleet: 0, summary: 0, stock: 0, products: 0 };
  page.on('request', (r) => {
    const path = new URL(r.url()).pathname;
    if (path.endsWith('/api/v1/fleet')) calls.fleet += 1;
    else if (path.endsWith('/api/v1/sales/summary')) calls.summary += 1;
    else if (path.endsWith('/api/v1/stock')) calls.stock += 1;
    else if (path.endsWith('/tenants/powerfuel/products')) calls.products += 1;
  });
  await signInAs('owner');
  await openHome(page);
  expect(calls).toEqual({ fleet: 1, summary: 2, stock: 1, products: 1 });
  await page.clock.fastForward(70_000);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.clock.fastForward(1_000);
  expect(calls).toEqual({ fleet: 1, summary: 2, stock: 1, products: 1 });
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect.poll(() => ({ ...calls })).toEqual({ fleet: 2, summary: 4, stock: 2, products: 2 });
});
