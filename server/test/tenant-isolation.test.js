// Tenant isolation (dashboard plan §2.7; SRV-28). The dashboard puts the tenant in its URLs; this
// proves that editing it gives a tenant user nothing. Every /tenants/:tid route (enumerated from
// the router stack, so a new route can't be missed), every method, as each PowerFuel role with
// Globex's ids: 404 not_found, and no document anywhere changes. Each write's body is valid (a
// platform_admin's identical call succeeds afterwards), so the 404 isn't a 400 in disguise.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import { makeSale, makeUser, mockConfig, signIn, startServer } from './helpers.js';
import { Machine, Product, StockEvent } from '../src/models/index.js';
import { importConfig } from '../src/services/catalog.js';
import { issueKey } from '../src/services/keys.js';

/** Every "METHOD /path" of the admin API, from a fresh apiRouter's stack. */
async function enumerateRoutes(settings) {
  // express.Router() returns a function whose prototype is a Router instance: Router.prototype
  // is one level further up. Mount paths aren't kept on the layers, so record them on use().
  const proto = Object.getPrototypeOf(Object.getPrototypeOf(express.Router()));
  assert.equal(typeof proto.use, 'function');
  const mounts = new Map();
  const { use } = proto;
  proto.use = function recordMount(...args) {
    if (typeof args[0] === 'string') mounts.set(this, [...(mounts.get(this) ?? []), [args[0], args.slice(1)]]);
    return use.apply(this, args);
  };
  let root;
  try {
    const { apiRouter } = await import('../src/routes/api.js');
    root = apiRouter(settings);
  } finally {
    proto.use = use;
  }
  const routes = [];
  const walk = (router, prefix) => {
    for (const layer of router.stack) {
      if (!layer.route) continue;
      const path = prefix + (layer.route.path === '/' ? '' : layer.route.path);
      for (const method of Object.keys(layer.route.methods)) routes.push(`${method.toUpperCase()} ${path}`);
    }
    for (const [path, handlers] of mounts.get(router) ?? []) {
      for (const h of handlers) if (Array.isArray(h.stack)) walk(h, prefix + path);
    }
  };
  walk(root, '');
  assert.ok(routes.length > 30, `router enumeration found only ${routes.length} routes`);
  return routes;
}

/** Every document in every collection, as JSON (to prove nothing was written). */
async function snapshot() {
  const out = {};
  for (const [name, model] of Object.entries(mongoose.models)) {
    out[name] = JSON.stringify(await model.find().sort({ _id: 1 }).lean());
  }
  return out;
}

describe('tenant isolation', () => {
  let ctx;
  let routes;
  const as = {};
  const ids = {};

  before(async () => {
    ctx = await startServer();
    routes = await enumerateRoutes(ctx.settings);
    await importConfig({ tenantId: 'powerfuel', tenantName: 'PowerFuel Gym', machineId: 'PFMACH01', config: mockConfig() });
    await importConfig({ tenantId: 'powerfuel', machineId: 'PFMACH02', config: mockConfig() });
    await importConfig({ tenantId: 'globex', tenantName: 'Globex Fitness', machineId: 'GLOBEX01', config: mockConfig() });
    await importConfig({ tenantId: 'globex', machineId: 'GLOBEX02', config: mockConfig() });
    ids.key = String((await issueKey({ _id: 'GLOBEX01', tenant_id: 'globex' }, { label: 'globex' })).doc._id);
    ids.pfKey = String((await issueKey({ _id: 'PFMACH02', tenant_id: 'powerfuel' }, { label: 'pf2' })).doc._id);
    await makeSale({ order_id: 'globex-order', tenant_id: 'globex', machine_id: 'GLOBEX01' });
    await makeSale({ order_id: 'pf2-order', tenant_id: 'powerfuel', machine_id: 'PFMACH02' });
    for (const [tenant, machine] of [['globex', 'GLOBEX01'], ['powerfuel', 'PFMACH02']]) {
      await StockEvent.create({ tenant_id: tenant, machine_id: machine, hopper: 1, product_id: 'guava', kind: 'refill',
        level_g: 2000, note: '', user_email: 'x@x.io' });
    }
    const users = {
      boss: { email: 'boss@globex.example', role: 'tenant_admin', tenant_id: 'globex' },
      ops: { email: 'ops@fuelbot.example', role: 'platform_admin' },
      tenant_admin: { email: 'owner@powerfuel.example', role: 'tenant_admin', tenant_id: 'powerfuel' },
      operator: { email: 'op@powerfuel.example', role: 'operator', tenant_id: 'powerfuel' },
      viewer: { email: 'v@powerfuel.example', role: 'viewer', tenant_id: 'powerfuel' },
      opOne: { email: 'op1@powerfuel.example', role: 'operator', tenant_id: 'powerfuel', machines: ['PFMACH01'] },
    };
    for (const [key, fields] of Object.entries(users)) {
      const user = await makeUser(fields);
      ids[`user_${key}`] = String(user._id);
      as[key] = await signIn(ctx.app, fields.email);
    }
  });
  after(async () => { await ctx.stop(); });

  const menuOf = async (mid) => (await Machine.findById(mid).lean()).menu
    .map(({ product_id, hopper, enabled, sold_out }) => ({ product_id, hopper, enabled, sold_out }));
  const menuVersion = async (mid) => (await Machine.findById(mid).lean()).menu_version;

  /**
   * How to call each /tenants/:tid route: a valid body, and an If-Match read at call time.
   * t = tenant, m = machine, src = a second machine of that tenant, pid = product, kid = key.
   */
  const CALLS = {
    'GET /tenants/:tid': {},
    'PATCH /tenants/:tid': { body: () => ({ name: 'Renamed' }) },
    'GET /tenants/:tid/products': {},
    'POST /tenants/:tid/products': { body: () => ({ product_id: 'sneaky', name: 'Sneaky', actual_price: 50 }) },
    'GET /tenants/:tid/products/:pid': {},
    'PATCH /tenants/:tid/products/:pid': {
      body: () => ({ name: 'Renamed' }),
      ifMatch: async (p) => (await Product.findOne({ tenant_id: p.tid, product_id: p.pid }).lean()).rev,
    },
    'GET /tenants/:tid/machines': {},
    'POST /tenants/:tid/machines': { body: () => ({ name: 'Sneaky' }) },
    'GET /tenants/:tid/machines/:mid': {},
    'PATCH /tenants/:tid/machines/:mid': { body: () => ({ name: 'Renamed' }), ifMatch: (p) => menuVersion(p.mid) },
    'GET /tenants/:tid/machines/:mid/config': {},
    'PUT /tenants/:tid/machines/:mid/bases': {
      body: () => ({ bases: [{ id: 'water', name: 'Water', code: 'B2', enabled: true }] }),
      ifMatch: (p) => menuVersion(p.mid),
    },
    'PUT /tenants/:tid/machines/:mid/maintenance': { body: () => ({ enabled: false }) },
    'PUT /tenants/:tid/machines/:mid/menu': {
      body: async (p) => ({ menu: await menuOf(p.mid) }), ifMatch: (p) => menuVersion(p.mid),
    },
    'PATCH /tenants/:tid/machines/:mid/menu/:pid': { body: () => ({ sold_out: true }), ifMatch: (p) => menuVersion(p.mid) },
    'POST /tenants/:tid/machines/:mid/menu/copy-from/:src': { body: () => ({}), ifMatch: (p) => menuVersion(p.mid) },
    'GET /tenants/:tid/machines/:mid/keys': {},
    'POST /tenants/:tid/machines/:mid/keys': { body: () => ({ label: 'sneaky' }) },
    'DELETE /tenants/:tid/machines/:mid/keys/:kid': {},
    'GET /tenants/:tid/machines/:mid/stock': {},
    'GET /tenants/:tid/machines/:mid/stock/history': {},
    'POST /tenants/:tid/machines/:mid/stock/refills': { body: () => ({ hopper: 1, level_g: 1500 }) },
    'POST /tenants/:tid/machines/:mid/stock/adjustments': { body: () => ({ hopper: 1, level_g: 1400 }) },
  };

  const tenantRoutes = () => routes.filter((r) => r.split(' ')[1].startsWith('/tenants/:tid'));
  const fill = (path, p) => path.replace(/:(\w+)/g, (_, k) => p[k]);

  async function call(agent, route, p) {
    const [method, path] = route.split(' ');
    const spec = CALLS[route];
    const url = `/api/v1${fill(path, p)}`;
    const body = spec.body ? await spec.body(p) : undefined;
    if (method === 'GET') return agent.get(url);
    const version = spec.ifMatch ? await spec.ifMatch(p) : undefined;
    return agent.raw(method, url, body, version);
  }

  // signIn()'s agent without If-Match support: wrap the few verbs with a header when needed.
  before(() => {
    for (const agent of Object.values(as)) {
      agent.raw = (method, url, body, version) => {
        const req = agent[method.toLowerCase()](url, body);
        return version === undefined ? req : req.set('If-Match', String(version));
      };
    }
  });

  const GLOBEX = () => ({ tid: 'globex', mid: 'GLOBEX01', src: 'GLOBEX02', pid: 'guava', kid: ids.key });

  it('every tenant route is 404 for another tenant\'s users, for every method', async () => {
    const found = tenantRoutes();
    const uncovered = found.filter((r) => !CALLS[r]);
    assert.deepEqual(uncovered, [], 'a /tenants/:tid route the sweep doesn\'t cover: add it to CALLS');
    const stale = Object.keys(CALLS).filter((r) => !found.includes(r));
    assert.deepEqual(stale, [], 'CALLS lists a route the API no longer has');

    const before = await snapshot();
    for (const route of found) {
      for (const role of ['tenant_admin', 'operator', 'viewer']) {
        const res = await call(as[role], route, GLOBEX());
        assert.equal(res.status, 404, `${role} ${route}: ${res.status} ${JSON.stringify(res.body)}`);
        assert.equal(res.body.error, 'not_found', `${role} ${route}`);
      }
    }
    assert.deepEqual(await snapshot(), before, 'a globex (or any) document changed');

    // The same calls are valid: staff may make them (writes last, in order, with fresh versions).
    const ordered = [...found].sort((a, b) => (a.startsWith('DELETE') ? 1 : 0) - (b.startsWith('DELETE') ? 1 : 0));
    for (const route of ordered) {
      const res = await call(as.ops, route, GLOBEX());
      assert.ok(res.status >= 200 && res.status < 300, `platform ${route}: ${res.status} ${JSON.stringify(res.body)}`);
    }
  });

  it('record routes ignore another tenant\'s filter', async () => {
    const before = await snapshot();
    for (const role of ['tenant_admin', 'operator', 'viewer']) {
      for (const url of ['/sales?tenant=globex', '/sales/summary?tenant=globex', '/sales/export.csv?tenant=globex',
        '/sales?tenant=globex&machine=GLOBEX01', '/fleet?tenant=globex', '/stock?tenant=globex',
        '/orders/globex-order']) {
        const res = await as[role].get(`/api/v1${url}`);
        assert.equal(res.status, 404, `${role} ${url}: ${res.status}`);
      }
      // Without a filter, nothing of Globex's appears either.
      const sales = await as[role].get('/api/v1/sales');
      assert.ok(!sales.body.items.some((s) => s.order_id === 'globex-order'), role);
      const csv = await as[role].get('/api/v1/sales/export.csv');
      assert.ok(!csv.text.includes('GLOBEX'), role);
    }
    const patch = await as.tenant_admin.patch(`/api/v1/users/${ids.user_boss}`, { name: 'Renamed' });
    assert.equal(patch.status, 404);
    const reset = await as.tenant_admin.post(`/api/v1/users/${ids.user_boss}/password`, { password: 'another long secret' });
    assert.equal(reset.status, 404);
    for (const role of ['operator', 'viewer']) {   // they can't manage users at all: 403 before any lookup
      assert.equal((await as[role].patch(`/api/v1/users/${ids.user_boss}`, { name: 'Renamed' })).status, 403, role);
    }
    assert.deepEqual(await snapshot(), before);
  });

  it('a limited operator can\'t reach another machine', async () => {
    const before = await snapshot();
    const other = { tid: 'powerfuel', mid: 'PFMACH02', src: 'PFMACH01', pid: 'guava', kid: ids.pfKey };
    const machineRoutes = tenantRoutes().filter((r) => r.includes('/machines/:mid'));
    assert.ok(machineRoutes.length > 10);
    for (const route of machineRoutes) {
      const res = await call(as.opOne, route, other);
      assert.equal(res.status, 404, `${route}: ${res.status} ${JSON.stringify(res.body)}`);
    }
    for (const url of ['/sales?machine=PFMACH02', '/orders/pf2-order']) {
      assert.equal((await as.opOne.get(`/api/v1${url}`)).status, 404, url);
    }
    const fleet = await as.opOne.get('/api/v1/fleet?tenant=powerfuel');
    assert.deepEqual(fleet.body.items.map((m) => m.id), ['PFMACH01']);
    const stock = await as.opOne.get('/api/v1/stock?tenant=powerfuel&state=ok,low,empty,unknown,refill_needed,not_estimated');
    assert.ok(stock.body.items.every((r) => r.machine_id === 'PFMACH01'));
    assert.deepEqual(await snapshot(), before);
  });
});
