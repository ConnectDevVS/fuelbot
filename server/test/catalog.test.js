import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mockConfig, startServer } from './helpers.js';
import { Machine, Product, Tenant } from '../src/models/index.js';
import { importConfig, machineConfig } from '../src/services/catalog.js';
import { CatalogError } from '../src/errors.js';
import { isoNoMs } from '../src/catalog/build.js';

const withoutVersion = ({ version, ...rest }) => rest;

async function importMock(name = 'default', machineId = 'machine-042') {
  return importConfig({ tenantId: 'powerfuel', tenantName: 'PowerFuel Gym', machineId, config: mockConfig(name) });
}

describe('catalog: import, build, validate', () => {
  let ctx;
  before(async () => { ctx = await startServer(); });
  after(async () => { await ctx.stop(); });
  beforeEach(async () => { await ctx.reset(); });

  it('round-trips the mock default config exactly (contract test 1)', async () => {
    const { machine } = await importMock();
    const config = await machineConfig(machine);
    assert.deepEqual(withoutVersion(config), withoutVersion(mockConfig('default')));
    assert.equal(await Product.countDocuments(), 6);
    assert.equal((await Tenant.findById('powerfuel')).branding.display_name, 'PowerFuel Gym');
  });

  it('emits dates without milliseconds (the app rejects them)', async () => {
    const { machine } = await importMock('maintenance_on');
    const config = await machineConfig(machine);
    assert.equal(config.maintenance.flagged_at, '2026-09-24T00:41:00Z');
    assert.deepEqual(withoutVersion(config), withoutVersion(mockConfig('maintenance_on')));
    assert.equal(isoNoMs(null), null);
  });

  it('refuses the invalid scenario with the app\'s text (contract test 2)', async () => {
    await assert.rejects(importMock('invalid_duplicate_hopper'), (err) => {
      assert.ok(err instanceof CatalogError);
      assert.equal(err.status, 422);
      assert.deepEqual(err.details, [{ machine_id: 'machine-042',
        errors: ['chocolate: hopper 1 already used by guava'] }]);
      return true;
    });
    assert.equal(await Machine.countDocuments(), 0);
  });

  it('re-import updates in place and bumps the version', async () => {
    const first = await machineConfig((await importMock()).machine);
    const second = await machineConfig((await importMock('price_change')).machine);
    assert.equal(await Product.countDocuments(), 6);
    assert.equal(await Machine.countDocuments(), 1);
    assert.ok(second.version > first.version);
    assert.deepEqual(withoutVersion(second), withoutVersion(mockConfig('price_change')));
  });

  it('a menu price override wins over the product defaults; machine phone over tenant phone', async () => {
    await importMock();
    const machine = await Machine.findById('machine-042');
    machine.menu[0].price = { actual_price: 99, offer_price: null };
    machine.support_phone = '080 1234';
    await machine.save();
    const config = await machineConfig(machine);
    assert.equal(config.flavors[0].actual_price, 99);
    assert.equal(config.flavors[0].offer_price, null);
    assert.equal(config.flavors[1].actual_price, 180);   // untouched item: product default
    assert.equal(config.tenant.support_phone, '080 1234');
  });

  it('the Machine hook refuses a save the app would reject', async () => {
    await importMock();
    const machine = await Machine.findById('machine-042');
    machine.menu[1].hopper = 1;   // chocolate onto guava's hopper
    await assert.rejects(machine.save(), (err) => {
      assert.deepEqual(err.details[0].errors, ['chocolate: hopper 1 already used by guava']);
      return true;
    });
  });

  it('a menu item whose product is missing is reported, not hidden', async () => {
    await importMock();
    const machine = await Machine.findById('machine-042');
    machine.menu.push({ product_id: 'ghost', hopper: 1, enabled: false });
    await assert.rejects(machine.save(), (err) => {
      assert.ok(err.details[0].errors.includes('ghost: name missing'));
      return true;
    });
  });

  it('a product change is checked against every machine using it, naming the broken one', async () => {
    await importMock('default', 'machine-042');
    await importMock('default', 'machine-043');
    const other = await Machine.findById('machine-043');
    other.menu[0].price = { actual_price: 80, offer_price: null };   // guava priced on the machine
    await other.save();

    const guava = await Product.findOne({ tenant_id: 'powerfuel', product_id: 'guava' });
    guava.actual_price = 0;
    guava.offer_price = null;
    await assert.rejects(guava.save(), (err) => {
      assert.deepEqual(err.details, [{ machine_id: 'machine-042', errors: ['guava: actual_price must be > 0'] }]);
      return true;
    });
  });

  it('strict schemas drop nothing silently: unknown paths are not stored', async () => {
    await importMock();
    await Machine.updateOne({ _id: 'machine-042' }, { $set: { surprise: 1 } });
    const raw = await Machine.collection.findOne({ _id: 'machine-042' });
    assert.equal(raw.surprise, undefined);
  });
});
