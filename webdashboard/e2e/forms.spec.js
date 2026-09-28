// SRV-35: the write patterns, on the gallery's form (a stub server in the page: no server writes).
import { expect, test } from './fixtures.js';

test.beforeEach(async ({ page, signInAs }) => {
  await signInAs('staff');
  await page.goto('_gallery?gallery');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/gallery/i);
});

const form = (page) => page.locator('form').filter({ has: page.getByLabel('Description') });
const answer = (page, code) => page.locator('.ant-radio-button-wrapper').filter({ hasText: new RegExp(`^${code}$`) }).click();

test('gallery forms: field errors, conflict, 422', async ({ page, shot }) => {
  const name = page.getByLabel('Name', { exact: true });
  const bar = page.getByRole('region', { name: 'Unsaved changes' });
  await expect(bar).toHaveCount(0);

  // 400 invalid_body: known fields get their errors; the unknown path goes to the summary.
  await answer(page, '400');
  await name.fill('Prymor Guava v2');
  await expect(bar).toBeVisible();
  await expect(bar).toContainText('Changes reach the machine at its next restart.');
  await bar.getByRole('button', { name: 'Save' }).click();
  const summary = form(page).getByRole('alert').first();
  await expect(summary).toContainText('Some fields need fixing');
  await expect(summary).toContainText('colour: unknown field');
  // Under each field (antd's explain line), as well as in the summary.
  const fieldErrors = form(page).locator('.ant-form-item-explain-error');
  await expect(fieldErrors).toHaveText(['a non-empty string ≤ 80', 'whole rupees > 0']);
  await expect(summary.getByRole('button', { name: 'Name' })).toBeVisible();   // scrolls to the field
  await shot('forms-400');

  // 409: the conflict dialog lists what differs; Keep my changes re-saves on their version.
  await answer(page, '409');
  await page.getByLabel('Description').fill('Tangy guava');
  await bar.getByRole('button', { name: 'Save' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Someone else changed this since you opened it.');
  await expect(dialog.getByRole('row', { name: /Name/ })).toContainText('Guava (their edit)');
  await expect(dialog.getByRole('row', { name: /Description/ })).toContainText('Tangy guava');
  await expect.poll(() => page.locator('.ant-modal').evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  await shot('forms-conflict', { fullPage: false });
  await dialog.getByRole('button', { name: 'Keep my changes' }).click();
  await expect(page.getByText('Product saved. Reaches Bay 02 and Bay 3 at their next restart')).toBeVisible();
  await expect(page.getByText('Saved version 5')).toBeVisible();
  // You changed the name and the description; theirs was only the name, so yours wins both.
  await expect(name).toHaveValue('Prymor Guava v2');
  await expect(bar).toHaveCount(0);

  // 422: nothing saved; each machine's app errors are listed.
  await answer(page, '422');
  await page.getByLabel('Description').fill('Tangy guava, less sugar');
  await bar.getByRole('button', { name: 'Save' }).click();
  const panel = form(page).getByRole('alert').filter({ hasText: 'The machine would reject this' });
  await expect(panel).toContainText('Bay 02');
  await expect(panel).toContainText('Bay 3');
  await expect(panel).toContainText('chocolate: hopper 1 already used by guava');
  await expect(page.getByText('Saved version 5')).toBeVisible();
  await expect(bar).toBeVisible();
  await form(page).scrollIntoViewIfNeeded();
  await shot('forms-422');
});

test('unsaved changes block navigation', async ({ page }) => {
  await page.getByLabel('Name', { exact: true }).fill('Something new');
  await expect(page.getByRole('region', { name: 'Unsaved changes' })).toBeVisible();
  const fleet = page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Fleet' });
  await fleet.click();
  const confirm = page.getByRole('dialog');
  await expect(confirm).toContainText('Leave without saving?');
  await confirm.getByRole('button', { name: 'Stay' }).click();
  await expect(confirm).toBeHidden();
  await expect(page).toHaveURL(/_gallery\?gallery$/);
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Something new');

  await fleet.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Leave' }).click();
  await expect(page).toHaveURL(/\/dashboard\/fleet$/);
});
