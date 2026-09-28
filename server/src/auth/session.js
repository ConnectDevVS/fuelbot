// Dashboard sessions (plan §4.6): a signed JWT {sub, tv} in an httpOnly, SameSite=Strict cookie,
// valid SESSION_HOURS (48), fixed. Every request reloads the user. Each session has an id (jti);
// signing out revokes that id on the server, so a copied cookie stops working too.
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { RevokedSession, Tenant, User } from '../models/index.js';
import { HttpError } from '../errors.js';

export const COOKIE = 'fb_session';
export const CSRF_HEADER = 'X-Requested-With';
export const CSRF_VALUE = 'fuelbot-dashboard';

export function setSessionCookie(res, user, settings) {
  const token = jwt.sign({ sub: String(user._id), tv: user.token_version }, settings.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: settings.sessionHours * 3600,
    jwtid: crypto.randomBytes(16).toString('hex'),
  });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: settings.cookieSecure,
    path: '/',
    maxAge: settings.sessionHours * 3600 * 1000,
  });
}

/** Ends this session on the server (idempotent) and clears its cookie. */
export async function endSession(req, res, settings) {
  if (req.session?.jti) {
    await RevokedSession.updateOne({ jti: req.session.jti },
      { $setOnInsert: { expires_at: new Date(req.session.exp * 1000) } }, { upsert: true });
  }
  clearSessionCookie(res, settings);
}

export function clearSessionCookie(res, settings) {
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'strict', secure: settings.cookieSecure, path: '/' });
}

/** Every non-GET request needs the dashboard's header (a cross-site form can't set it). */
export function csrfGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get(CSRF_HEADER) !== CSRF_VALUE) throw new HttpError(403, 'csrf_header_required');
  next();
}

/** Sets req.user from the cookie, or 401 not_signed_in; 403 tenant_disabled for its tenant. */
export async function requireSession(req, res, next) {
  const settings = req.app.locals.settings;
  const token = req.cookies?.[COOKIE];
  let claims;
  try {
    claims = jwt.verify(token ?? '', settings.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    throw new HttpError(401, 'not_signed_in');
  }
  if (!claims.jti || await RevokedSession.exists({ jti: claims.jti })) throw new HttpError(401, 'not_signed_in');
  req.session = { jti: claims.jti, exp: claims.exp };
  const user = await User.findById(claims.sub).lean().catch(() => null);
  if (!user || user.disabled || user.token_version !== claims.tv) throw new HttpError(401, 'not_signed_in');
  if (user.tenant_id) {
    const tenant = await Tenant.findById(user.tenant_id, { disabled: 1 }).lean();
    if (!tenant || tenant.disabled) throw new HttpError(403, 'tenant_disabled');
  }
  req.user = user;
  next();
}

// Allowed while a temporary password is still in use (plan §4.4).
const WHILE_CHANGING = new Set(['GET /auth/me', 'POST /auth/password', 'POST /auth/logout']);

/** 403 password_change_required for everything else until the user sets their own password. */
export function requirePasswordChanged(req, res, next) {
  // The full path under /api/v1: req.path alone is relative to whichever router runs this.
  const path = (req.baseUrl + req.path).replace(/^\/api\/v1/, '');
  if (req.user?.must_change_password && !WHILE_CHANGING.has(`${req.method} ${path}`)) {
    throw new HttpError(403, 'password_change_required');
  }
  next();
}
