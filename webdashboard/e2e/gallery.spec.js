// SRV-34: the shared components, in the production build (?gallery, staff), under the CSP guard.
import { expect, test } from './fixtures.js';

test.beforeEach(async ({ page, signInAs }) => {
  await signInAs('staff');
  await page.goto('_gallery?gallery');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/gallery/i);
});

test('gallery renders every component with no CSP violation', async ({ page, shot }) => {
  for (const text of ['Fault', 'Maintenance', 'Out of service', 'Not configured', 'Refill needed', 'Not estimated',
    'Not dispensed', 'timeout · deadline', '₹1,23,456', '28 Sep 2026, 12:42 IST', '4 min ago', 'never']) {
    await expect(page.getByText(text, { exact: true }).first()).toBeVisible();
  }
  await expect(page.getByText('HOMING_TIMEOUT since 09:12 IST')).toBeVisible();
  await shot('gallery');

  // Tooltip (the full time behind a relative one).
  await page.getByText('4 min ago').hover();
  await expect(page.getByRole('tooltip')).toContainText('28 Sep 2026, 12:38 IST');
  await page.mouse.move(0, 0);   // close it (a touch "hover" keeps it open)
  await page.getByRole('heading', { level: 1 }).click();
  await expect(page.getByRole('tooltip')).toBeHidden();

  // Toast.
  await page.getByRole('button', { name: 'Show toast' }).click();
  await expect(page.getByText('Menu saved. Reaches Bay 02 at its next restart')).toBeVisible();

  // Confirm dialog: the consequence, a red button repeating the verb; cancel resolves false.
  await page.getByRole('button', { name: 'Open confirm' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('The machine using key SU8B… will be refused until it has a valid key.');
  const revoke = dialog.getByRole('button', { name: 'Revoke key' });
  await expect(revoke).toHaveClass(/ant-btn-dangerous/);
  // antd zooms the modal in: wait until it's fully shown before the shot.
  await expect.poll(() => page.locator('.ant-modal').evaluate((el) => {
    const style = getComputedStyle(el);
    return style.opacity === '1' && (style.transform === 'none' || style.transform === 'matrix(1, 0, 0, 1, 0, 0)');
  })).toBe(true);
  await shot('gallery-confirm', { fullPage: false });
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('Confirmed: false')).toBeVisible();

  // Sheet: right on tablet/desktop, bottom on phone.
  await page.getByRole('button', { name: 'Open sheet' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText('Record refill');
  // Wait for it to finish sliding in, then check which edge it's on.
  const viewport = page.viewportSize();
  const edge = async () => {
    const box = await page.locator('.ant-drawer-content-wrapper').boundingBox();
    return viewport.width < 760 ? Math.round(box.y + box.height) : Math.round(box.x + box.width);
  };
  await expect.poll(edge).toBe(viewport.width < 760 ? viewport.height : viewport.width);
  await shot('gallery-sheet', { fullPage: false });
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.ant-drawer-open')).toHaveCount(0);

  // Copy puts the canonical value on the clipboard (not the spaced display).
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy machine_id.txt' }).click();
  await expect(page.getByRole('button', { name: 'Copy machine_id.txt' })).toHaveText(/Copied/);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('SHC816DJ');
});

test('confirm dialog traps focus and closes on Escape', async ({ page }) => {
  await page.getByRole('button', { name: 'Open confirm' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  // antd locks focus on focusin: Tab past the last button leaves the page for the browser's own UI
  // (document.body is active), and the next Tab back in is pulled into the dialog. Page content
  // behind the modal must never get focus.
  const seen = [];
  for (let i = 0; i < 8; i += 1) {
    await page.keyboard.press('Tab');
    seen.push(await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return 'outside-page';
      return el.closest('.ant-modal') ? 'modal' : `page:${el.tagName}.${el.className}`;
    }));
  }
  expect(seen.filter((s) => s.startsWith('page:')), seen.join(', ')).toEqual([]);
  expect(seen.filter((s) => s === 'modal').length).toBeGreaterThan(3);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Confirmed: false')).toBeVisible();
});

test('the gallery is hidden from tenant users and without ?gallery', async ({ page, signInAs }) => {
  await page.goto('_gallery');
  await expect(page.getByText("Not found, or you don't have access")).toBeVisible();
  await signInAs('owner');
  await page.goto('_gallery?gallery');
  await expect(page.getByText("Not found, or you don't have access")).toBeVisible();
});
