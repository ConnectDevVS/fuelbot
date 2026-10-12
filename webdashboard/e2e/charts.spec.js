// SRV-37: the charts, in the gallery (fixed sample data), under the CSP/overflow guard.
import { expect, test } from './fixtures.js';

test.beforeEach(async ({ page, signInAs }) => {
  await signInAs('staff');
  await page.goto('_gallery?gallery');
  await expect(page.getByRole('heading', { name: 'Charts' })).toBeVisible();
});

const revenue = (page) => page.getByRole('figure', { name: 'Revenue (sample)' });
const mix = (page) => page.getByRole('figure', { name: 'Flavor mix (sample)' });

test('no overflow at 390', async ({ page, shot }, info) => {
  // Every width: the guard checks the page; here also each chart's own box.
  const chart = revenue(page);
  await chart.scrollIntoViewIfNeeded();
  const [fig, svg] = await Promise.all([chart.boundingBox(), chart.locator('svg[role="group"]').boundingBox()]);
  expect(svg.x + svg.width).toBeLessThanOrEqual(fig.x + fig.width + 0.5);
  // 14 day columns, the gaps included; hatching present.
  await expect(chart.locator('[data-bucket]')).toHaveCount(14);
  await expect(chart.locator('path[data-part="not-dispensed"]')).toHaveCount(5);
  // x labels (the bottom row of text) never overlap each other.
  const xLabels = await chart.locator('svg[role="group"] text').evaluateAll((els) => {
    const bottom = Math.max(...els.map((e) => Number(e.getAttribute('y'))));
    return els.filter((e) => Number(e.getAttribute('y')) === bottom).map((e) => e.getBoundingClientRect())
      .map((r) => ({ x: r.x, w: r.width })).sort((a, b) => a.x - b.x);
  });
  expect(xLabels.length).toBeGreaterThanOrEqual(2);
  for (let i = 1; i < xLabels.length; i += 1) expect(xLabels[i].x, `label ${i}`).toBeGreaterThanOrEqual(xLabels[i - 1].x + xLabels[i - 1].w + 4);
  await page.getByRole('heading', { name: 'Charts' }).scrollIntoViewIfNeeded();
  await shot(`charts-day`, { fullPage: false });
  if (info.project.name === 'desktop') {
    for (const group of ['Week', 'Month']) {
      await page.getByRole('radio', { name: group }).locator('..').click();
      await expect(chart.locator('[data-bucket]')).toHaveCount(12);
      await expect(page.getByRole('radio', { name: group })).toBeChecked();
      await expect(page.locator('.ant-segmented-thumb')).toHaveCount(0);   // its slide animation is over
      await page.mouse.move(1, 1);
      await shot(`charts-${group.toLowerCase()}`, { fullPage: false });
    }
  }
});

test('tooltip on hover and on focus', async ({ page }) => {
  const chart = revenue(page);
  const bar = chart.locator('[data-bucket="2026-09-26"]');
  await bar.hover();
  const tip = page.getByRole('tooltip').filter({ hasText: '26 Sep' });
  await expect(tip).toContainText('26 Sep');
  await expect(tip).toContainText('₹2,140');
  await expect(tip).toContainText('₹160');
  await page.mouse.move(1, 1);
  await expect(tip).toBeHidden();
  // Keyboard: focus shows it too, and Tab walks the columns.
  await chart.locator('[data-bucket="2026-09-15"]').focus();
  await expect(page.getByRole('tooltip').filter({ hasText: '15 Sep' })).toContainText('₹1,180');
  await page.keyboard.press('Tab');
  await expect(chart.locator('[data-bucket="2026-09-16"]')).toBeFocused();
  await expect(page.getByRole('tooltip').filter({ hasText: '16 Sep' })).toContainText('₹1,320');
});

test('table toggle shows the same totals', async ({ page }) => {
  const chart = revenue(page);
  await chart.getByRole('button', { name: 'Show as table' }).click();
  const table = chart.getByRole('table');
  await expect(table.locator('tbody tr')).toHaveCount(14);
  await expect(table.locator('tfoot')).toContainText('₹17,895');
  await expect(table.locator('tfoot')).toContainText('5 · ₹605');
  const flavor = mix(page);
  await flavor.getByRole('button', { name: 'Show as table' }).click();
  await expect(flavor.getByRole('table').locator('tbody tr')).toHaveCount(8);
  await expect(flavor.getByRole('table').locator('tfoot')).toContainText('₹18,855');
  await expect(flavor.getByRole('table')).toContainText('Other (2 flavors)');
});

test('print keeps the hatching', async ({ page, shot }) => {
  await page.emulateMedia({ media: 'print' });
  const chart = revenue(page);
  await chart.scrollIntoViewIfNeeded();
  const adjust = await chart.locator('svg[role="group"]').evaluate((el) => getComputedStyle(el).printColorAdjust);
  expect(adjust).toBe('exact');
  await expect(chart.locator('path[data-part="not-dispensed"]').first()).toBeVisible();
  await page.getByRole('heading', { name: 'Charts' }).scrollIntoViewIfNeeded();
  await shot('charts-print', { fullPage: false });
});
