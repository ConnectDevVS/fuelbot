// SRV-59: first sign-in with the temporary password and the emailed code (server plan §4.16).
// All three widths. The admin creates the user through the API; the codes come from the e2e
// server's memory mailer.
import { CSRF, expect, expireCode, lastCode, mailCount, resetData, test } from './fixtures.js';

const EMAIL = 'till@powerfuel.test';
const TEMP = 'a temporary pass 42';
const MINE = 'my own password 456';

test.beforeEach(async ({ request }) => { await resetData(request); });
test.afterEach(async ({ request }) => { await resetData(request); });

/** The owner adds Till (an operator) with TEMP, then the page signs out: the welcome mail is sent. */
async function ownerAddsTill(page, signInAs) {
  await signInAs('owner');
  const res = await page.request.post('/api/v1/users', { headers: CSRF,
    data: { email: EMAIL, name: 'Till', role: 'operator', tenant_id: 'powerfuel', password: TEMP } });
  expect(res.status()).toBe(201);
  expect((await res.json()).code_mail).toBe('sent');
  await page.request.post('/api/v1/auth/logout', { headers: CSRF });
}

async function signInAsTill(page) {
  await page.goto('sign-in');
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(TEMP);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard\/change-password$/);
}

async function fill(page, code) {
  await page.getByLabel('Temporary password').fill(TEMP);
  await page.getByLabel('Code from your email').fill(code);
  await page.getByLabel('New password', { exact: true }).fill(MINE);
  await page.getByLabel('Repeat new password').fill(MINE);
}

const codeError = (page) => page.locator('.ant-form-item-explain-error').filter({ hasText: 'The code is wrong or has expired' });

test('a new user signs in with the temporary password and the emailed code', async ({ page, signInAs, shot }) => {
  await ownerAddsTill(page, signInAs);
  await signInAsTill(page);
  await expect(page.getByText('Enter the temporary password from your admin and the code we emailed you')).toBeVisible();
  await fill(page, await lastCode(page.request, EMAIL));
  await page.mouse.move(1, 1);
  await shot('first-signin-filled');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page).toHaveURL(/\/dashboard\/t\/powerfuel\/home$/);
  expect(await mailCount(page.request, EMAIL)).toBe(1);
});

test('a wrong code shows on the Code field', async ({ page, signInAs, shot }) => {
  await ownerAddsTill(page, signInAs);
  await signInAsTill(page);
  const code = await lastCode(page.request, EMAIL);
  await fill(page, code === 'AAAAAA' ? 'BBBBBB' : 'AAAAAA');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(codeError(page)).toBeVisible();
  await expect(page).toHaveURL(/\/change-password$/);
  await page.mouse.move(1, 1);
  await shot('first-signin-wrong-code');
  await page.getByLabel('Code from your email').fill(code);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page).toHaveURL(/\/dashboard\/t\/powerfuel\/home$/);
});

test('an expired code: Email me a code, then finish', async ({ page, signInAs }) => {
  await ownerAddsTill(page, signInAs);
  const welcome = await lastCode(page.request, EMAIL);
  await expireCode(page.request, EMAIL);
  await signInAsTill(page);
  await fill(page, welcome);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(codeError(page)).toBeVisible();

  await page.getByRole('button', { name: 'Email me a code' }).click();
  await expect(page.getByRole('status').filter({ hasText: `Code sent to ${EMAIL}. Valid until` })).toBeVisible();
  await expect(page.getByRole('button', { name: /Send again in \d+ s/ })).toBeDisabled();
  const fresh = await lastCode(page.request, EMAIL);
  expect(fresh).not.toBe(welcome);
  await page.getByLabel('Code from your email').fill(fresh);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page).toHaveURL(/\/dashboard\/t\/powerfuel\/home$/);
});
