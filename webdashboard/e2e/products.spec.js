// SRV-45: Products (library, drawer, create, archive, portion size). All three widths.
// Specs that write reset.
import { CSRF, expect, isPhone, resetData, test } from './fixtures.js';

const API = '/api/v1/tenants/powerfuel/products';
const drawer = (page) => page.getByRole('dialog');

/**
 * A drawer shot: wait for the slide-in (its right edge at the window's; on a phone, the bottom
 * sheet's lower edge at the window's bottom), scrolled to the top.
 */
async function drawerShot(page, shot, name) {
  const phone = isPhone(page);
  await expect.poll(async () => {
    const box = await page.locator('.ant-drawer-content-wrapper').boundingBox();
    if (!box) return -1;
    return Math.round(phone ? box.y + box.height : box.x + box.width);
  }).toBe(phone ? page.viewportSize().height : page.viewportSize().width);
  await page.locator('.ant-drawer-body').evaluate((el) => { el.scrollTop = 0; });
  await page.mouse.move(1, 1);
  await shot(name, { fullPage: false });
}
const product = async (page, id) => (await page.request.get(`${API}/${id}`).then((r) => r.json())).product;

async function openProduct(page, id) {
  await page.goto(`t/powerfuel/products?p=${id}`);
  await expect(drawer(page)).toBeVisible();
  await expect(drawer(page).getByLabel('Name', { exact: true })).not.toHaveValue('');
}

/** Save and return the PATCH's request. */
async function save(page) {
  const [req] = await Promise.all([
    page.waitForRequest((r) => r.method() === 'PATCH' && r.url().includes('/products/')),
    drawer(page).getByRole('button', { name: 'Save product' }).click(),
  ]);
  return req;
}

test('library lists the products with price, portion and machines', async ({ page, signInAs, shot }) => {
  await signInAs('owner');
  await page.goto('t/powerfuel/products');
  const guava = page.locator('main [data-row]').filter({ hasText: 'guava' });
  await expect(guava).toContainText('Prymor Guava');
  await expect(guava).toContainText('₹75');
  await expect(guava).toContainText('32.5 g');
  await expect(page.locator('main [data-row]').filter({ hasText: 'vanilla' })).toContainText('not set');
  await page.getByRole('textbox', { name: 'Search name or id' }).fill('choc');
  await expect(page.locator('main [data-row]')).toHaveCount(1);
  await page.getByRole('textbox', { name: 'Search name or id' }).fill('');
  await page.mouse.move(1, 1);
  await shot('products');
  await guava.getByRole('link').click();
  await expect(page).toHaveURL(/\/products\?p=guava$/);
  await expect(drawer(page)).toContainText('On machines');
  await expect(drawer(page)).toContainText('Bay 02');
});

test('owner edits a price and portion size; the config preview shows the price', async ({ page, request, signInAs, shot }) => {
  await signInAs('owner');
  try {
    const before = await product(page, 'guava');
    await openProduct(page, 'guava');
    await drawer(page).getByRole('spinbutton', { name: 'Price', exact: true }).fill('95');
    await drawer(page).getByRole('spinbutton', { name: 'Offer price' }).fill('');
    await drawer(page).getByLabel('Portion size (g)').fill('33');
    await expect(drawer(page)).toContainText('Changes reach every machine using it at its next restart.');
    await drawerShot(page, shot, 'product-owner');
    const req = await save(page);
    expect(req.headers()['if-match']).toBe(String(before.rev));
    expect(req.postDataJSON()).toMatchObject({ actual_price: 95, offer_price: null, portion_g: 33 });
    await expect(page.getByText(/^Product saved/)).toBeVisible();
    const config = await page.request.get('/api/v1/tenants/powerfuel/machines/DEV00001/config').then((r) => r.json());
    expect(config.config.flavors.find((f) => f.id === 'guava')).toMatchObject({ actual_price: 95 });
    expect((await product(page, 'guava')).portion_g).toBe(33);
  } finally {
    await resetData(request);
  }
});

test('operator with all machines edits the description; prices and portion are locked; the request carries unchanged prices', async ({ page, request, signInAs, shot }) => {
  await signInAs('ops');
  try {
    const before = await product(page, 'guava');
    await openProduct(page, 'guava');
    await expect(drawer(page).getByRole('spinbutton', { name: 'Price', exact: true })).toHaveCount(0);   // locked text
    await expect(drawer(page).getByLabel(/Only tenant admins change prices/)).toHaveCount(2);   // price and offer
    await expect(drawer(page).getByLabel('Portion size (g)')).toBeDisabled();
    await drawer(page).getByLabel('Description').fill('Now with more guava.');
    await drawerShot(page, shot, 'product-operator');
    const req = await save(page);
    const body = req.postDataJSON();
    expect(body).toMatchObject({ description: 'Now with more guava.', actual_price: before.actual_price,
      offer_price: before.offer_price, portion_g: before.portion_g });
    await expect(page.getByText(/^Product saved/)).toBeVisible();
    expect((await product(page, 'guava')).description).toBe('Now with more guava.');
  } finally {
    await resetData(request);
  }
});

test('limited operator and viewer see a read-only drawer', async ({ page, signInAs, shot }) => {
  for (const who of ['desk', 'look']) {
    await signInAs(who);
    await openProduct(page, 'guava');
    await expect(drawer(page).getByRole('button', { name: 'Save product' }), who).toHaveCount(0);
    await expect(drawer(page).getByLabel('Name', { exact: true }), who).toBeDisabled();
    const note = drawer(page).getByText('Products are shared by every machine; editing needs access to all machines.');
    await expect(note, who).toHaveCount(who === 'desk' ? 1 : 0);
    if (who === 'look') {
      await drawerShot(page, shot, 'product-viewer');
    }
  }
});

test("create a product; a duplicate id → 'That id is taken'", async ({ page, request, signInAs, shot }) => {
  await signInAs('owner');
  try {
    await page.goto('t/powerfuel/products');
    await page.getByRole('button', { name: 'New product' }).click();
    await expect(page).toHaveURL(/\?new=1$/);
    const d = drawer(page);
    await d.getByLabel('Product id').fill('guava');
    await d.getByLabel('Name', { exact: true }).fill('Another guava');
    await d.getByRole('spinbutton', { name: 'Price', exact: true }).fill('80');
    await d.getByRole('button', { name: 'Create product' }).click();
    await expect(d.locator('.ant-form-item-explain-error').filter({ hasText: 'That id is taken' })).toBeVisible();
    await drawerShot(page, shot, 'product-create');
    await d.getByLabel('Product id').fill('mango');
    await d.getByLabel('Name', { exact: true }).fill('Alphonso Mango');
    await d.getByRole('combobox', { name: 'Allergens' }).fill('Milk');
    await page.keyboard.press('Enter');
    const [req] = await Promise.all([page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/products')),
      d.getByRole('button', { name: 'Create product' }).click()]);
    expect(req.postDataJSON()).toMatchObject({ product_id: 'mango', name: 'Alphonso Mango', actual_price: 80, allergens: ['Milk'] });
    await expect(page.getByText('Product Alphonso Mango created')).toBeVisible();
    await expect(page).toHaveURL(/\?p=mango$/);
    await expect(page.locator('main [data-row]').filter({ hasText: 'mango' })).toContainText('Alphonso Mango');
  } finally {
    await resetData(request);
  }
});

test('archive a product on a menu → the product_in_use message names the machines; archive an unused one → hidden unless Show archived', async ({ page, request, signInAs }) => {
  await signInAs('owner');
  try {
    await openProduct(page, 'guava');
    await drawer(page).getByRole('button', { name: 'Archive' }).click();
    await expect(drawer(page).getByRole('alert')).toContainText("Remove it from these machines' menus first:");
    await expect(drawer(page).getByRole('alert')).toContainText('Bay 02');
    // An unused product: create one through the API, then archive it in the UI.
    const made = await page.request.post(API, { headers: CSRF, data: { product_id: 'kiwi', name: 'Kiwi', actual_price: 50 } });
    expect(made.status()).toBe(201);
    await openProduct(page, 'kiwi');
    await drawer(page).getByRole('button', { name: 'Archive' }).click();
    await expect(page.getByText('Kiwi archived')).toBeVisible();
    await drawer(page).getByRole('button', { name: 'Close' }).click();
    await expect(page.locator('main [data-row]').filter({ hasText: 'kiwi' })).toHaveCount(0);
    await page.getByRole('checkbox', { name: 'Show archived' }).check();
    await expect(page.locator('main [data-row]').filter({ hasText: 'kiwi' })).toContainText('Archived');
  } finally {
    await resetData(request);
  }
});

test('conflict on rev opens the Conflict dialog', async ({ page, request, signInAs, shot }) => {
  await signInAs('owner');
  try {
    const before = await product(page, 'chocolate');
    await openProduct(page, 'chocolate');
    const other = await page.request.patch(`${API}/chocolate`, { headers: { ...CSRF, 'If-Match': String(before.rev) }, data: { name: 'MMN Choco (theirs)' } });
    expect(other.status()).toBe(200);
    await drawer(page).getByLabel('Description').fill('Mine');
    await save(page);
    const dialog = page.getByRole('dialog').filter({ hasText: 'Someone else changed this since you opened it.' });
    await expect(dialog).toContainText('MMN Choco (theirs)');
    await expect.poll(() => dialog.evaluate((el) => getComputedStyle(el.closest('.ant-modal') ?? el).opacity)).toBe('1');
    await drawerShot(page, shot, 'product-conflict');
    await dialog.getByRole('button', { name: 'Keep my changes' }).click();
    await expect(page.getByText(/^Product saved/)).toBeVisible();
    const after = await product(page, 'chocolate');
    expect(after).toMatchObject({ name: 'MMN Choco (theirs)', description: 'Mine', rev: before.rev + 2 });
  } finally {
    await resetData(request);
  }
});

test('a change that breaks a machine shows the 422 panel', async ({ page, request, signInAs, shot }) => {
  await signInAs('owner');
  const before = await product(page, 'guava');
  expect(before.image_url).toBeNull();   // the seed has bundled images only
  await openProduct(page, 'guava');
  await drawer(page).getByLabel('Bundled image path').fill('');
  await save(page);
  const panel = drawer(page).getByRole('alert').filter({ hasText: 'Nothing was saved.' });
  await expect(panel).toContainText('The machine would reject this');
  await expect(panel).toContainText('Bay 02');
  await expect(panel).toContainText('guava:');
  expect((await product(page, 'guava')).rev).toBe(before.rev);
  await drawerShot(page, shot, 'product-422');
  await resetData(request);
});
