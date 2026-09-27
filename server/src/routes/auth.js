// /api/v1/auth: sign in, sign out, who am I, change my password (plan §4.4, §4.6).
import express from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { Tenant, User } from '../models/index.js';
import { hashPassword, verifyPassword } from '../auth/passwords.js';
import { clearSessionCookie, requirePasswordChanged, requireSession, setSessionCookie } from '../auth/session.js';
import { userView } from '../services/views.js';
import { audit } from '../services/audit.js';
import { HttpError } from '../errors.js';

const emailOf = (body) => (typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '');

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

  router.post('/logout', (req, res) => {
    clearSessionCookie(res, settings);
    res.json({ ok: true });
  });

  router.get('/me', (req, res) => res.json({ user: userView(req.user) }));

  // Keeps this session (a fresh cookie), ends all others (decision 5).
  router.post('/password', async (req, res) => {
    const { current, new: next } = req.body ?? {};
    const user = await User.findById(req.user._id).select('+password_hash');
    if (!(await verifyPassword(current, user.password_hash))) throw new HttpError(400, 'wrong_password');
    if (current === next) throw new HttpError(400, 'same_password');
    user.password_hash = await hashPassword(next, settings.bcryptCost);
    user.must_change_password = false;
    user.token_version += 1;
    await user.save();
    setSessionCookie(res, user, settings);
    await audit(req, { action: 'auth.password_change', tenant_id: user.tenant_id, target: `user:${user._id}` });
    res.json({ user: userView(user) });
  });

  return router;
}
