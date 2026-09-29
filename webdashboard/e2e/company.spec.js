// SRV-46: Company (branding). Desktop first (DP §0.1 row 3).
import { expect, resetData, test } from './fixtures.js';

test.skip(({ viewport }) => viewport.width < 1100, 'desktop first (DP §0.1 row 3)');

test('owner changes logo text; the config preview header shows it', async ({ page, request, signInAs, shot }) => {
  await signInAs('owner');
  try {
    await page.goto('t/powerfuel/company');
    await page.getByLabel('Logo text').fill('PFG');
    await expect(page.getByRole('figure', { name: 'Kiosk badge' })).toContainText('PFG');   // live preview
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
    await page.mouse.move(1, 1);
    await shot('company');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/^Company saved/)).toBeVisible();
    const config = await page.request.get('/api/v1/tenants/powerfuel/machines/DEV00001/config').then((r) => r.json());
    expect(config.config.tenant.logo_text).toBe('PFG');
    await page.goto('t/powerfuel/machines/DEV00001/config');
    await expect(page.getByRole('figure', { name: 'Kiosk preview' })).toContainText('PFG');
  } finally {
    await resetData(request);
  }
});

test('logo text > 4 characters → field error', async ({ page, signInAs }) => {
  await signInAs('owner');
  await page.goto('t/powerfuel/company');
  await page.getByLabel('Logo text').fill('PFGYM');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.ant-form-item-explain-error').filter({ hasText: 'At most 4 characters' })).toBeVisible();
  // The server has the same limit, and its error lands on the field too.
  const res = await page.request.patch('/api/v1/tenants/powerfuel', { headers: { 'X-Requested-With': 'fuelbot-dashboard' },
    data: { branding: { logo_text: 'PFGYM' } } });
  expect(res.status()).toBe(400);
  expect((await res.json()).details).toEqual([{ field: 'branding', error: 'logo_text: a string (≤ 4)' }]);
});

test('viewers read the company read-only', async ({ page, signInAs }) => {
  await signInAs('look');
  await page.goto('t/powerfuel/company');
  await expect(page.getByLabel('Logo text')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0);
});
