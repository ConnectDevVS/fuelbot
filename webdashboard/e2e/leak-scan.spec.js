// SRV-49: platform-only data never reaches a tenant role. Each tenant role walks every page its nav
// offers, a machine's tabs, an order and a product; every JSON response and every page's text is
// scanned. Desktop first for now (DP §0.1 row 3): the phone and tablet pass comes with the mobile work.
import { expect, test } from './fixtures.js';

test.skip(({ viewport }) => viewport.width < 1100, 'desktop first (DP §0.1 row 3)');
test.setTimeout(180_000);

const FORBIDDEN_KEYS = ['maintenance', 'faults', 'status', 'last_seen_ip', 'health', 'dispensing_result', 'dispensing_reason',
  'machine_known', 'received_at', 'extra', 'body_tenant_id', 'body_machine_id', 'telemetry'];
const FORBIDDEN_TEXT = [/HOMING_TIMEOUT/, /BRIDGE_DOWN/, /deadline/, /machine_fault/, /no_response/, /maintenance/i,
  /\b\d{1,3}(\.\d{1,3}){3}\b/, /\bTenants\b/, /\bFaults\b/, /\bTelemetry\b/, /\bAudit\b/, /\bUnregistered\b/, /\bAll users\b/, /\bAll sales\b/];
const PLATFORM_ROUTES = /\/api\/v1\/(telemetry|faults|audit|unregistered)|\/api\/v1\/.*\/maintenance$/;

/** Every key path in a JSON value. */
function keysOf(value, path = '', out = []) {
  if (Array.isArray(value)) value.forEach((v, i) => keysOf(v, `${path}[${i}]`, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.push({ key: k, path: `${path}.${k}` });
      keysOf(v, `${path}.${k}`, out);
    }
  }
  return out;
}

/** Walks the role's pages; returns {bodies: [{url, json}], texts: [{where, text}], requests: [url]}. */
async function walk(page) {
  const bodies = [];
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('response', async (res) => {
    if (!res.url().includes('/api/v1/') || !(res.headers()['content-type'] ?? '').includes('application/json')) return;
    try { bodies.push({ url: res.url(), json: await res.json() }); } catch { /* a body that went away with a navigation */ }
  });
  const texts = [];
  const visit = async (path) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
    texts.push({ where: path, text: await page.locator('body').innerText() });
  };

  await page.goto('');
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  const nav = await page.getByRole('navigation', { name: 'Main' }).getByRole('link').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  const paths = [...new Set(nav.map((h) => h.replace(/^\/dashboard\//, '')))];
  for (const path of paths) await visit(path);

  // A machine's tabs (the first machine this role sees), an order, a product.
  const tid = paths.find((p) => p.startsWith('t/'))?.split('/')[1];
  const fleet = await page.request.get(`/api/v1/fleet?tenant=${tid}`).then((r) => r.json());
  const mid = fleet.items[0]?.id;
  if (mid) {
    await visit(`t/${tid}/machines/${mid}/menu`);
    await expect(page.getByRole('tab').first()).toBeVisible();
    const tabs = await page.getByRole('tab').allInnerTexts();
    for (const tab of tabs) {
      await visit(`t/${tid}/machines/${mid}/${tab.trim().toLowerCase()}`);
    }
  }
  const sales = await page.request.get(`/api/v1/sales?tenant=${tid}&limit=1`).then((r) => r.json());
  if (sales.items?.[0]) await visit(`orders/${sales.items[0].order_id}`);
  const products = await page.request.get(`/api/v1/tenants/${tid}/products`).then((r) => r.json());
  if (products.items?.[0]) {
    await page.goto(`t/${tid}/products?p=${products.items[0].id}`);
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    texts.push({ where: 'product drawer', text: await page.locator('body').innerText() });
  }
  await page.waitForLoadState('networkidle');
  return { bodies, texts, requests };
}

for (const who of ['owner', 'ops', 'desk', 'look', 'boss']) {
  test(`${who}: no platform-only keys, text or requests`, async ({ page, signInAs }) => {
    await signInAs(who);
    const { bodies, texts, requests } = await walk(page);
    expect(bodies.length, 'responses were scanned').toBeGreaterThan(10);

    const keyHits = bodies.flatMap(({ url, json }) => keysOf(json).filter(({ key }) => FORBIDDEN_KEYS.includes(key))
      .map(({ path }) => `${new URL(url).pathname}${path}`));
    expect(keyHits, 'no platform-only keys in tenant responses').toEqual([]);

    const textHits = texts.flatMap(({ where, text }) => FORBIDDEN_TEXT.filter((re) => re.test(text)).map((re) => `${where}: ${re}`));
    expect(textHits, 'no platform-only text on tenant pages').toEqual([]);

    expect(requests.filter((u) => PLATFORM_ROUTES.test(u)), 'no requests to platform-only routes').toEqual([]);

    if (who === 'boss') {
      // globex sees nothing of powerfuel: its machines, its orders, its name.
      const all = JSON.stringify(bodies.map((b) => b.json)) + texts.map((x) => x.text).join('\n');
      for (const needle of ['DEV00001', 'E2E00002', 'E2E00003', 'E2E00004', 'E2E-PF-', 'PowerFuel', 'powerfuel', 'ZZTYPO01']) {
        expect(all.includes(needle), `globex sees "${needle}"`).toBe(false);
      }
    }
  });
}
