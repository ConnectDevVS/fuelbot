// SRV-46: Users. Desktop first (DP §0.1 row 3). Specs that write reset.
import { expect, PASSWORD, resetData, test, USERS } from './fixtures.js';

test.skip(({ viewport }) => viewport.width < 1100, 'desktop first (DP §0.1 row 3)');

const dialog = (page) => page.getByRole('dialog');
const row = (page, email) => page.locator('main tbody tr').filter({ hasText: email });
const TEMP = /^[A-HJ-KM-NP-Za-km-np-z2-9]{14}$/;   // no 0/1, I/L/O, l/o

async function action(page, email, name) {
  await row(page, email).getByRole('button', { name: /^Actions for / }).click();
  await page.locator('.ant-dropdown:visible').last().getByRole('menuitem', { name }).click();
}

/** Signs in through the UI in a fresh context (another browser). */
async function freshSignIn(browser, email, password) {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:8795/dashboard/', viewport: { width: 1440, height: 900 } });
  const p = await context.newPage();
  await p.goto('sign-in');
  await p.getByLabel('Email').fill(email);
  await p.getByLabel('Password', { exact: true }).fill(password);
  await p.getByRole('button', { name: 'Sign in' }).click();
  return { context, page: p };
}

async function openNewUser(page) {
  await page.getByRole('button', { name: 'New user' }).click();
  await expect(dialog(page)).toBeVisible();
}

async function pickOption(page, label, option) {
  await dialog(page).getByRole('combobox', { name: label }).click();
  await page.locator('.ant-select-dropdown:visible').getByTitle(option, { exact: true }).click();
}

test('owner creates an operator limited to Bay 02, and that user must change the password at first sign-in', async ({ page, request, browser, signInAs, shot }) => {
  await signInAs('owner');
  try {
    await page.goto('t/powerfuel/users');
    await expect(row(page, USERS.desk.email)).toContainText('Bay 02');
    await expect(row(page, USERS.owner.email)).toContainText('All machines');
    await page.mouse.move(1, 1);
    await shot('users');
    await openNewUser(page);
    const d = dialog(page);
    await d.getByLabel('Email').fill('till@powerfuel.test');
    await d.getByLabel('Name').fill('Till');
    await pickOption(page, 'Role', 'Operator');
    await d.getByRole('combobox', { name: 'Machines' }).click();
    await page.locator('.ant-select-dropdown:visible').getByTitle('Bay 02 · DEV00001').click();
    await page.keyboard.press('Escape');
    await d.getByRole('button', { name: 'Generate' }).click();
    const temp = await d.getByLabel('Temporary password').inputValue();
    expect(temp).toMatch(TEMP);
    await expect(d).toContainText('Give this to the user outside the dashboard');
    await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0);   // closed, not mid-fade
    await page.mouse.move(1, 1);
    await shot('users-create', { fullPage: false });
    const [req] = await Promise.all([page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/users')),
      d.getByRole('button', { name: 'Add user' }).click()]);
    expect(req.postDataJSON()).toMatchObject({ email: 'till@powerfuel.test', role: 'operator', machines: ['DEV00001'], tenant_id: 'powerfuel' });
    await expect(dialog(page)).toHaveCount(0);
    await expect(row(page, 'till@powerfuel.test')).toContainText('Must change password');
    await expect(row(page, 'till@powerfuel.test')).toContainText('Bay 02');

    const other = await freshSignIn(browser, 'till@powerfuel.test', temp);
    await expect(other.page).toHaveURL(/\/change-password$/);
    await expect(other.page.getByRole('heading', { level: 1 })).toHaveText(/choose your password/i);
    await other.context.close();
  } finally {
    await resetData(request);
  }
});

test('duplicate email and a short password show field errors', async ({ page, signInAs }) => {
  await signInAs('owner');
  await page.goto('t/powerfuel/users');
  await openNewUser(page);
  const d = dialog(page);
  await d.getByLabel('Email').fill(USERS.desk.email);
  await d.getByLabel('Temporary password').fill('short');
  await d.getByRole('button', { name: 'Add user' }).click();
  await expect(d.locator('.ant-form-item-explain-error').filter({ hasText: '10 or more characters' })).toBeVisible();
  await d.getByLabel('Temporary password').fill('a long enough one');
  await d.getByRole('button', { name: 'Add user' }).click();
  await expect(d.locator('.ant-form-item-explain-error').filter({ hasText: 'A user with this email exists' })).toBeVisible();
});

test("owner can't disable themselves or the last tenant admin", async ({ page, request, signInAs }) => {
  await signInAs('owner');
  try {
    await page.goto('t/powerfuel/users');
    // Own row: only Edit, and no role in the dialog.
    await row(page, USERS.owner.email).getByRole('button', { name: /^Actions for / }).click();
    await expect(page.locator('.ant-dropdown:visible').last().getByRole('menuitem')).toHaveText(['Edit']);
    await page.locator('.ant-dropdown:visible').last().getByRole('menuitem', { name: 'Edit' }).click();
    await expect(dialog(page).getByRole('combobox', { name: 'Role' })).toHaveCount(0);
    await expect(dialog(page)).toContainText("You can't change your own role or disable yourself.");
    await dialog(page).getByRole('button', { name: 'Cancel' }).click();

    // Promote ops, sign in as them, demote the owner: now ops is the only admin.
    await action(page, USERS.ops.email, 'Edit');
    await pickOption(page, 'Role', 'Tenant admin');
    await dialog(page).getByRole('button', { name: 'Save' }).click();
    await expect(row(page, USERS.ops.email)).toContainText('Tenant admin');
    await action(page, USERS.ops.email, 'Disable');
    const confirm = page.getByRole('dialog').filter({ hasText: /Disable Ops\?/ });
    await confirm.getByRole('button', { name: 'Disable user' }).click();
    await expect(row(page, USERS.ops.email)).toContainText('Disabled');
    // The owner is the only active admin again: demoting them is refused by the server (self), and
    // disabling another admin who is the last one → last_tenant_admin. Re-enable ops, disable owner via ops.
    await action(page, USERS.ops.email, 'Enable');
    await expect(row(page, USERS.ops.email)).toContainText('Active');
    await signInAs('ops');
    await page.goto('t/powerfuel/users');
    await action(page, USERS.owner.email, 'Edit');
    await pickOption(page, 'Role', 'Viewer');
    await dialog(page).getByRole('button', { name: 'Save' }).click();
    await expect(row(page, USERS.owner.email)).toContainText('Viewer');
    // ops is now the last admin; ops can't disable themselves (hidden), and no one else is an admin.
    await row(page, USERS.ops.email).getByRole('button', { name: /^Actions for / }).click();
    await expect(page.locator('.ant-dropdown:visible').last().getByRole('menuitem')).toHaveText(['Edit']);
    await page.keyboard.press('Escape');
    // Staff trying to disable the last tenant admin gets the message.
    await signInAs('staff');
    await page.goto('t/powerfuel/users');
    await action(page, USERS.ops.email, 'Disable');
    await page.getByRole('dialog').filter({ hasText: /Disable Ops\?/ }).getByRole('button', { name: 'Disable user' }).click();
    await expect(page.getByRole('alert')).toContainText('Every company needs an active admin');
  } finally {
    await resetData(request);
  }
});

test('disable signs the user out', async ({ page, request, browser, signInAs }) => {
  const look = await freshSignIn(browser, USERS.look.email, PASSWORD);
  try {
    await expect(look.page).toHaveURL(/\/t\/powerfuel\/home$/);
    await signInAs('owner');
    await page.goto('t/powerfuel/users');
    await action(page, USERS.look.email, 'Disable');
    await page.getByRole('dialog').filter({ hasText: /Disable Look\?/ }).getByRole('button', { name: 'Disable user' }).click();
    await expect(page.getByText('Look disabled and signed out')).toBeVisible();
    await look.page.goto('t/powerfuel/sales');
    await expect(look.page).toHaveURL(/\/sign-in/);
  } finally {
    await look.context.close();
    await resetData(request);
  }
});

test('reset password forces a change', async ({ page, request, browser, signInAs }) => {
  await signInAs('owner');
  try {
    await page.goto('t/powerfuel/users');
    await action(page, USERS.desk.email, 'Reset password');
    await dialog(page).getByRole('button', { name: 'Generate' }).click();
    const temp = await dialog(page).getByLabel('Temporary password').inputValue();
    await dialog(page).getByRole('button', { name: 'Set temporary password' }).click();
    await expect(page.getByText(/password reset/)).toBeVisible();
    await expect(row(page, USERS.desk.email)).toContainText('Must change password');
    const other = await freshSignIn(browser, USERS.desk.email, temp);
    await expect(other.page).toHaveURL(/\/change-password$/);
    await other.context.close();
  } finally {
    await resetData(request);
  }
});

test('staff sees all users with a tenant filter and can create a platform_admin', async ({ page, request, signInAs }) => {
  await signInAs('staff');
  try {
    await page.goto('users');
    await expect(row(page, USERS.boss.email)).toContainText('Globex Fitness');
    await expect(row(page, USERS.owner.email)).toContainText('PowerFuel Gym');
    await page.getByRole('combobox', { name: 'Filter by tenant' }).click();
    await page.locator('.ant-select-dropdown:visible').getByTitle('Globex Fitness').click();
    await expect(row(page, USERS.owner.email)).toHaveCount(0);
    await expect(row(page, USERS.boss.email)).toBeVisible();
    await openNewUser(page);
    await dialog(page).getByLabel('Email').fill('ops2@fuelbot.test');
    await pickOption(page, 'Role', 'FuelBot admin');
    await expect(dialog(page).getByRole('combobox', { name: 'Tenant' })).toHaveCount(0);
    await dialog(page).getByRole('button', { name: 'Generate' }).click();
    const [req] = await Promise.all([page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/users')),
      dialog(page).getByRole('button', { name: 'Add user' }).click()]);
    expect(req.postDataJSON()).toMatchObject({ role: 'platform_admin' });
    expect(req.postDataJSON()).not.toHaveProperty('tenant_id');
    await expect(dialog(page)).toHaveCount(0);
  } finally {
    await resetData(request);
  }
});

test("tenant_admin can't see globex users or offer platform_admin", async ({ page, signInAs }) => {
  await signInAs('owner');
  await page.goto('t/powerfuel/users');
  await expect(row(page, USERS.owner.email)).toBeVisible();
  await expect(row(page, USERS.boss.email)).toHaveCount(0);
  await expect(row(page, USERS.staff.email)).toHaveCount(0);
  await openNewUser(page);
  await dialog(page).getByRole('combobox', { name: 'Role' }).click();
  await expect(page.locator('.ant-select-dropdown:visible .ant-select-item-option')).toHaveText(['Tenant admin', 'Operator', 'Viewer']);
  await page.keyboard.press('Escape');
  await page.goto('t/globex/users');
  await expect(page.getByText('Not found', { exact: true })).toBeVisible();
});

test('operators and viewers have no Users page', async ({ page, signInAs }) => {
  const users = [];
  page.on('request', (r) => { if (r.url().includes('/api/v1/users')) users.push(r.url()); });
  for (const who of ['desk', 'look']) {
    await signInAs(who);
    await page.goto('t/powerfuel/users');
    await expect(page.getByText('Not available'), who).toBeVisible();
  }
  expect(users).toEqual([]);
});
