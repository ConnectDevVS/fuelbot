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
      // Against the configured width: a mobile browser widens its layout viewport to fit wide content,
      // so window.innerWidth grows with the overflow and the difference stays 0.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth) - page.viewportSize().width;
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
      // Every shot is also an overflow check (the guard only checks the page a test ends on).
      const wide = await page.evaluate(() => document.documentElement.scrollWidth);
      expect.soft(wide - page.viewportSize().width, `${name}: horizontal page overflow (px)`).toBeLessThanOrEqual(0);
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

/**
 * Reseeds the database (after a spec wrote something). Sessions end: sign in again after.
 * withoutSales: a tenant id whose sales are deleted after seeding (reset again when done).
 */
export async function resetData(request, { withoutSales } = {}) {
  const query = withoutSales ? `?without_sales=${encodeURIComponent(withoutSales)}` : '';
  const res = await request.post(`http://127.0.0.1:8795/__e2e/reset${query}`);
  expect(res.status()).toBe(200);
}

/** The hrefs (without /dashboard/) of every nav destination: the sidebar, or on a phone the tab bar + More sheet. */
export async function navPaths(page) {
  const main = page.getByRole('navigation', { name: 'Main' });
  await expect(main).toBeVisible();
  const hrefs = (loc) => loc.getByRole('link').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  const all = await hrefs(main);
  const more = page.getByRole('button', { name: 'More' });
  if (await more.isVisible()) {
    await more.click();
    const sheet = page.getByRole('dialog');
    all.push(...await hrefs(sheet.getByRole('navigation', { name: 'More' })));
    await sheet.getByRole('button', { name: 'Close' }).click();
    await expect(sheet).toBeHidden();
  }
  return [...new Set(all.map((h) => h.replace(/^\/dashboard\//, '')))];
}

/** A row's value under a column title: a table cell (by its header), or on a phone the card's dt/dd pair. */
export async function fieldOf(row, title) {
  if (await row.evaluate((el) => el.tagName === 'TR')) {
    const index = await row.evaluate((el, name) => [...el.closest('table').querySelectorAll('thead th')]
      .findIndex((th) => th.innerText.trim().toLowerCase() === name.toLowerCase()), title);
    expect(index, `column "${title}"`).toBeGreaterThanOrEqual(0);
    return (await row.locator('td').nth(index).innerText()).trim();
  }
  return (await row.locator('dt').filter({ hasText: new RegExp(`^${title}$`, 'i') }).locator('xpath=following-sibling::dd[1]').innerText()).trim();
}

/** The phone layout (below 760 px): cards, sheets, the tab bar. */
export const isPhone = (page) => page.viewportSize().width < 760;

/**
 * FilterBar: on a phone the controls sit in a sheet behind "Filters (n)"; this opens it and returns
 * close() ("Show results"). Tablet and desktop show them inline: both are no-ops.
 */
export async function openFilters(page) {
  if (!isPhone(page)) return async () => {};
  await page.getByRole('button', { name: /Filters( \(\d+\))?$/ }).click();
  const sheet = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: 'Show results' }) });
  await expect(sheet).toBeVisible();
  return async () => {
    await sheet.getByRole('button', { name: 'Show results' }).click();
    await expect(sheet).toBeHidden();
  };
}

/** Waits until an antd modal has finished opening (visible, fully opaque): shoot it after this. */
export async function modalReady(page, dialog) {
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate((el) => getComputedStyle(el.closest('.ant-modal') ?? el).opacity)).toBe('1');
}
