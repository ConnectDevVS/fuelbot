// SRV-39: Sales overview (filters, day / week / month, breakdowns).
import { COUNTS } from './seed.mjs';
import { expect, test } from './fixtures.js';

const IST = 5.5 * 3600000;
const DAY = 86400000;
const money = (n) => `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(n))}`;
const count = (n) => new Intl.NumberFormat('en-IN').format(n);
const tile = (page, label) => page.getByRole('group', { name: label, exact: true });
const panel = (page, name) => page.getByRole('region', { name, exact: true });
const bars = (page) => page.getByRole('figure', { name: /^Revenue by / }).locator('[data-bucket]');

/** IST calendar helpers (the seed and the server both work in Asia/Kolkata). */
const istKey = (ms) => new Date(ms + IST).toISOString().slice(0, 10);
const isoWeek = (key) => {
  const d = new Date(`${key}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  const thu = new Date(d.getTime() + (3 - dow) * DAY);
  const year = thu.getUTCFullYear();
  const week = 1 + Math.floor((thu - Date.UTC(year, 0, 1)) / (7 * DAY));
  return `${year}-W${String(week).padStart(2, '0')}`;
};
/** Bucket keys over [from, to) as the server makes them. */
function bucketKeys(group, from, to) {
  const keys = new Set();
  for (let ms = Date.parse(from); ms < Date.parse(to); ms += DAY) {
    const key = istKey(ms);
    keys.add(group === 'week' ? isoWeek(key) : group === 'month' ? key.slice(0, 7) : key);
  }
  return [...keys];
}

/** Waits for the summary of a group (the next one the page asks for) and returns {query, body}. */
async function nextSummary(page, group, action) {
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/v1/sales/summary') && new URL(r.url()).searchParams.get('group') === group),
    action(),
  ]);
  return { query: new URL(res.url()).searchParams, body: await res.json() };
}

async function expectKpis(page, totals) {
  await expect(tile(page, 'Revenue')).toContainText(money(totals.revenue));
  await expect(tile(page, 'Orders')).toContainText(count(totals.count));
  await expect(tile(page, 'Average')).toContainText(totals.count ? money(Math.round(totals.revenue / totals.count)) : '—');
  await expect(tile(page, 'Not dispensed')).toContainText(count(totals.not_dispensed));
}

const isPhone = (info) => info.project.name === 'phone';

/**
 * Changes filters the way the layout offers: the row on tablet/desktop; on a phone, the sheet
 * (open, change, Show results). `change(scope)` gets where the controls are.
 */
async function withFilters(page, info, change) {
  if (!isPhone(info)) return change(page.getByRole('group', { name: 'Filters' }));
  await page.getByRole('button', { name: /Filters/ }).click();
  const sheet = page.getByRole('dialog');
  await change(sheet);
  await sheet.getByRole('button', { name: 'Show results' }).click();
  await expect(sheet).toBeHidden();
  return undefined;
}

async function pickOption(page, scope, label, option) {
  await scope.getByRole('combobox', { name: label }).click();
  await page.locator('.ant-select-dropdown:visible').getByTitle(option, { exact: true }).click();
}

test('totals match the API for each group', async ({ page, signInAs }, info) => {
  await signInAs('owner');
  const first = await nextSummary(page, 'day', () => page.goto('t/powerfuel/sales'));
  expect(first.query.get('tenant')).toBe('powerfuel');
  expect(first.query.get('from')).toMatch(/T00:00:00\+05:30$/);
  expect((Date.parse(first.query.get('to')) - Date.parse(first.query.get('from'))) / DAY).toBe(30);   // Last 30 days
  await expectKpis(page, first.body.totals);
  await expect(bars(page)).toHaveCount(30);
  expect(first.body.totals.count).toBeGreaterThan(0);

  for (const [label, group] of [['Week', 'week'], ['Month', 'month'], ['Day', 'day']]) {
    // Day again is served from the cache: no request to wait for.
    const change = () => withFilters(page, info, (scope) => scope.getByRole('radio', { name: label }).locator('..').click());
    const got = group === 'day' ? (await change(), null) : await nextSummary(page, group, change);
    if (got) {
      expect(got.body.totals).toEqual(first.body.totals);   // the same sales, grouped differently
      expect(got.query.get('from')).toBe(first.query.get('from'));
    }
    const keys = bucketKeys(group, first.query.get('from'), first.query.get('to'));
    await expect(bars(page)).toHaveCount(keys.length);
    await expectKpis(page, first.body.totals);
    await expect(page).toHaveURL(group === 'day' ? /[?&]group=day/ : new RegExp(`[?&]group=${group}`));
  }
});

test('week grouping shows ISO week labels and splits at Monday 00:00 IST', async ({ page, signInAs }) => {
  // The seed has a sale at Sunday 23:59 IST and one at Monday 00:01 IST around this week's Monday.
  const now = Date.now();
  const todayIst = Math.floor((now + IST) / DAY) * DAY - IST;
  const monday = todayIst - ((new Date(todayIst + IST).getUTCDay() + 6) % 7) * DAY;
  const sunday = istKey(monday - DAY);
  const mondayKey = istKey(monday);
  test.skip(monday + 60000 > now - 10 * 60000, 'Monday 00:01 IST is not seeded yet (the first minutes of a week)');
  await signInAs('owner');
  const got = await nextSummary(page, 'week',
    () => page.goto(`t/powerfuel/sales?period=custom&from=${sunday}&to=${mondayKey}&group=week`));
  expect(got.body.items.map((i) => i.key)).toEqual([isoWeek(sunday), isoWeek(mondayKey)]);
  for (const item of got.body.items) expect(item.count).toBeGreaterThanOrEqual(1);
  await expect(bars(page)).toHaveCount(2);
  const chart = page.getByRole('figure', { name: 'Revenue by week' });
  await chart.getByRole('button', { name: 'Show as table' }).click();
  const weekNo = (key) => Number(key.slice(6));
  await expect(chart.getByRole('table')).toContainText(`Week ${weekNo(isoWeek(sunday))} · `);
  await expect(chart.getByRole('table')).toContainText(`Week ${weekNo(isoWeek(mondayKey))} · `);
  await expect(chart.locator('svg[role="group"]')).toContainText(`W${weekNo(isoWeek(mondayKey))}`);
});

test('filters narrow every block', async ({ page, signInAs, shot }, info) => {
  await signInAs('owner');
  await page.goto('t/powerfuel/sales');
  await expect(panel(page, 'By machine').getByText('Bay 02', { exact: true })).toBeVisible();

  // Machine = Bay 3 (E2E00002): every summary carries it; the by-machine table has one row.
  const machine = await nextSummary(page, 'machine', () => withFilters(page, info, (scope) => pickOption(page, scope, 'Machine', 'Bay 3')));
  expect(machine.query.get('machine')).toBe('E2E00002');
  expect(machine.body.items.map((i) => i.key)).toEqual(['E2E00002']);
  await expect(page).toHaveURL(/[?&]machine=E2E00002/);
  const machineRows = panel(page, 'By machine').getByText('Bay 3', { exact: true });
  await expect(machineRows).toHaveCount(1);
  await expect(panel(page, 'By machine').getByText('Bay 02', { exact: true })).toHaveCount(0);

  // Every not-dispensed sale (the seed spans 70 days): the KPIs show 9 and their ₹.
  await page.goto('t/powerfuel/sales?period=last_12_months');
  await expect(bars(page)).toHaveCount(12);   // loaded: the next month summary is the filter's
  const nd = await nextSummary(page, 'month', () => withFilters(page, info, (scope) => scope.getByRole('radio', { name: 'Not dispensed' }).locator('..').click()));
  expect(nd.query.get('dispensed')).toBe('false');
  expect(nd.body.totals.not_dispensed).toBe(COUNTS.notDispensed);
  expect(nd.body.totals.count).toBe(COUNTS.notDispensed);
  await expect(tile(page, 'Not dispensed')).toContainText(String(COUNTS.notDispensed));
  await expect(tile(page, 'Not dispensed')).toContainText(money(nd.body.totals.not_dispensed_amount));
  await expect(tile(page, 'Orders')).toContainText(String(COUNTS.notDispensed));
  // The flavor and machine blocks follow the same filter.
  const flavorTotal = await page.request.get(`/api/v1/sales/summary?group=flavor&${new URLSearchParams({
    tenant: 'powerfuel', from: nd.query.get('from'), to: nd.query.get('to'), dispensed: 'false' })}`).then((r) => r.json());
  expect(flavorTotal.totals.count).toBe(COUNTS.notDispensed);
  await expect(panel(page, 'By flavor')).not.toContainText('No sales in this period');
  await page.mouse.move(1, 1);
  await shot('sales-filtered');
});

test('the Not dispensed link from Home opens that tab for today', async ({ page, signInAs }) => {
  await signInAs('owner');
  await page.goto('t/powerfuel/sales?view=not-dispensed&period=today');
  await expect(page.getByRole('tab', { name: 'Not dispensed' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Overview' }).click();
  await expect(page).toHaveURL(/\/sales\?period=today$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/sales/i);
  await expect(page.getByText(/^Today · by day/).first()).toBeVisible();
});

test('tenant users have no Result filter or tenant breakdown', async ({ page, signInAs, shot }, info) => {
  const urls = [];
  page.on('request', (r) => { if (r.url().includes('/api/v1/sales')) urls.push(r.url()); });
  await signInAs('owner');
  await page.goto('t/powerfuel/sales?result=timeout&group=week');
  await expect(panel(page, 'By machine')).toBeVisible();
  await expect(panel(page, 'By tenant')).toHaveCount(0);
  await expect(panel(page, 'By flavor')).toBeVisible();
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
  if (isPhone(info)) {
    await page.getByRole('button', { name: /Filters/ }).click();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Show results' })).toBeVisible();
  }
  await expect(page.getByRole('combobox', { name: 'Result' })).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText('timeout');   // the URL's result= is ignored
  await expect(page.getByRole('combobox', { name: 'Tenant', exact: true })).toHaveCount(0);
  for (const u of urls) {
    expect(u).not.toContain('result=');
    expect(u).not.toContain('group=tenant');
  }
  if (isPhone(info)) {
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    // Wait out the sheet's slide-in: the drawer's panel ends at the bottom edge.
    await expect.poll(async () => {
      const box = await page.locator('.ant-drawer-content-wrapper').boundingBox();
      return box ? Math.round(box.y + box.height) : -1;
    }).toBe(page.viewportSize().height);
    await shot('sales-filters-sheet', { fullPage: false });
  } else {
    await page.mouse.move(1, 1);
    await shot('sales-owner');
  }
});

test("staff all tenants shows By tenant and the 'Pick a tenant' note", async ({ page, signInAs, shot }, info) => {
  await signInAs('staff');
  const tenantSummary = await nextSummary(page, 'tenant', () => page.goto('sales'));
  expect(tenantSummary.query.get('tenant')).toBeNull();
  const byTenant = panel(page, 'By tenant');
  await expect(byTenant.getByText('PowerFuel Gym', { exact: true })).toBeVisible();
  await expect(byTenant.getByText('Globex Fitness', { exact: true })).toBeVisible();
  await expect(panel(page, 'Flavor mix')).toContainText('Pick a tenant to see flavors.');
  await expect(panel(page, 'By flavor')).toHaveCount(0);
  if (!isPhone(info)) {
    await expect(page.getByRole('combobox', { name: 'Result' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Machine' })).toHaveCount(0);   // until a tenant is picked
  }
  await page.mouse.move(1, 1);
  await shot('sales-staff-all');

  // Picking a tenant brings the flavors and the machine breakdown.
  await nextSummary(page, 'machine', () => withFilters(page, info, (scope) => pickOption(page, scope, 'Tenant', 'Globex Fitness')));
  await expect(page).toHaveURL(/[?&]tenant=globex/);
  await expect(panel(page, 'By machine').getByText('Globex Main', { exact: true })).toBeVisible();
  await expect(panel(page, 'Flavor mix').getByRole('listitem').first()).toBeVisible();
});

test("limited operator's Machine select lists only DEV00001", async ({ page, signInAs }, info) => {
  await signInAs('desk');
  await page.goto('t/powerfuel/sales');
  await expect(panel(page, 'By machine').getByText('Bay 02', { exact: true })).toBeVisible();
  await withFilters(page, info, async (scope) => {
    await scope.getByRole('combobox', { name: 'Machine' }).click();
    const options = page.locator('.ant-select-dropdown:visible .ant-select-item-option');
    await expect(options).toHaveText(['All machines', 'Bay 02']);
    await page.keyboard.press('Escape');
  });
});
