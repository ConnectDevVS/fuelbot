// /api/v1/users (plan §4.4 "User rules"): platform_admins manage everyone, a tenant_admin
// manages their own tenant's users. Users are disabled, never deleted.
import express from 'express';
import mongoose from 'mongoose';
import { Machine, Tenant, User, PLATFORM_ROLES, ROLES, TENANT_ROLES } from '../models/index.js';
import { guard, isPlatform } from '../auth/rbac.js';
import { hashPassword } from '../auth/passwords.js';
import { userView } from '../services/views.js';
import { findPage } from '../services/pages.js';
import { isDuplicateKey } from '../db.js';
import { HttpError } from '../errors.js';

const MACHINE_ROLES = ['operator', 'viewer'];

/** The users this admin may see and manage. */
function scopeFilter(admin) {
  return isPlatform(admin) ? {} : { tenant_id: admin.tenant_id };
}

async function findVisible(admin, id) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new HttpError(404, 'not_found');
  const user = await User.findOne({ _id: id, ...scopeFilter(admin) });
  if (!user) throw new HttpError(404, 'not_found');
  return user;
}

function checkRoleFor(admin, role) {
  if (!ROLES.includes(role)) throw new HttpError(400, 'invalid_role');
  if (!isPlatform(admin) && !TENANT_ROLES.includes(role)) throw new HttpError(403, 'forbidden');
}

async function checkMachines(role, tenantId, machines) {
  if (machines === undefined) return [];
  if (!Array.isArray(machines) || !machines.every((m) => typeof m === 'string' && m)) {
    throw new HttpError(400, 'invalid_machines');
  }
  if (machines.length && !MACHINE_ROLES.includes(role)) throw new HttpError(400, 'machines_not_allowed');
  const unique = [...new Set(machines)];
  const found = await Machine.countDocuments({ _id: { $in: unique }, tenant_id: tenantId });
  if (found !== unique.length) throw new HttpError(400, 'unknown_machine');
  return unique;
}

/** 409 when the change would leave a tenant (or the platform) without an active admin. */
async function checkLastAdmin(target, after) {
  const wasActiveAdmin = !target.disabled && ['tenant_admin', 'platform_admin'].includes(target.role);
  const staysActiveAdmin = !after.disabled && after.role === target.role;
  if (!wasActiveAdmin || staysActiveAdmin) return;
  const others = await User.countDocuments({
    _id: { $ne: target._id },
    role: target.role,
    disabled: false,
    ...(target.role === 'tenant_admin' ? { tenant_id: target.tenant_id } : {}),
  });
  if (others === 0) {
    throw new HttpError(409, target.role === 'tenant_admin' ? 'last_tenant_admin' : 'last_platform_admin');
  }
}

export function usersRouter(settings) {
  const router = express.Router();
  router.use(guard('users:manage'));

  router.get('/', async (req, res) => {
    const filter = scopeFilter(req.user);
    if (isPlatform(req.user) && typeof req.query.tenant === 'string') filter.tenant_id = req.query.tenant;
    res.json(await findPage(User, filter, req.query, userView));
  });

  router.post('/', async (req, res) => {
    const body = req.body ?? {};
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw new HttpError(400, 'invalid_email');
    if (body.name !== undefined && typeof body.name !== 'string') throw new HttpError(400, 'invalid_name');
    checkRoleFor(req.user, body.role);

    let tenantId;
    if (TENANT_ROLES.includes(body.role)) {
      tenantId = isPlatform(req.user) ? body.tenant_id : (body.tenant_id ?? req.user.tenant_id);
      if (!isPlatform(req.user) && tenantId !== req.user.tenant_id) throw new HttpError(403, 'forbidden');
      if (typeof tenantId !== 'string' || !(await Tenant.exists({ _id: tenantId }))) {
        throw new HttpError(400, 'unknown_tenant');
      }
    }
    const machines = tenantId ? await checkMachines(body.role, tenantId, body.machines) : [];
    try {
      const user = await User.create({
        email,
        name: body.name ?? '',
        role: body.role,
        tenant_id: tenantId,
        machines,
        password_hash: await hashPassword(body.password, settings.bcryptCost),
        must_change_password: true,
      });
      res.status(201).json({ user: userView(user) });
    } catch (err) {
      if (isDuplicateKey(err)) throw new HttpError(409, 'email_taken');
      throw err;
    }
  });

  router.patch('/:id', async (req, res) => {
    const body = req.body ?? {};
    const allowed = ['name', 'role', 'machines', 'disabled', 'tenant_id'];
    const unknown = Object.keys(body).filter((k) => !allowed.includes(k));
    if (unknown.length) throw new HttpError(400, 'unknown_field', unknown);

    const target = await findVisible(req.user, req.params.id);
    const self = String(target._id) === String(req.user._id);
    if ('tenant_id' in body && body.tenant_id !== (target.tenant_id ?? null)) {
      throw new HttpError(400, 'tenant_immutable');
    }
    const role = body.role ?? target.role;
    const disabled = body.disabled ?? target.disabled;
    if (body.disabled !== undefined && typeof body.disabled !== 'boolean') throw new HttpError(400, 'invalid_disabled');
    if (body.name !== undefined && typeof body.name !== 'string') throw new HttpError(400, 'invalid_name');
    if (role !== target.role) {
      checkRoleFor(req.user, role);
      if (PLATFORM_ROLES.includes(role) !== PLATFORM_ROLES.includes(target.role)) {
        throw new HttpError(400, 'role_scope_change');   // tenant_id never changes
      }
    }
    if (self && (role !== target.role || (disabled && !target.disabled))) throw new HttpError(403, 'forbidden_self');
    await checkLastAdmin(target, { role, disabled });

    const machines = body.machines !== undefined || role !== target.role
      ? await checkMachines(role, target.tenant_id, body.machines ?? (MACHINE_ROLES.includes(role) ? target.machines : []))
      : target.machines;
    const endSessions = role !== target.role || (disabled && !target.disabled);
    target.set({ name: body.name ?? target.name, role, disabled, machines });
    if (endSessions) target.token_version += 1;
    await target.save();
    res.json({ user: userView(target) });
  });

  // A new temporary password; the user must change it at next sign-in. Your own: /auth/password.
  router.post('/:id/password', async (req, res) => {
    const target = await findVisible(req.user, req.params.id);
    if (String(target._id) === String(req.user._id)) throw new HttpError(403, 'forbidden_self');
    target.password_hash = await hashPassword(req.body?.password, settings.bcryptCost);
    target.must_change_password = true;
    target.token_version += 1;
    await target.save();
    res.json({ user: userView(target) });
  });

  return router;
}
