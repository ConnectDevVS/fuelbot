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

// --- SRV-53: the complaint page -----------------------------------------------------------------

const entries = (page) => page.locator('main [data-entry]');
const box = (page) => page.getByRole('textbox', { name: 'Comment' });

async function openComplaint(page, n, tid = 'powerfuel') {
  await page.goto(`t/${tid}/complaints/${n}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
}

async function pickStatus(page, label) {
  await page.getByRole('combobox', { name: 'Change status' }).click();
  await page.locator('.ant-select-dropdown:visible').getByTitle(label, { exact: true }).click();
  await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0);
}

test('creator comments on their complaint', async ({ page, request, signInAs, shot }) => {
  await signInAs('desk');
  try {
    await openComplaint(page, 1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Bay 02 screen froze after paying/i);
    await expect(entries(page)).toHaveCount(3);   // the description, a staff status change, desk's comment
    await expect(entries(page).nth(1)).toContainText('FuelBot support');
    await expect(page.locator('main')).not.toContainText('staff@fuelbot.test');
    await expect(page.getByRole('combobox', { name: 'Change status' })).toHaveCount(0);
    await expect(page.getByText('Tenant users see everything you write here.')).toHaveCount(0);
    await page.mouse.move(1, 1);
    await shot('complaint-tenant');
    await box(page).fill('It froze again at 6 pm.\nSame screen.');
    await page.getByRole('button', { name: 'Post comment' }).click();
    await expect(entries(page)).toHaveCount(4);
    await expect(entries(page).last()).toContainText('It froze again at 6 pm.');
    await expect(box(page)).toHaveValue('');
    await expect(page.locator('main').getByText('With service').first()).toBeVisible();   // unchanged
  } finally {
    await resetData(request);
  }
});

test('staff move a complaint to With service with a comment; the tenant sees FuelBot support', async ({ page, request, browser, signInAs, shot }) => {
  await signInAs('staff');
  try {
    await openComplaint(page, 2);
    await expect(page.getByText('Tenant users see everything you write here.')).toBeVisible();
    await expect(page.locator('main')).toContainText('ops@powerfuel.test');   // staff see emails
    await pickStatus(page, 'Set to With service');
    const post = page.getByRole('button', { name: 'Post and set to With service' });
    await expect(post).toBeDisabled();
    await expect(box(page)).toHaveAttribute('placeholder', /Say why/);
    await box(page).fill('Checking the hopper mapping on Bay 3.');
    await expect(post).toBeEnabled();
    await page.mouse.move(1, 1);
    await expect(post).toHaveCSS('background-color', 'rgb(200, 255, 62)');   // antd's fade from disabled has ended
    await shot('complaint-staff');
    const [req] = await Promise.all([
      page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/complaints/2/status')),
      post.click(),
    ]);
    expect(req.postDataJSON()).toEqual({ from: 'open', to: 'with_service', text: 'Checking the hopper mapping on Bay 3.' });
    await expect(entries(page)).toHaveCount(2);
    await expect(entries(page).last()).toContainText('Status changed');
    // Back to "Keep status": the button is a plain comment again, and the old status isn't offered.
    await expect(page.getByRole('button', { name: 'Post comment' })).toBeVisible();
    await expect(page.locator('main .ant-select').filter({ has: page.getByRole('combobox', { name: 'Change status' }) }))
      .toContainText('Keep status');

    // The tenant admin's view of the same thread.
    const other = await browser.newContext({ baseURL: page.url().replace(/t\/powerfuel.*$/, ''), viewport: page.viewportSize() });
    const owner = await other.newPage();
    const res = await owner.request.post('/api/v1/auth/login', { headers: { 'X-Requested-With': 'fuelbot-dashboard' },
      data: { email: 'owner@powerfuel.test', password: 'e2e password 123' } });
    expect(res.status()).toBe(200);
    await openComplaint(owner, 2);
    await expect(entries(owner).last()).toContainText('FuelBot support');
    await expect(entries(owner).last()).toContainText('Staff');
    await expect(owner.locator('main')).not.toContainText('staff@fuelbot.test');
    await other.close();
  } finally {
    await resetData(request);
  }
});

test('staff can\'t change status without a comment', async ({ page, signInAs }) => {
  await signInAs('staff');
  await openComplaint(page, 4);
  let posted = false;
  page.on('request', (r) => { if (r.method() === 'POST') posted = true; });
  await pickStatus(page, 'Set to Closed');
  await expect(page.getByRole('button', { name: 'Post and set to Closed' })).toBeDisabled();
  await box(page).fill('   ');
  await expect(page.getByRole('button', { name: 'Post and set to Closed' })).toBeDisabled();
  expect(posted).toBe(false);
});

test('tenant admin reopens a colleague\'s closed complaint', async ({ page, request, signInAs }) => {
  await signInAs('owner');
  try {
    await openComplaint(page, 3);
    await page.getByRole('button', { name: 'Reopen' }).click();
    const post = page.getByRole('button', { name: 'Post and reopen' });
    await expect(post).toBeDisabled();
    await box(page).fill('Two more customers could not scan today.');
    await post.click();
    await expect(page.locator('main').getByText('Open', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reopen' })).toHaveCount(0);
    await expect(entries(page).last()).toContainText('Two more customers could not scan today.');
  } finally {
    await resetData(request);
  }
});

test('operator can\'t open a colleague\'s complaint', async ({ page, signInAs }) => {
  await signInAs('desk');
  await page.goto('t/powerfuel/complaints/2');
  await expect(page.getByText("Not found, or you don't have access")).toBeVisible();
  await expect(page.locator('main')).not.toContainText('Wrong flavour');
});

test('viewer has no status control, only Reopen when closed', async ({ page, signInAs, shot }) => {
  await signInAs('look');
  await openComplaint(page, 3);
  await expect(page.getByRole('combobox', { name: 'Change status' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reopen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Post comment' })).toBeVisible();   // comments stay open
  await page.mouse.move(1, 1);
  await shot('complaint-closed');
});

test('a stale status shows the conflict alert and keeps the text', async ({ page, request, signInAs }) => {
  await signInAs('staff');
  try {
    await openComplaint(page, 4);
    // Someone else closes it after this page loaded.
    const res = await page.request.post('/api/v1/tenants/powerfuel/complaints/4/status', {
      headers: { 'X-Requested-With': 'fuelbot-dashboard' }, data: { from: 'open', to: 'closed', text: 'Delivered cups.' } });
    expect(res.status()).toBe(201);
    await pickStatus(page, 'Set to With service');
    await box(page).fill('Ordering more cups.');
    await page.getByRole('button', { name: 'Post and set to With service' }).click();
    const alert = page.getByRole('alert').filter({ hasText: 'This complaint was updated by someone else' });
    await expect(alert).toBeVisible();
    await expect(box(page)).toHaveValue('Ordering more cups.');
    await alert.getByRole('button', { name: 'Reload' }).click();
    await expect(entries(page)).toHaveCount(2);
    await expect(box(page)).toHaveValue('Ordering more cups.');
  } finally {
    await resetData(request);
  }
});

test('text renders as text', async ({ page, request, signInAs }) => {
  await signInAs('owner');
  try {
    await openComplaint(page, 4);
    await box(page).fill('<b>not bold</b> & <i>not italic</i>');
    await page.getByRole('button', { name: 'Post comment' }).click();
    await expect(entries(page).last()).toContainText('<b>not bold</b> & <i>not italic</i>');
    await expect(entries(page).last().locator('b', { hasText: 'not bold' })).toHaveCount(0);
  } finally {
    await resetData(request);
  }
});
