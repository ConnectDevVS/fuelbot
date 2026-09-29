// SRV-49: every active role walks every page its navigation offers, plus a machine's tabs, with a
// screenshot per page (.screenshots/<project>-walk-<role>-<page>.png). The harness guard fails on
// any CSP violation, page error or horizontal overflow. Desktop first for now (DP §0.1 row 3): the
// phone and tablet pass comes with the mobile work.
import { expect, test } from './fixtures.js';

test.skip(({ viewport }) => viewport.width < 1100, 'desktop first (DP §0.1 row 3)');
test.setTimeout(240_000);

const slug = (path) => path.replace(/^\/?dashboard\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'landing';

for (const who of ['staff', 'owner', 'ops', 'desk', 'look', 'boss']) {
  test(`${who} walks every page`, async ({ page, signInAs, shot }) => {
    await signInAs(who);
    await page.goto('');
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
    const nav = await page.getByRole('navigation', { name: 'Main' }).getByRole('link')
      .evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    const paths = [...new Set(nav.map((h) => h.replace(/^\/dashboard\//, '')))];
    // Staff: also a tenant's pages (their nav shows them once a tenant is picked).
    if (who === 'staff') paths.push('t/powerfuel/home', 't/powerfuel/sales', 't/powerfuel/stock', 't/powerfuel/machines', 't/powerfuel/products');
    const tid = who === 'boss' ? 'globex' : 'powerfuel';
    const mid = who === 'boss' ? 'E2E00005' : 'DEV00001';
    const visited = [];
    const visit = async (path) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 }), path).toBeVisible();
      await expect(page.getByText('Not available'), path).toHaveCount(0);
      await expect(page.locator('main [aria-busy="true"]'), path).toHaveCount(0);
      await page.mouse.move(1, 1);
      await shot(`walk-${who}-${slug(path)}`);
      visited.push(path);
    };
    for (const path of paths) await visit(path);
    await page.goto(`t/${tid}/machines/${mid}/menu`);
    await expect(page.getByRole('tab').first()).toBeVisible();   // the page is lazy: wait for its tab bar
    const tabs = (await page.getByRole('tab').allInnerTexts()).map((x) => x.trim().toLowerCase());
    expect(tabs.length).toBeGreaterThan(0);
    for (const tab of tabs) await visit(`t/${tid}/machines/${mid}/${tab}`);
    test.info().annotations.push({ type: 'pages', description: `${who}: ${visited.length} pages` });
    console.log(`[walk] ${who}: ${visited.length} pages`);
  });
}
