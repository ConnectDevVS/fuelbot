// /api/v1: the admin API used by the dashboard (plan §4.4). CSRF header on every write;
// /auth handles sign-in; everything else needs a session and a changed password.
import express from 'express';
import { csrfGuard, requirePasswordChanged, requireSession } from '../auth/session.js';
import { authRouter } from './auth.js';
import { usersRouter } from './users.js';
import { auditRouter } from './audit.js';
import { tenantsRouter } from './tenants.js';
import { productsRouter } from './products.js';

export function apiRouter(settings) {
  const router = express.Router();
  router.use(csrfGuard);
  router.use('/auth', authRouter(settings));
  router.use(requireSession, requirePasswordChanged);
  router.use('/users', usersRouter(settings));
  router.use('/audit', auditRouter());
  router.use('/tenants/:tid/products', productsRouter());
  router.use('/tenants', tenantsRouter());
  return router;
}
