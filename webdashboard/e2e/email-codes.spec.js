// SRV-60: the email-code walk-through for sign-off (server plan §4.16). All three widths. One user's
// whole life: a tenant_admin adds them in the UI → first sign-in with the temporary password and
// the welcome code → sign out → forgot password → reset → sign in. Staff resend a code from /users.
// Leak scan: no code in a URL, browser storage or the console, in any of it.
import { CSRF, expect, lastCode, mailCount, PASSWORD, resetData, test, USERS } from './fixtures.js';

const MINE = 'chosen by till 2026';
const AGAIN = 'chosen again 2027 x';

test.beforeEach(async ({ request }) => { await resetData(request); });
test.afterEach(async ({ request }) => { await resetData(request); });

/** Records every URL, console line and the browser storage, to check no code leaked. */
function leakWatch(page) {
  const seen = [];
  page.on('request', (r) => seen.push(r.url()));
  page.on('framenavigated', (f) => seen.push(f.url()));
  page.on('console', (m) => seen.push(m.text()));
  return {
    async check(secrets) {
      seen.push(await page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }])));
      const all = seen.join('\n');
      for (const secret of secrets) expect(all, 'a code or password leaked').not.toContain(secret);
    },
  };
}

async function signInForm(page, email, password) {
  await page.goto('sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

async function signOut(page) {
  await page.request.post('/api/v1/auth/logout', { headers: CSRF });
  await page.context().clearCookies();
}

test('an operator from creation to a recovered password', async ({ page, signInAs }) => {
  const email = `till-${Date.now()}@powerfuel.test`;   // its own address: the forgot limiter outlives resets
  const watch = leakWatch(page);

  // 1. The tenant_admin adds the operator in the UI with a generated temporary password.
  await signInAs('owner');
  await page.goto('t/powerfuel/users');
  await page.getByRole('button', { name: 'New user' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('Email').fill(email);
  await d.getByLabel('Name').fill('Till');
  await d.getByRole('button', { name: 'Generate' }).click();
  const temp = await d.getByLabel('Temporary password').inputValue();
  await d.getByRole('button', { name: 'Add user' }).click();
  await expect(page.getByText('Till added. We emailed them a code; give them the temporary password yourself.')).toBeVisible();
  const welcome = await lastCode(page.request, email);
  expect(await mailCount(page.request, email)).toBe(1);
  await signOut(page);

  // 2. First sign-in: temporary password + the welcome code.
  await signInForm(page, email, temp);
  await expect(page).toHaveURL(/\/change-password$/);
  await page.getByLabel('Temporary password').fill(temp);
  await page.getByLabel('Code from your email').fill(welcome);
  await page.getByLabel('New password', { exact: true }).fill(MINE);
  await page.getByLabel('Repeat new password').fill(MINE);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page).toHaveURL(/\/t\/powerfuel\/home$/);
  await signOut(page);

  // 3. Forgot password: a new code (the welcome one was used), then a new password.
  await page.goto('sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page).toHaveURL(/\/reset-password$/);
  await expect.poll(() => mailCount(page.request, email)).toBe(2);
  const reset = await lastCode(page.request, email);
  expect(reset).not.toBe(welcome);
  await page.getByLabel('New password', { exact: true }).fill(AGAIN);
  await page.getByLabel('Repeat new password').fill(AGAIN);
  await page.getByLabel('Code from your email').fill(reset);
  await page.getByRole('button', { name: 'Set password' }).click();
  await expect(page).toHaveURL(/\/sign-in$/, { timeout: 6000 });

  // 4. Only the newest password works.
  for (const [password, status] of [[temp, 401], [MINE, 401], [AGAIN, 200]]) {
    const res = await page.request.post('/api/v1/auth/login', { headers: CSRF, data: { email, password } });
    expect(res.status(), password).toBe(status);
  }
  await watch.check([welcome, reset, temp, MINE, AGAIN]);
});

test('staff resend a code to a tenant user', async ({ page, signInAs }) => {
  const watch = leakWatch(page);
  await signInAs('staff');
  await page.goto('users');
  const row = page.locator('main [data-row]').filter({ hasText: USERS.fresh.email });
  await row.getByRole('button', { name: /^Actions for / }).click();
  await page.locator('.ant-dropdown:visible').last().getByRole('menuitem', { name: 'Send code' }).click();
  await expect(page.getByText(`Code sent to ${USERS.fresh.email}. Valid until`)).toBeVisible();
  const code = await lastCode(page.request, USERS.fresh.email);
  expect(code).toMatch(/^[A-Z0-9]{6}$/);

  // The fresh user (on a temporary password) uses it.
  await signOut(page);
  await signInForm(page, USERS.fresh.email, PASSWORD);
  await page.getByLabel('Temporary password').fill(PASSWORD);
  await page.getByLabel('Code from your email').fill(code);
  await page.getByLabel('New password', { exact: true }).fill(MINE);
  await page.getByLabel('Repeat new password').fill(MINE);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page).toHaveURL(/\/t\/powerfuel\/home$/);
  await watch.check([code, MINE]);
});
