// Roles → permissions (plan §4.7). Routes ask for a permission; only this file knows the roles.
// Scope: a platform_admin sees every tenant; everyone else sees one tenant, and operators and
// viewers optionally only some of its machines.
import { HttpError } from '../errors.js';

// Platform-only data and controls (plan §4.7): no tenant role ever holds these.
export const PLATFORM_ONLY = [
  'tenants:create', 'tenants:disable', 'telemetry:read', 'faults:read', 'maintenance:read',
  'maintenance:write', 'audit:read', 'unregistered:read', 'complaints:status',
];

// Tenant-only (complaints, plan §4.15): staff answer complaints rather than raise them, and change
// their status with complaints:status instead of reopening. The one exception to "platform_admin
// holds every tenant_admin permission".
export const TENANT_ONLY = ['complaints:raise', 'complaints:reopen'];

// Every tenant role raises complaints and comments on the ones it can see (complaintScope).
const COMPLAINTS = ['complaints:raise', 'complaints:comment', 'complaints:reopen'];

const TENANT_ADMIN = [
  'tenant:read', 'tenant:edit', 'users:manage', 'machines:read', 'machines:manage', 'keys:manage',
  'catalog:read', 'products:create', 'products:edit', 'menu:edit', 'price:write', 'sales:read', 'stock:write',
  ...COMPLAINTS, 'complaints:read_all',
];
const OPERATOR = ['tenant:read', 'machines:read', 'catalog:read', 'products:edit', 'menu:edit', 'sales:read', ...COMPLAINTS];
const VIEWER = ['tenant:read', 'machines:read', 'catalog:read', 'sales:read', ...COMPLAINTS];

export const ROLE_PERMISSIONS = {
  platform_admin: new Set([...PLATFORM_ONLY, ...TENANT_ADMIN.filter((p) => !TENANT_ONLY.includes(p))]),
  tenant_admin: new Set(TENANT_ADMIN),
  operator: new Set(OPERATOR),
  viewer: new Set(VIEWER),
};

// A product change reaches every machine that sells it: only for users with all machines.
const NEEDS_ALL_MACHINES = new Set(['products:edit']);

export const isPlatform = (user) => user?.role === 'platform_admin';

export function hasPermission(user, permission) {
  return Boolean(user && ROLE_PERMISSIONS[user.role]?.has(permission));
}

/** True when the user isn't limited to a list of machines. */
export function hasAllMachines(user) {
  return isPlatform(user) || user?.role === 'tenant_admin' || (user?.machines ?? []).length === 0;
}

export function canSeeTenant(user, tenantId) {
  return isPlatform(user) || (Boolean(tenantId) && user?.tenant_id === tenantId);
}

/** machine: {_id, tenant_id}. */
export function canSeeMachine(user, machine) {
  if (!machine || !canSeeTenant(user, machine.tenant_id)) return false;
  return hasAllMachines(user) || user.machines.includes(machine._id);
}

/**
 * The full check. scope: {tenantId?, machine?}. Outside the scope → 'not_found' (404, no probing);
 * inside it without the permission → 'forbidden' (403); otherwise null.
 */
export function denial(user, permission, { tenantId, machine } = {}) {
  if (tenantId !== undefined && !canSeeTenant(user, tenantId)) return 'not_found';
  if (machine !== undefined && !canSeeMachine(user, machine)) return 'not_found';
  if (!hasPermission(user, permission)) return 'forbidden';
  if (NEEDS_ALL_MACHINES.has(permission) && !hasAllMachines(user)) return 'forbidden';
  return null;
}

/**
 * What the user may do, for /auth/me (DP §2.5): the role's set minus the permissions that need
 * every machine when the user is limited to some. Sorted. The same table can() uses.
 */
export function effectivePermissions(user) {
  const all = hasAllMachines(user);
  return [...(ROLE_PERMISSIONS[user?.role] ?? [])].filter((p) => all || !NEEDS_ALL_MACHINES.has(p)).sort();
}

export function can(user, permission, scope) {
  return denial(user, permission, scope) === null;
}

/** Throws the matching HttpError unless allowed. */
export function assertCan(user, permission, scope) {
  const why = denial(user, permission, scope);
  if (why === 'not_found') throw new HttpError(404, 'not_found');
  if (why === 'forbidden') throw new HttpError(403, 'forbidden');
}

/** Route guard: the permission, scoped to req.params[tenantParam] when given. */
export function guard(permission, { tenantParam } = {}) {
  return (req, res, next) => {
    assertCan(req.user, permission, tenantParam ? { tenantId: req.params[tenantParam] } : {});
    next();
  };
}

/**
 * The complaints a user may see (plan §4.15): platform all; complaints:read_all (tenant_admin) their
 * tenant's; everyone else only the ones they raised. Machine scope doesn't apply (no machine).
 */
export function complaintScope(user) {
  if (isPlatform(user)) return {};
  if (hasPermission(user, 'complaints:read_all')) return { tenant_id: user.tenant_id };
  return { tenant_id: user.tenant_id, 'created_by.user_id': user._id };
}

/** A query filter for records (sales, telemetry…) limited to what the user may see. */
export function recordScope(user) {
  if (isPlatform(user)) return {};
  const filter = { tenant_id: user.tenant_id };
  if (!hasAllMachines(user)) filter.machine_id = { $in: user.machines };
  return filter;
}
