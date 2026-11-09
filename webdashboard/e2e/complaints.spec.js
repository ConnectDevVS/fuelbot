// SRV-52: the complaints list and Raise. All three widths. Specs that write reset.
import { expect, fieldOf, resetData, test } from './fixtures.js';

const rows = (page) => page.locator('main [data-row]');
const row = (page, key) => page.locator(`main [data-row="${key}"]`);
const sheet = (page) => page.getByRole('dialog').filter({ hasText: 'Raise a complaint' });
const filter = (page, label) => page.locator('main .ant-segmented').getByText(label, { exact: true });

async function openList(page, path = 't/powerfuel/complaints') {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
}

/** Waits for the sheet's slide-in to end (its box stops moving), then for antd's fade. */
async function sheetReady(page) {
  const d = sheet(page);
  await expect(d).toBeVisible();
  const box = () => d.evaluate((el) => JSON.stringify(el.closest('.ant-drawer-content-wrapper')?.getBoundingClientRect() ?? {}));
  let last = '';
  await expect.poll(async () => { const now = await box(); const same = now === last; last = now; return same; }).toBe(true);
}

test('viewer raises a complaint and sees it in their list', async ({ page, request, signInAs, shot }) => {
  await signInAs('look');
  try {
    await openList(page);
    await expect(page.locator('main')).toContainText('No open complaints.');   // Look's only one is closed
    await page.getByRole('button', { name: /Raise complaint/ }).click();
    await sheetReady(page);
    const d = sheet(page);
    await d.getByLabel('Title').fill('Bay 3 is too loud');
    await d.getByLabel('Description').fill('The blender is much louder than last week.\nIt started on Monday.');
    await page.mouse.move(1, 1);
    await shot('complaints-raise', { fullPage: false });
    const [req] = await Promise.all([
      page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/tenants/powerfuel/complaints')),
      d.getByRole('button', { name: 'Send complaint' }).click(),
    ]);
    expect(req.postDataJSON()).toEqual({ title: 'Bay 3 is too loud',
      description: 'The blender is much louder than last week.\nIt started on Monday.' });
    await expect(page).toHaveURL(/\/t\/powerfuel\/complaints\/5$/);
    await expect(page.getByText('Complaint #5 raised')).toBeVisible();

    await openList(page);
    await expect(row(page, 'powerfuel-5')).toContainText('Bay 3 is too loud');
    expect(await fieldOf(row(page, 'powerfuel-5'), 'Status')).toBe('Open');
    // Look sees only what Look raised: the new one (open), not #3 (closed, filtered out) or others'.
    await expect(rows(page)).toHaveCount(1);
    await filter(page, 'Closed').click();
    await expect(row(page, 'powerfuel-3')).toBeVisible();
  } finally {
    await resetData(request);
  }
});

test('operator sees only their own', async ({ page, signInAs }) => {
  await signInAs('desk');
  await openList(page);
  await expect(rows(page)).toHaveCount(1);
  await expect(row(page, 'powerfuel-1')).toContainText('Bay 02 screen froze after paying');
  expect(await fieldOf(row(page, 'powerfuel-1'), 'Status')).toBe('With service');
  await expect(page.locator('main')).not.toContainText('Wrong flavour');
  await expect(page.locator('main thead, main dt').filter({ hasText: /^Raised by$/i })).toHaveCount(0);
});

test('tenant admin sees everyone\'s, newest activity first, with Raised by', async ({ page, signInAs, shot }) => {
  await signInAs('owner');
  await openList(page);
  await expect(rows(page)).toHaveCount(3);
  const keys = await rows(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-row')));
  expect(keys).toEqual(['powerfuel-4', 'powerfuel-1', 'powerfuel-2']);   // #1's last comment is newer than #2
  expect(await fieldOf(row(page, 'powerfuel-2'), 'Raised by')).toBe('Ops');
  expect(await fieldOf(row(page, 'powerfuel-1'), 'Raised by')).toBe('Desk');
  await expect(page.getByRole('button', { name: /Raise complaint/ })).toBeVisible();
  await page.mouse.move(1, 1);
  await shot('complaints-list-owner');
});

test('staff list every tenant\'s complaints, filter by tenant, and can\'t raise', async ({ page, signInAs, shot }) => {
  await signInAs('staff');
  await openList(page, 'complaints');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('All complaints');
  await expect(row(page, 'globex-1')).toContainText('Card payments request');
  expect(await fieldOf(row(page, 'globex-1'), 'Tenant')).toBe('Globex Fitness');
  await expect(rows(page)).toHaveCount(4);   // powerfuel #4, #2, #1 and globex #1 (open or with service)
  await expect(page.getByRole('button', { name: /Raise complaint/ })).toHaveCount(0);
  await page.mouse.move(1, 1);
  await shot('complaints-list-staff');

  await page.getByRole('combobox', { name: 'Filter by tenant' }).click();
  await page.locator('.ant-select-dropdown:visible').getByTitle('Globex Fitness', { exact: true }).click();
  await expect(page).toHaveURL(/[?&]tenant=globex/);
  await expect(rows(page)).toHaveCount(1);
  await expect(row(page, 'globex-1')).toBeVisible();

  // A row opens the complaint inside its tenant.
  await row(page, 'globex-1').getByRole('link').click();
  await expect(page).toHaveURL(/\/t\/globex\/complaints\/1$/);
});

test('the status filter is in the URL', async ({ page, signInAs }) => {
  await signInAs('owner');
  await openList(page);
  await filter(page, 'Closed').click();
  await expect(page).toHaveURL(/[?&]status=closed/);
  await expect(rows(page)).toHaveCount(1);
  await expect(row(page, 'powerfuel-3')).toContainText('Receipt QR did not scan');
  await page.reload();
  await expect(row(page, 'powerfuel-3')).toBeVisible();
  await expect(rows(page)).toHaveCount(1);
  await filter(page, 'All').click();
  await expect(rows(page)).toHaveCount(4);
  await filter(page, 'Open & with service').click();
  await expect(page).not.toHaveURL(/status=/);
  await expect(rows(page)).toHaveCount(3);
});

test('raise validation: the form and the server\'s field errors', async ({ page, signInAs }) => {
  await signInAs('owner');
  await openList(page);
  await page.getByRole('button', { name: /Raise complaint/ }).click();
  await sheetReady(page);
  const d = sheet(page);
  await d.getByLabel('Title').fill('  ab  ');
  await d.getByRole('button', { name: 'Send complaint' }).click();
  await expect(d).toContainText('3 to 120 characters');
  await expect(d).toContainText('Describe the problem');

  // A refusal the form didn't predict lands on its field.
  await page.route('**/api/v1/tenants/powerfuel/complaints', (route) => (route.request().method() === 'POST'
    ? route.fulfill({ status: 400, contentType: 'application/json',
      body: JSON.stringify({ error: 'invalid_body', details: [{ field: 'title', error: '3–120 characters' }] }) })
    : route.fallback()));
  await d.getByLabel('Title').fill('A proper title');
  await d.getByLabel('Description').fill('Something happened.');
  await d.getByRole('button', { name: 'Send complaint' }).click();
  await expect(d).toContainText('3–120 characters');
  await expect(d).toBeVisible();
});

test('closing with text typed asks before discarding', async ({ page, signInAs }) => {
  await signInAs('owner');
  await openList(page);
  await page.getByRole('button', { name: /Raise complaint/ }).click();
  await sheetReady(page);
  await sheet(page).getByLabel('Title').fill('Half written');
  await sheet(page).getByRole('button', { name: 'Cancel' }).click();
  const confirm = page.getByRole('dialog').filter({ hasText: 'Discard this complaint?' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(sheet(page).getByLabel('Title')).toHaveValue('Half written');
  await sheet(page).getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('dialog').filter({ hasText: 'Discard this complaint?' }).getByRole('button', { name: 'Discard' }).click();
  await expect(sheet(page)).toHaveCount(0);
});
