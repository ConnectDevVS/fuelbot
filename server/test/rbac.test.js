import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { can, denial, effectivePermissions, recordScope, ROLE_PERMISSIONS } from '../src/auth/rbac.js';

const platform = { role: 'platform_admin' };
const tAdmin = { role: 'tenant_admin', tenant_id: 'acme', machines: [] };
const op = { role: 'operator', tenant_id: 'acme', machines: [] };
const opOne = { role: 'operator', tenant_id: 'acme', machines: ['m1'] };
const viewer = { role: 'viewer', tenant_id: 'acme', machines: ['m1'] };
const m1 = { _id: 'm1', tenant_id: 'acme' };
const m2 = { _id: 'm2', tenant_id: 'acme' };
const other = { _id: 'x1', tenant_id: 'globex' };

describe('rbac', () => {
  it('platform-only permissions belong to no tenant role (plan §4.7)', () => {
    for (const p of ['telemetry:read', 'faults:read', 'maintenance:read', 'maintenance:write', 'audit:read',
      'unregistered:read', 'tenants:create', 'tenants:disable']) {
      assert.ok(can(platform, p), p);
      for (const role of ['tenant_admin', 'operator', 'viewer']) assert.ok(!ROLE_PERMISSIONS[role].has(p), `${role} ${p}`);
    }
  });

  it('platform_admin holds every tenant_admin permission (in any tenant)', () => {
    for (const p of ROLE_PERMISSIONS.tenant_admin) {
      assert.ok(ROLE_PERMISSIONS.platform_admin.has(p), p);
      assert.ok(can(platform, p, { tenantId: 'any-tenant' }), p);
    }
  });

  it('prices: tenant_admin and platform_admin only', () => {
    assert.ok(can(platform, 'price:write', { tenantId: 'acme' }));
    assert.ok(can(tAdmin, 'price:write', { tenantId: 'acme' }));
    assert.equal(denial(op, 'price:write', { tenantId: 'acme' }), 'forbidden');
    assert.equal(denial(viewer, 'price:write', { tenantId: 'acme' }), 'forbidden');
  });

  it('another tenant or an unlisted machine is not_found, not forbidden', () => {
    assert.equal(denial(tAdmin, 'catalog:read', { tenantId: 'globex' }), 'not_found');
    assert.equal(denial(tAdmin, 'menu:edit', { machine: other }), 'not_found');
    assert.equal(denial(opOne, 'menu:edit', { machine: m2 }), 'not_found');
    assert.equal(denial(viewer, 'menu:edit', { machine: m1 }), 'forbidden');
    assert.ok(can(opOne, 'menu:edit', { machine: m1 }));
    assert.ok(can(platform, 'menu:edit', { machine: other }));
  });

  it('product edits need every machine; products are created by tenant_admin+', () => {
    assert.ok(can(op, 'products:edit', { tenantId: 'acme' }));
    assert.equal(denial(opOne, 'products:edit', { tenantId: 'acme' }), 'forbidden');
    assert.equal(denial(op, 'products:create', { tenantId: 'acme' }), 'forbidden');
    assert.ok(can(tAdmin, 'products:create', { tenantId: 'acme' }));
  });

  it('record scope: platform everything, tenant users their tenant and machines', () => {
    assert.deepEqual(recordScope(platform), {});
    assert.deepEqual(recordScope(tAdmin), { tenant_id: 'acme' });
    assert.deepEqual(recordScope(viewer), { tenant_id: 'acme', machine_id: { $in: ['m1'] } });
  });

  it('an unknown role has no permissions', () => {
    assert.equal(denial({ role: 'root', tenant_id: 'acme' }, 'catalog:read', { tenantId: 'acme' }), 'forbidden');
  });
  it('effectivePermissions equals the role table', () => {
    const sorted = (role) => [...ROLE_PERMISSIONS[role]].sort();
    assert.deepEqual(effectivePermissions(platform), sorted('platform_admin'));
    assert.deepEqual(effectivePermissions(tAdmin), sorted('tenant_admin'));
    assert.deepEqual(effectivePermissions({ ...tAdmin, machines: ['m1'] }), sorted('tenant_admin'), 'admins see every machine');
    assert.deepEqual(effectivePermissions(op), sorted('operator'));
    assert.deepEqual(effectivePermissions(opOne), sorted('operator').filter((p) => p !== 'products:edit'));
    assert.deepEqual(effectivePermissions(viewer), sorted('viewer'), 'a limited viewer is unchanged');
    assert.deepEqual(effectivePermissions({ role: 'nobody' }), []);
    // Every listed permission passes can() in the user's own scope; nothing else does.
    for (const user of [platform, tAdmin, op, opOne, viewer]) {
      for (const p of ROLE_PERMISSIONS.platform_admin) {
        assert.equal(effectivePermissions(user).includes(p), can(user, p, { tenantId: 'acme' }), `${user.role} ${p}`);
      }
    }
  });
});
