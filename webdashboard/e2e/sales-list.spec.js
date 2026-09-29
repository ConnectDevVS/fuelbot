// SRV-40: the sales table, CSV, the Not dispensed list, order detail and the print report.
import fs from 'node:fs';
import { COUNTS } from './seed.mjs';
import { expect, test } from './fixtures.js';

// The server's CSV columns (server/src/routes/sales.js).
const TENANT_COLUMNS = 'local_time,ts,order_id,order_number,machine_id,flavor_id,base_id,actual_price,offer_price,charged_price,'
  + 'currency,payment_method,transaction_id,dispensed';
// Every seeded failure reason and result (seed.mjs REASONS): never on a tenant screen.
const PLATFORM_WORDS = ['deadline', 'machine_fault', 'no_response', 'timeout', 'rejected'];
// The whole seed is within the last 12 months.
const ALL = 'period=last_12_months';

const panel = (page, name) => page.getByRole('region', { name, exact: true });
/** A row's order link: the first cell (desktop/tablet) or the card title (phone). */
const orderLinks = (scope) => scope.locator('a[href*="/orders/"]');

async function apiTotal(page, extra = '') {
  const now = await page.request.get(`/api/v1/sales/summary?group=month&tenant=powerfuel${extra}`).then((r) => r.json());
  return now.totals;
}

test('Load more pages through all sales without duplicates', async ({ page, signInAs, shot }) => {
  await signInAs('owner');
  const total = (await apiTotal(page)).count;
  // The seed's 120 sales plus one from an unregistered machine id (the tenant's all the same).
  expect(total).toBe(COUNTS.powerfuelSales + 1);
  await page.goto(`t/powerfuel/sales?${ALL}`);
  const list = panel(page, 'Sales');
  await expect(orderLinks(list)).toHaveCount(50);
  await shot('sales-table');
  const more = list.getByRole('button', { name: 'Load more' });
  await more.click();
  await expect(orderLinks(list)).toHaveCount(100);
  await more.click();
  await expect(orderLinks(list)).toHaveCount(total);
  await expect(more).toHaveCount(0);
  const hrefs = await orderLinks(list).evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  expect(new Set(hrefs).size).toBe(total);
  // A row opens its order.
  await orderLinks(list).first().click();
  await expect(page).toHaveURL(/\/dashboard\/orders\/E2E-PF-\d{4}$/);
});

test('tenant sees Not dispensed with no reason', async ({ page, signInAs, shot }) => {
  await signInAs('owner');
  await page.goto(`t/powerfuel/sales?${ALL}&dispensed=false`);
  const list = panel(page, 'Sales');
  await expect(orderLinks(list)).toHaveCount(COUNTS.notDispensed);
  await expect(list.getByText('Not dispensed', { exact: true })).toHaveCount(COUNTS.notDispensed);
  await expect(page.getByRole('tab', { name: `Not dispensed (${COUNTS.notDispensed})` })).toBeVisible();
  await page.getByRole('tab', { name: /Not dispensed/ }).click();
  await expect(page).toHaveURL(/view=not-dispensed/);
  const nd = panel(page, 'Not dispensed');
  await expect(orderLinks(nd)).toHaveCount(COUNTS.notDispensed);
  await expect(page.getByText(/Refunds are done in the Razorpay dashboard/)).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Dispensed' })).toHaveCount(0);   // fixed on this tab
  const text = (await page.locator('main').innerText()).toLowerCase();
  for (const word of PLATFORM_WORDS) expect(text, word).not.toContain(word);
  await page.mouse.move(1, 1);
  await shot('sales-nd-owner');

  // Staff see the result and reason on the same list (phone cards too).
  await signInAs('staff');
  await page.goto(`t/powerfuel/sales?view=not-dispensed&${ALL}`);
  const staffNd = panel(page, 'Not dispensed');
  await expect(orderLinks(staffNd)).toHaveCount(COUNTS.notDispensed);
  await expect(staffNd.getByText('deadline').first()).toBeVisible();
  await expect(staffNd.getByText('machine_fault').first()).toBeVisible();
  await page.mouse.move(1, 1);
  await shot('sales-nd-staff');
});

test('CSV downloads with the tenant columns', async ({ page, signInAs }, info) => {
  test.skip(info.project.name !== 'desktop', 'one download is enough');
  await signInAs('owner');
  await page.goto(`t/powerfuel/sales?${ALL}&machine=E2E00002`);
  const link = panel(page, 'Sales').getByRole('link', { name: /Export CSV/ });
  const href = new URL(await link.getAttribute('href'), 'http://x');
  expect(href.searchParams.get('machine')).toBe('E2E00002');
  expect(href.searchParams.has('limit')).toBe(false);
  const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
  const lines = fs.readFileSync(await download.path(), 'utf8').trim().split('\r\n');
  expect(lines[0]).toBe(TENANT_COLUMNS);
  expect(lines[0]).not.toContain('dispensing_reason');
  const total = (await apiTotal(page, `&machine=E2E00002&from=${encodeURIComponent(href.searchParams.get('from'))}`
    + `&to=${encodeURIComponent(href.searchParams.get('to'))}`)).count;
  expect(lines).toHaveLength(total + 1);
  for (const line of lines.slice(1)) expect(line).toContain(',E2E00002,');
});

test('order page', async ({ page, signInAs, shot }) => {
  // An order on Bay 3 (E2E00002), found as the owner.
  await signInAs('owner');
  const bay3 = await page.request.get('/api/v1/sales?machine=E2E00002&limit=1').then((r) => r.json());
  const orderId = bay3.items[0].order_id;

  await page.goto(`orders/${orderId}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/order/i);
  await expect(panel(page, 'Sale')).toContainText(orderId);
  await expect(panel(page, 'Sale')).toContainText('Bay 3');
  await expect(page.getByRole('figure', { name: 'Stages of the dispense cycle' })).toHaveCount(0);
  const text = (await page.locator('main').innerText()).toLowerCase();
  for (const word of ['homing', 'result', 'reason', ...PLATFORM_WORDS]) expect(text, word).not.toContain(word);
  await page.mouse.move(1, 1);
  await shot('order-owner');

  await signInAs('staff');
  await page.goto('orders/E2E-PF-0001');
  const timeline = page.getByRole('figure', { name: 'Stages of the dispense cycle' });
  await expect(timeline).toBeVisible();
  await expect(timeline).toContainText('HOMING_DONE');
  await expect(timeline).toContainText('+1.8 s');
  await expect(panel(page, 'Sale')).toContainText('Machine registered');
  await page.mouse.move(1, 1);
  await shot('order-staff');

  // An operator limited to DEV00001 can't open a Bay 3 order: Not found, never which.
  await signInAs('desk');
  await page.goto(`orders/${orderId}`);
  await expect(page.getByText("Order not found, or you don't have access.")).toBeVisible();
});

test('print report', async ({ page, signInAs }, info) => {
  test.skip(info.project.name !== 'desktop', 'the PDF is A4 whatever the window');
  await page.addInitScript(() => { window.print = () => { window.__printed = (window.__printed ?? 0) + 1; }; });
  await signInAs('owner');
  await page.goto(`t/powerfuel/sales?${ALL}`);
  await expect(panel(page, 'By machine')).toContainText('Bay 02');
  await page.getByRole('button', { name: 'Print report' }).click();
  await expect.poll(() => page.evaluate(() => window.__printed ?? 0)).toBe(1);

  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('navigation')).toHaveCount(0);   // display: none leaves the tree
  await expect(panel(page, 'Sales')).toBeHidden();
  await expect(page.getByRole('tablist')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Refresh' })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Sales report' })).toBeVisible();
  await expect(page.getByText(/^Generated .* by owner@powerfuel\.test$/)).toBeVisible();
  const printed = page.getByRole('region', { name: 'Not dispensed' });
  await expect(printed.locator('tbody tr')).toHaveCount(COUNTS.notDispensed);
  await expect(page.getByRole('figure', { name: /^Revenue by / })).toBeVisible();
  await page.pdf({ path: '.screenshots/sales-report.pdf', format: 'A4', printBackground: true });
});
