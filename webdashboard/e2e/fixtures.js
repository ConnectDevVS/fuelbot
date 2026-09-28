// Shared test fixtures (SRV-31). Import { test, expect } from here, never from @playwright/test.
//   signInAs('owner')   API sign-in through page.request (the cookie lands in the page's context)
//   shot('home')        .screenshots/<project>-home.png (look at them)
//   guard               automatic: fails the test on any CSP violation, page error, or
//                       horizontal page overflow. Console "Failed to load resource" lines
//                       (expected 401/403s) are ignored. guard.reset() clears what was caught.
import { test as base, expect } from '@playwright/test';
import { PASSWORD, USERS } from './seed.mjs';

export { expect, PASSWORD, USERS };
export const CSRF = { 'X-Requested-With': 'fuelbot-dashboard' };

export const test = base.extend({
  guard: [async ({ page }, use) => {
    const caught = { violations: [], errors: [] };
    await page.exposeBinding('__e2eCspViolation', (source, text) => { caught.violations.push(text); });
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (e) => {
        window.__e2eCspViolation(`${e.violatedDirective} blocked ${e.blockedURI || 'inline'} (${e.sourceFile}:${e.lineNumber})`);
      });
    });
    page.on('pageerror', (err) => { caught.errors.push(err.message); });
    const guard = {
      caught,
      reset() { caught.violations.length = 0; caught.errors.length = 0; },
    };
    await use(guard);
    expect(caught.violations, 'CSP violations').toEqual([]);
    expect(caught.errors, 'page errors').toEqual([]);
    if (!page.isClosed() && page.url().startsWith('http')) {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, 'horizontal page overflow (px)').toBeLessThanOrEqual(0);
    }
  }, { auto: true }],

  signInAs: async ({ page }, use) => {
    await use(async (who) => {
      const user = USERS[who] ?? { email: who };
      const res = await page.request.post('/api/v1/auth/login', {
        headers: CSRF, data: { email: user.email, password: PASSWORD },
      });
      expect(res.status(), `sign in as ${user.email}`).toBe(200);
      return (await res.json()).user;
    });
  },

  shot: async ({ page }, use, testInfo) => {
    // fullPage for pages; { fullPage: false } for dialogs and sheets (fixed overlays don't render
    // in a full-page capture).
    await use(async (name, { fullPage = true } = {}) => {
      await page.screenshot({ path: `.screenshots/${testInfo.project.name}-${name}.png`, fullPage, timeout: 15000 });
    });
  },
});

/** Signs out through the UI: the account menu, or on a phone the More sheet. */
export async function signOutViaUi(page) {
  const more = page.getByRole('button', { name: 'More' });
  if (await more.isVisible()) {
    await more.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Sign out' }).click();
  } else {
    await page.getByRole('button', { name: 'Account' }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
  }
}

/** Reseeds the database (after a spec wrote something). Sessions end: sign in again after. */
export async function resetData(request) {
  const res = await request.post('http://127.0.0.1:8795/__e2e/reset');
  expect(res.status()).toBe(200);
}
