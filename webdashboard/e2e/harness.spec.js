// The harness's own tests (SRV-31).
import { CSRF, expect, resetData, test, USERS } from './fixtures.js';

// The first page anyone sees (the SRV-30 placeholder until SRV-32; now sign-in): no CSP violation,
// the nonce on every <style>, the theme applied.
test('first page loads with no CSP violation', async ({ page, shot }) => {
  await page.goto('');
  await expect(page).toHaveURL(/\/dashboard\/sign-in/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/sign in/i);
  const button = page.getByRole('button', { name: 'Sign in' });
  await expect(button).toHaveCSS('background-color', 'rgb(200, 255, 62)');
  await expect(button).toHaveCSS('color', 'rgb(17, 18, 21)');
  const styles = await page.evaluate(() => [...document.querySelectorAll('style')].map((s) => s.nonce));
  expect(styles.length).toBeGreaterThan(0);
  expect(styles.every(Boolean), 'every <style> carries the nonce').toBe(true);
  expect(await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('900 20px Archivo'); }))
    .toBe(true);
  await shot('first-page');
});

test('the guard catches a CSP violation', async ({ page, guard }) => {
  await page.goto('');
  await page.evaluate(() => {
    const s = document.createElement('script');
    s.textContent = 'window.__injected = true;';
    document.body.append(s);
  });
  await expect.poll(() => guard.caught.violations.length).toBeGreaterThan(0);
  expect(guard.caught.violations[0]).toMatch(/script-src/);
  expect(await page.evaluate(() => window.__injected)).toBeUndefined();
  guard.reset();   // this test only: the violation was the point
});

test.describe('API', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'API only: once is enough');
  });

  test('seeded users can sign in via the API', async ({ page, signInAs }) => {
    for (const key of Object.keys(USERS)) {
      const user = await signInAs(key);
      expect(user.email).toBe(USERS[key].email);
      expect(user.must_change_password).toBe(key === 'fresh');
      const me = await page.request.get('/api/v1/auth/me');
      expect(me.status()).toBe(200);
      expect((await me.json()).user.email).toBe(USERS[key].email);
    }
  });

  test('reset restores the seed', async ({ page, signInAs }) => {
    await signInAs('owner');
    const count = async () => (await (await page.request.get('/api/v1/tenants/powerfuel/machines')).json()).items.length;
    const before = await count();
    expect(before).toBe(4);
    const created = await page.request.post('/api/v1/tenants/powerfuel/machines', { headers: CSRF, data: { name: 'Temp' } });
    expect(created.status()).toBe(201);
    expect(await count()).toBe(before + 1);
    await resetData(page.request);
    await signInAs('owner');   // the reseed made new users: the old session is gone
    expect(await count()).toBe(before);
  });
});
