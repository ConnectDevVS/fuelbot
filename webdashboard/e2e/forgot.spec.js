// SRV-58: forgot password → code by email → new password (server plan §4.16). All three widths.
// The codes come from the e2e server's memory mailer. The server's forgot limiter (5 per IP + email
// per 15 minutes) outlives resetData(), so each test makes a user with an address of its own.
import { CSRF, expect, lastCode, mailCount, PASSWORD, resetData, test } from './fixtures.js';

const MINE = 'a fresh password 789';

/** A new active operator with PASSWORD and a unique address (created by the owner, then signed out). */
async function freshUser(page, signInAs, tag) {
  const email = `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@powerfuel.test`;
  await signInAs('owner');
  const res = await page.request.post('/api/v1/users', { headers: CSRF,
    data: { email, name: 'Fresh', role: 'operator', tenant_id: 'powerfuel', password: PASSWORD } });
  expect(res.status()).toBe(201);
  await page.request.post('/api/v1/auth/logout', { headers: CSRF });
  return email;
}

/** The code mailed to email: forgot password sends after answering, so wait for it. */
async function codeFor(page, email) {
  await expect.poll(() => lastCode(page.request, email)).toMatch(/^[A-Z0-9]{6}$/);
  return lastCode(page.request, email);
}

test.beforeEach(async ({ request }) => { await resetData(request); });
test.afterEach(async ({ request }) => { await resetData(request); });

async function startForgot(page, email) {
  await page.goto('sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await expect(page).toHaveURL(/\/dashboard\/forgot-password$/);
  await expect(page.getByLabel('Email')).toHaveValue(email);   // carried over from sign-in
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page).toHaveURL(/\/dashboard\/reset-password$/);
}

async function fill(page, { code, password = MINE, repeat = password }) {
  await page.getByLabel('New password', { exact: true }).fill(password);
  await page.getByLabel('Repeat new password').fill(repeat);
  await page.getByLabel('Code from your email').fill(code);
}

test('forgot then reset, then sign in with the new password', async ({ page, signInAs, shot }) => {
  const email = await freshUser(page, signInAs, 'flow');
  const urls = [];
  page.on('request', (r) => urls.push(r.url()));
  page.on('framenavigated', (f) => urls.push(f.url()));

  await page.goto('sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/forgot password/i);
  await page.mouse.move(1, 1);
  await shot('forgot');
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page).toHaveURL(/\/dashboard\/reset-password$/);
  await expect(page.getByText(`We sent a code to ${email} if it belongs to an account.`)).toBeVisible();
  // The fields in the order asked for: password, repeat, code.
  const labels = await page.locator('main label').allTextContents();
  expect(labels).toEqual(['New password', 'Repeat new password', 'Code from your email']);
  await expect(page.getByRole('button', { name: /Send again in \d+ s/ })).toBeDisabled();

  const code = await codeFor(page, email);
  await fill(page, { code: code.toLowerCase() });
  await page.mouse.move(1, 1);
  await shot('reset');
  await page.getByRole('button', { name: 'Set password' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Password changed. Taking you to sign in…' })).toBeVisible();
  await expect(page.getByLabel('Code from your email')).toHaveCount(0);
  await shot('reset-done');
  await expect(page).toHaveURL(/\/dashboard\/sign-in$/, { timeout: 6000 });

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(MINE);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard\/t\/powerfuel\/home$/);

  // Neither the email, the code nor a password is ever in a URL.
  for (const url of urls) {
    for (const secret of [email, encodeURIComponent(email), code, MINE, encodeURIComponent(MINE)]) {
      expect(url).not.toContain(secret);
    }
  }
  const stored = await page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }]));
  for (const secret of [code, MINE]) expect(stored).not.toContain(secret);
});

test('success returns to sign-in after 3 seconds', async ({ page, signInAs }) => {
  const email = await freshUser(page, signInAs, 'back');
  await startForgot(page, email);
  await fill(page, { code: await codeFor(page, email) });
  const started = Date.now();
  await page.getByRole('button', { name: 'Set password' }).click();
  await expect(page.getByRole('button', { name: 'Sign in now' })).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard\/sign-in$/, { timeout: 6000 });
  expect(Date.now() - started).toBeGreaterThanOrEqual(2900);
});

test('a wrong code shows on the Code field; a short password on New password', async ({ page, signInAs, shot }) => {
  const email = await freshUser(page, signInAs, 'wrong');
  await startForgot(page, email);
  const code = await codeFor(page, email);
  await fill(page, { code: code === 'AAAAAA' ? 'BBBBBB' : 'AAAAAA' });
  await page.getByRole('button', { name: 'Set password' }).click();
  await expect(page.locator('.ant-form-item-explain-error').filter({ hasText: 'The code is wrong or has expired' })).toBeVisible();
  await page.mouse.move(1, 1);
  await shot('reset-wrong-code');
  await fill(page, { code, password: 'short' });
  await page.getByRole('button', { name: 'Set password' }).click();
  await expect(page.locator('.ant-form-item-explain-error').filter({ hasText: '10 or more characters' }).first()).toBeVisible();
  await expect(page).toHaveURL(/\/reset-password$/);
  // The old password still works: nothing changed.
  const res = await page.request.post('/api/v1/auth/login', {
    headers: { 'X-Requested-With': 'fuelbot-dashboard' }, data: { email, password: PASSWORD } });
  expect(res.status()).toBe(200);
});

test('the reset page without an email goes to forgot', async ({ page }) => {
  await page.goto('reset-password');
  await expect(page).toHaveURL(/\/dashboard\/forgot-password$/);
  await expect(page.getByLabel('Email')).toHaveValue('');
});

test('an unknown email looks the same and mails nothing', async ({ page }) => {
  const nobody = `nobody-${Date.now()}@powerfuel.test`;
  await startForgot(page, nobody);
  await expect(page.getByText(`We sent a code to ${nobody} if it belongs to an account.`)).toBeVisible();
  expect(await mailCount(page.request, nobody)).toBe(0);
  await page.getByRole('button', { name: 'Use a different email' }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await expect(page.getByLabel('Email')).toHaveValue(nobody);
});

test('resend waits 60 seconds, then sends the same code', async ({ page, signInAs }) => {
  const email = await freshUser(page, signInAs, 'resend');
  await page.clock.install({ time: new Date() });
  await startForgot(page, email);
  const first = await codeFor(page, email);
  const resend = page.getByRole('button', { name: 'Resend code' });
  await expect(page.getByRole('button', { name: /Send again in \d+ s/ })).toBeDisabled();
  await page.clock.fastForward('01:01');
  await expect(resend).toBeEnabled();
  await resend.click();
  await expect(page.getByRole('status').filter({ hasText: 'Sent again' })).toBeVisible();
  await expect.poll(() => mailCount(page.request, email)).toBe(3);   // welcome, forgot, resend: one code
  expect(await lastCode(page.request, email)).toBe(first);
});
