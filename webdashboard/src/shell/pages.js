// The URL map (dashboard plan §3.3) as data: every page, the permission(s) it needs (all of them,
// or null), its title, and where it sits in the navigation (§3.1). routes.jsx builds the router
// from it; the nav reads it (nav.needs: an extra permission for the nav item only). Pages a later story builds say which (`story`).
export const PAGES = [
  // Staff pages (no tenant in the URL).
  { id: 'fleet', path: '/fleet', needs: 'telemetry:read', title: 'page.fleet', story: 'SRV-36', nav: { group: 'global', icon: 'fleet' } },
  { id: 'tenants', path: '/tenants', needs: 'tenants:create', title: 'page.tenants', story: 'SRV-47', nav: { group: 'platform', icon: 'tenants' } },
  { id: 'faults', path: '/faults', needs: 'faults:read', title: 'page.faults', story: 'SRV-48', nav: { group: 'platform', icon: 'faults' } },
  { id: 'telemetry', path: '/telemetry', needs: 'telemetry:read', title: 'page.telemetry', story: 'SRV-48', nav: { group: 'platform', icon: 'telemetry' } },
  { id: 'audit', path: '/audit', needs: 'audit:read', title: 'page.audit', story: 'SRV-48', nav: { group: 'platform', icon: 'audit' } },
  { id: 'unregistered', path: '/unregistered', needs: 'unregistered:read', title: 'page.unregistered', story: 'SRV-48', nav: { group: 'platform', icon: 'unregistered' } },
  { id: 'users-all', path: '/users', needs: ['telemetry:read', 'users:manage'], title: 'page.usersAll', story: 'SRV-46', nav: { group: 'platform', icon: 'users' } },
  { id: 'sales-all', path: '/sales', needs: 'telemetry:read', title: 'page.salesAll', story: 'SRV-39', nav: { group: 'platform', icon: 'salesAll' } },
  { id: 'order', path: '/orders/:orderId', needs: 'sales:read', title: 'page.order', story: 'SRV-40', nav: null },

  // Tenant pages (/t/:tid/…).
  { id: 'home', path: '/t/:tid/home', needs: 'machines:read', title: 'page.home', story: 'SRV-38', nav: { group: 'tenant', icon: 'home' } },
  { id: 'sales', path: '/t/:tid/sales', needs: 'sales:read', title: 'page.sales', story: 'SRV-39', nav: { group: 'tenant', icon: 'sales' } },
  { id: 'stock', path: '/t/:tid/stock', needs: 'machines:read', title: 'page.stock', story: 'SRV-41', nav: { group: 'tenant', icon: 'stock' } },
  { id: 'machines', path: '/t/:tid/machines', needs: 'machines:read', title: 'page.machines', story: 'SRV-42', nav: { group: 'tenant', icon: 'machines' } },
  { id: 'machine-new', path: '/t/:tid/machines/new', needs: 'machines:manage', title: 'page.machineNew', story: 'SRV-42', nav: null },
  { id: 'machine', path: '/t/:tid/machines/:mid/:tab?', needs: 'machines:read', title: 'page.machine', story: 'SRV-41', nav: null },
  { id: 'products', path: '/t/:tid/products', needs: 'catalog:read', title: 'page.products', story: 'SRV-45', nav: { group: 'tenant', icon: 'products' } },
  { id: 'users', path: '/t/:tid/users', needs: 'users:manage', title: 'page.users', story: 'SRV-46', nav: { group: 'tenant', icon: 'users' } },
  { id: 'company', path: '/t/:tid/company', needs: 'tenant:read', title: 'page.company', story: 'SRV-46',
    // The page reads for every member (tenant:read); the nav shows it to editors only (DP §3.1).
    nav: { group: 'tenant', icon: 'company', needs: 'tenant:edit' } },
];

export const PAGE_BY_ID = Object.fromEntries(PAGES.map((p) => [p.id, p]));

/** True when `can` allows every permission the page needs. */
export function allowed(page, can) {
  if (!page.needs) return true;
  return (Array.isArray(page.needs) ? page.needs : [page.needs]).every((p) => can(p));
}

/** A page's link: its path with :tid filled and optional segments dropped. */
export function hrefOf(page, tid) {
  return page.path.replace(':tid', encodeURIComponent(tid ?? '')).replace(/\/:\w+\?/g, '');
}

// Bottom tab bar (phone, DP §2.9): four pages + More. Tenant users: Home, Sales, Stock, Machines;
// staff in a tenant: Fleet, Sales, Stock, Machines; staff with "All tenants": the first four they can open.
const TABS = {
  tenantUser: ['home', 'sales', 'stock', 'machines'],
  staffInTenant: ['fleet', 'sales', 'stock', 'machines'],
  staffAll: ['fleet', 'sales-all', 'tenants', 'faults', 'users-all'],
};

/**
 * What the navigation shows: {main, platform, tabs, more}, each a list of {page, href}.
 * tid is the tenant in the URL (or the tenant user's own); staff without one see the global pages.
 */
export function navFor({ can, tid, staff }) {
  const visible = PAGES.filter((p) => p.nav && allowed(p, can) && (!p.nav.needs || can(p.nav.needs)));
  const withTenant = (p) => p.nav.group !== 'tenant' || Boolean(tid);
  const item = (p) => ({ page: p, href: hrefOf(p, tid) });
  const main = visible.filter((p) => p.nav.group !== 'platform' && withTenant(p)).map(item);
  const platform = visible.filter((p) => p.nav.group === 'platform').map(item);
  const all = [...main, ...platform];
  const order = !staff ? TABS.tenantUser : tid ? TABS.staffInTenant : TABS.staffAll;
  const tabs = order.map((id) => all.find((i) => i.page.id === id)).filter(Boolean).slice(0, 4);
  const more = all.filter((i) => !tabs.includes(i));
  return { main, platform, tabs, more };
}
