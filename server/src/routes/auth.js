// /api/v1/auth: sign in, sign out, who am I, change my password (plan §4.4, §4.6).
import express from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { Tenant, User } from '../models/index.js';
import { hashPassword, verifyPassword } from '../auth/passwords.js';
import { endSession, requirePasswordChanged, requireSession, setSessionCookie } from '../auth/session.js';
import { userView } from '../services/views.js';
import { effectivePermissions, hasAllMachines, isPlatform } from '../auth/rbac.js';
import { audit } from '../services/audit.js';
import { checkCode, sendCodeOr502 } from '../services/codes.js';
import { HttpError } from '../errors.js';

const emailOf = (body) => (typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '');

/** /auth/me (DP §2.5): the user, what they may do, their tenant, the display zone, the session end. */
async function meBody(user, exp, settings) {
  let tenant = null;
  if (!isPlatform(user) && user.tenant_id) {
    const t = await Tenant.findById(user.tenant_id, { name: 1, branding: 1 }).lean();
    if (t) tenant = { id: t._id, name: t.name, logo_text: t.branding?.logo_text ?? null };
  }
  return {
    user: userView(user),
    permissions: effectivePermissions(user),
    all_machines: hasAllMachines(user),
    tenant,
    display_tz: settings.displayTz,
    session_expires_at: new Date(exp * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
  };
}

/** checkCode, auditing a wrong code (auth.code_failed; voided on the fifth). */
export async function checkCodeAudited(req, user, code, settings) {
  try {
    await checkCode(user._id, code, settings);
  } catch (err) {
    if (err.message === 'invalid_code') {
      await audit(req, { action: 'auth.code_failed', user, tenant_id: user.tenant_id, target: `user:${user._id}`,
        after: { voided: err.voided } });
    }
    throw err;
  }
}

export function authRouter(settings) {
  const router = express.Router();

  // Failed sign-ins per IP + email; successful ones don't count (stories/users-rbac decision 3).
  const loginLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: settings.loginRateLimit,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? '')}|${emailOf(req.body)}`,
    handler: (req, res) => res.status(429).json({ error: 'too_many_attempts' }),
  });

  // Code mails a signed-in user asks for, per IP + user (README decision 8).
  const codeLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? '')}|${req.user._id}`,
    handler: (req, res) => res.status(429).json({ error: 'too_many_attempts' }),
  });

  router.post('/login', loginLimit, async (req, res) => {
    const email = emailOf(req.body);
    const user = email ? await User.findOne({ email }).select('+password_hash') : null;
    const ok = await verifyPassword(req.body?.password, user?.password_hash);
    if (!user || !ok || user.disabled) {
      await audit(req, { action: 'auth.login_failed', user: null, email: email || undefined });
      throw new HttpError(401, 'invalid_credentials');
    }
    if (user.tenant_id) {
      const tenant = await Tenant.findById(user.tenant_id, { disabled: 1 }).lean();
      if (!tenant || tenant.disabled) throw new HttpError(403, 'tenant_disabled');
    }
    user.last_login_at = new Date();
    await user.save();
    setSessionCookie(res, user, settings);
    await audit(req, { action: 'auth.login', user, tenant_id: user.tenant_id });
    res.json({ user: userView(user) });
  });

  router.use(requireSession, requirePasswordChanged);

  // Ends this session on the server, not just the cookie; other sessions continue.
  router.post('/logout', async (req, res) => {
    await endSession(req, res, settings);
    res.json({ ok: true });
  });

  router.get('/me', async (req, res) => res.json(await meBody(req.user, req.session.exp, settings)));

  // Mails yourself a code while a temporary password is in use (plan §4.16).
  router.post('/code', async (req, res, next) => {
    if (!req.user.must_change_password) throw new HttpError(409, 'not_needed');
    next();
  }, codeLimit, async (req, res) => {
    const body = await sendCodeOr502(req, req.user, 'requested');
    await audit(req, { action: 'auth.code_sent', tenant_id: req.user.tenant_id, target: `user:${req.user._id}` });
    res.json(body);
  });

  // Keeps this session (a fresh cookie), ends all others (decision 5). Replacing a temporary
  // password also needs the emailed code (plan §4.16); a voluntary change doesn't.
  router.post('/password', async (req, res) => {
    const { current, new: next, code } = req.body ?? {};
    const user = await User.findById(req.user._id).select('+password_hash');
    if (!(await verifyPassword(current, user.password_hash))) throw new HttpError(400, 'wrong_password');
    if (user.must_change_password) await checkCodeAudited(req, user, code, settings);
    if (current === next) throw new HttpError(400, 'same_password');
    user.password_hash = await hashPassword(next, settings.bcryptCost);
    user.must_change_password = false;
    user.email_code = null;
    user.token_version += 1;
    await user.save();
    const exp = setSessionCookie(res, user, settings);
    await audit(req, { action: 'auth.password_change', tenant_id: user.tenant_id, target: `user:${user._id}` });
    res.json(await meBody(user.toObject(), exp, settings));
  });

  return router;
}
