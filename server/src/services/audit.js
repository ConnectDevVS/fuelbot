// The audit log (plan §4.1, stories/users-rbac decision 8): who changed what, when.
// Best effort (a failed write is logged, never fails the request) and never holds a secret.
import { AuditEntry } from '../models/index.js';

const SECRET_KEYS = new Set(['password', 'password_hash', 'current', 'new', 'token', 'key', 'hash']);

function scrub(value) {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (!SECRET_KEYS.has(k)) out[k] = scrub(v);
    }
    return out;
  }
  return value;
}

/** Only the fields that differ between before and after (e.g. the one changed setting). */
export function diff(before, after, keys) {
  const b = {};
  const a = {};
  for (const key of keys) {
    if (JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key])) {
      b[key] = before?.[key];
      a[key] = after?.[key];
    }
  }
  return { before: b, after: a };
}

/**
 * Records an action. entry: {action, tenant_id?, machine_id?, target?, before?, after?, user?, email?}.
 * `user` defaults to req.user; `email` is for a failed sign-in (no user).
 */
export async function audit(req, entry) {
  const user = entry.user === undefined ? req.user : entry.user;
  try {
    await AuditEntry.create({
      at: new Date(),
      user_id: user?._id ?? null,
      user_email: user?.email ?? entry.email,
      action: entry.action,
      tenant_id: entry.tenant_id,
      machine_id: entry.machine_id,
      target: entry.target,
      ip: req.ip,
      before: entry.before === undefined ? undefined : scrub(entry.before),
      after: entry.after === undefined ? undefined : scrub(entry.after),
    });
  } catch (err) {
    console.error(`[audit] could not record ${entry.action}: ${err.message}`);
  }
}

/** An audit entry as the dashboard shows it (platform only). */
export function auditView(e) {
  return {
    id: String(e._id),
    at: e.at,
    user_id: e.user_id ? String(e.user_id) : null,
    user_email: e.user_email ?? null,
    action: e.action,
    tenant_id: e.tenant_id ?? null,
    machine_id: e.machine_id ?? null,
    target: e.target ?? null,
    ip: e.ip ?? null,
    before: e.before ?? null,
    after: e.after ?? null,
  };
}
