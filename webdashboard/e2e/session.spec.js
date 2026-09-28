// SRV-32: sign in, forced password change, session end, sign out, expiry banner.
import { expect, PASSWORD, resetData, test, USERS } from './fixtures.js';

const NEW_PASSWORD = 'my own password 456';

async function signInWithForm(page, email, password = PASSWORD) {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('each role signs in and lands correctly', async ({ page, shot }) => {
  const landing = { staff: '/dashboard/fleet', owner: '/dashboard/t/powerfuel/home', desk: '/dashboard/t/powerfuel/home',
    ops: '/dashboard/t/powerfuel/home', look: '/dashboard/t/powerfuel/home', boss: '/dashboard/t/globex/home' };
  for (const [key, path] of Object.entries(landing)) {
    await page.goto('sign-in');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/sign in/i);
    if (key === 'staff') await shot('sign-in');
    await signInWithForm(page, USERS[key].email);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/dashboard\/sign-in$/);
  }
});

test('wrong password shows one message', async ({ page, shot }) => {
  await page.goto('sign-in');
  await signInWithForm(page, 'nobody@nowhere.test', 'whatever password');
  const unknown = await page.getByRole('alert').textContent();
  await signInWithForm(page, USERS.look.email, 'not the password');
  await expect(page.getByRole('alert')).toHaveText(unknown);
  expect(unknown).toBe('Email or password is wrong');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await shot('sign-in-error');
});

test.describe('changes a password', () => {
  test.beforeEach(async ({ request }) => { await resetData(request); });
  test.afterEach(async ({ request }) => { await resetData(request); });

  test('temporary password forces the change', async ({ page, shot }) => {
    await page.goto('t/powerfuel/sales');
    await expect(page).toHaveURL(/sign-in\?next=/);
    await signInWithForm(page, USERS.fresh.email);
    await expect(page).toHaveURL(/\/dashboard\/change-password$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/choose your password/i);
    await expect(page.getByRole('navigation')).toHaveCount(0);
    await expect(page.getByRole('link')).toHaveCount(0);
    await shot('change-password-forced');
    // Nothing else opens until it's changed.
    await page.goto('t/powerfuel/home');
    await expect(page).toHaveURL(/\/dashboard\/change-password$/);

    await page.getByLabel('Temporary password').fill(PASSWORD);
    await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel('Repeat new password').fill('something else entirely');
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page.getByText("The passwords don't match")).toBeVisible();
    await page.getByLabel('Repeat new password').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page).toHaveURL(/\/dashboard\/t\/powerfuel\/home$/);

    const old = await page.request.post('/api/v1/auth/login', {
      headers: { 'X-Requested-With': 'fuelbot-dashboard' }, data: { email: USERS.fresh.email, password: PASSWORD } });
    expect(old.status()).toBe(401);
  });

  test('no secrets in storage or URLs', async ({ page }) => {
    const urls = [];
    page.on('request', (r) => urls.push(r.url()));
    page.on('framenavigated', (f) => urls.push(f.url()));
    await page.goto('sign-in');
    await signInWithForm(page, USERS.fresh.email);
    await page.getByLabel('Temporary password').fill(PASSWORD);
    await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel('Repeat new password').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page).toHaveURL(/\/dashboard\/t\/powerfuel\/home$/);
    const stored = await page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }]));
    for (const secret of [PASSWORD, NEW_PASSWORD, encodeURIComponent(PASSWORD), encodeURIComponent(NEW_PASSWORD)]) {
      expect(stored).not.toContain(secret);
      for (const url of urls) expect(url).not.toContain(secret);
    }
    expect(urls.length).toBeGreaterThan(3);
  });
});

test('401 mid-session returns to sign-in and back', async ({ page, context, signInAs }) => {
  await signInAs('owner');
  await page.goto('t/powerfuel/sales');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/sales/i);
  await context.clearCookies();
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(page).toHaveURL(/\/dashboard\/sign-in\?next=%2Fdashboard%2Ft%2Fpowerfuel%2Fsales$/);
  await signInWithForm(page, USERS.owner.email);
  await expect(page).toHaveURL(/\/dashboard\/t\/powerfuel\/sales$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/sales/i);
});

test('sign out ends the session', async ({ page, context }) => {
  await page.goto('sign-in');
  await signInWithForm(page, USERS.owner.email);
  await expect(page).toHaveURL(/\/t\/powerfuel\/home$/);
  const cookies = await context.cookies();
  expect(cookies.some((c) => c.name === 'fb_session' && c.httpOnly && c.sameSite === 'Strict')).toBe(true);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/dashboard\/sign-in$/);
  // The copied cookie no longer works: the server revoked that session.
  await context.addCookies(cookies);
  expect((await page.request.get('/api/v1/auth/me')).status()).toBe(401);
});

test('expiry banner', async ({ page, signInAs, shot }) => {
  await page.clock.install({ time: new Date() });
  await signInAs('owner');
  await page.goto('t/powerfuel/home');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const banner = page.getByText(/Your session ends at \d\d:\d\d IST\. Save your work, then sign in again\./);
  await expect(banner).toHaveCount(0);
  await page.clock.fastForward('47:40:00');
  await expect(banner).toBeVisible();
  await shot('session-expiry-banner');
});
