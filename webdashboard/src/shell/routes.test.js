import { describe, expect, it } from 'vitest';
import { matchRoutes } from 'react-router';
import { routes } from './routes.jsx';
import { hrefOf, navFor, PAGES } from './pages.js';

// Permissions per role, as /auth/me reports them (server rbac.js).
const COMPLAINTS = ['complaints:comment', 'complaints:raise', 'complaints:reopen'];
const TENANT_ADMIN = ['catalog:read', 'keys:manage', 'machines:manage', 'machines:read', 'menu:edit', 'price:write',
  'products:create', 'products:edit', 'sales:read', 'stock:write', 'tenant:edit', 'tenant:read', 'users:manage',
  ...COMPLAINTS, 'complaints:read_all'];
// Staff hold every tenant_admin permission except raising and reopening complaints (server TENANT_ONLY).
const PLATFORM = [...TENANT_ADMIN.filter((p) => !['complaints:raise', 'complaints:reopen'].includes(p)), 'audit:read',
  'faults:read', 'maintenance:read', 'maintenance:write', 'telemetry:read', 'tenants:create', 'tenants:disable',
  'unregistered:read', 'complaints:status'];
const OPERATOR = ['catalog:read', 'machines:read', 'menu:edit', 'products:edit', 'sales:read', 'tenant:read', ...COMPLAINTS];
const VIEWER = ['catalog:read', 'machines:read', 'sales:read', 'tenant:read', ...COMPLAINTS];
const canOf = (perms) => (p) => perms.includes(p);
const ids = (items) => items.map((i) => i.page.id);

describe('routes', () => {
  it('every route declares a permission or null', () => {
    const known = new Set([...PLATFORM, ...TENANT_ADMIN]);
    for (const page of PAGES) {
      expect(page, page.id).toHaveProperty('needs');
      const needs = page.needs === null ? [] : [].concat(page.needs);
      for (const p of needs) expect(known.has(p), `${page.id}: ${p}`).toBe(true);
      expect(page.title, page.id).toMatch(/^page\./);
    }
    expect(new Set(PAGES.map((p) => p.id)).size).toBe(PAGES.length);
  });

  it("every nav item's route exists", () => {
    for (const page of PAGES.filter((p) => p.nav)) {
      const href = hrefOf(page, 'powerfuel');
      const match = matchRoutes(routes, href)?.at(-1);
      expect(match?.route.handle?.page.id, href).toBe(page.id);
    }
    // Deep links: a machine tab, register, an order; anything else is Not found.
    const at = (path) => matchRoutes(routes, path)?.at(-1).route.handle?.page.id;
    expect(at('/t/powerfuel/machines/DEV00001/stock')).toBe('machine');
    expect(at('/t/powerfuel/machines/DEV00001')).toBe('machine');
    expect(at('/t/powerfuel/machines/new')).toBe('machine-new');
    expect(at('/orders/o-1')).toBe('order');
    expect(at('/t/powerfuel/complaints/12')).toBe('complaint');
    expect(matchRoutes(routes, '/nope')?.at(-1).route.path).toBe('*');
  });

  it('nav per role (DP §3.1)', () => {
    const tenant = (perms) => navFor({ can: canOf(perms), tid: 'powerfuel', staff: false });
    expect(ids(tenant(TENANT_ADMIN).main)).toEqual(['home', 'sales', 'stock', 'machines', 'products', 'users', 'company', 'complaints']);
    expect(tenant(TENANT_ADMIN).platform).toEqual([]);
    for (const perms of [OPERATOR, VIEWER]) {
      expect(ids(tenant(perms).main)).toEqual(['home', 'sales', 'stock', 'machines', 'products', 'complaints']);
    }
    expect(ids(tenant(VIEWER).tabs)).toEqual(['home', 'sales', 'stock', 'machines']);

    const inTenant = navFor({ can: canOf(PLATFORM), tid: 'powerfuel', staff: true });
    expect(ids(inTenant.main)).toEqual(['fleet', 'home', 'sales', 'stock', 'machines', 'products', 'users', 'company', 'complaints']);
    expect(ids(inTenant.platform)).toEqual(['tenants', 'faults', 'telemetry', 'audit', 'unregistered', 'users-all', 'sales-all',
      'complaints-all']);
    expect(ids(inTenant.tabs)).toEqual(['fleet', 'sales', 'stock', 'machines']);

    const all = navFor({ can: canOf(PLATFORM), tid: null, staff: true });
    expect(ids(all.main)).toEqual(['fleet']);
    expect(ids(all.tabs)).toEqual(['fleet', 'sales-all', 'tenants', 'faults']);
    expect(ids(all.more)).toEqual(['telemetry', 'audit', 'unregistered', 'users-all', 'complaints-all']);
    expect(inTenant.main.find((i) => i.page.id === 'home').href).toBe('/t/powerfuel/home');
  });
});
