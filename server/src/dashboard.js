// /dashboard (dashboard plan §2.4): the built web dashboard (webdashboard/dist) with its own strict
// CSP. Ant Design writes its styles at runtime, so index.html is rendered per request with a fresh
// nonce, the same one the CSP's style-src allows. Hashed assets are cached for a year; index.html
// never (the nonce). Any other GET is a deep link and gets index.html. No build → a 503 page.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';

const PLACEHOLDER = '__CSP_NONCE__';
const ENV_PLACEHOLDER = '__ENV_LABEL__';   // <meta name="fb-env">: ENV_LABEL (settings.js allows no markup)
const NOT_BUILT = '<!doctype html><meta charset="utf-8"><title>FuelBot dashboard</title>'
  + '<p>Dashboard not built. Run <code>npm ci &amp;&amp; npm run build</code> in <code>webdashboard/</code>.</p>\n';

/** The img-src origins: the storage's public origin, PUBLIC_URL's, and IMAGE_ORIGINS. */
export function imageSources(settings) {
  const origins = [];
  if (settings.s3.publicBaseUrl) origins.push(new URL(settings.s3.publicBaseUrl).origin);
  else if (settings.s3.bucket) origins.push(`https://${settings.s3.bucket}.s3.${settings.s3.region}.amazonaws.com`);
  origins.push(new URL(settings.publicUrl).origin, ...settings.imageOrigins);
  return [...new Set(origins)];
}

/** The dashboard CSP; withNonce adds res.locals.cspNonce to style-src (only for index.html). */
function cspMiddleware(settings, { withNonce }) {
  const directives = {
    'default-src': ["'self'"],
    'script-src': ["'self'"],
    'style-src': ["'self'", ...(withNonce ? [(req, res) => `'nonce-${res.locals.cspNonce}'`] : [])],
    'img-src': ["'self'", 'data:', ...imageSources(settings)],
    'font-src': ["'self'"],
    'connect-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'frame-ancestors': ["'none'"],
    'form-action': ["'self'"],
  };
  if (settings.production) directives['upgrade-insecure-requests'] = [];
  return helmet({ contentSecurityPolicy: { useDefaults: false, directives } });
}

/** index.html, re-read when it changes (a rebuild while the server runs); null when not built. */
function indexLoader(dir) {
  const file = path.join(dir, 'index.html');
  let cached = null;
  return () => {
    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      cached = null;
      return null;
    }
    if (!cached || cached.mtimeMs !== stat.mtimeMs || cached.size !== stat.size) {
      cached = { mtimeMs: stat.mtimeMs, size: stat.size, html: fs.readFileSync(file, 'utf8') };
    }
    return cached.html;
  };
}

/** True when DASHBOARD_DIR holds a build (index.js logs it once at boot when not). */
export function dashboardBuilt(settings) {
  return fs.existsSync(path.join(settings.dashboardDir, 'index.html'));
}

export function dashboardRouter(settings) {
  const dir = settings.dashboardDir;
  const loadIndex = indexLoader(dir);
  const csp = cspMiddleware(settings, { withNonce: false });
  const cspWithNonce = cspMiddleware(settings, { withNonce: true });
  const router = express.Router();

  router.use(csp);

  function sendIndex(req, res, next) {
    const html = loadIndex();
    res.set('Cache-Control', 'no-store');
    if (!html) return res.status(503).type('html').send(NOT_BUILT);
    res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
    cspWithNonce(req, res, (err) => {   // replaces the header set above
      if (err) return next(err);
      res.type('html').send(html.replaceAll(PLACEHOLDER, res.locals.cspNonce).replaceAll(ENV_PLACEHOLDER, settings.envLabel));
    });
  }

  // index.html never comes from express.static: the placeholder must never leave unfilled.
  router.get(['/', '/index.html'], sendIndex);

  router.use(express.static(dir, {
    index: false,
    fallthrough: true,
    redirect: false,
    setHeaders(res, file) {
      const rel = path.relative(dir, file).split(path.sep);
      res.set('Cache-Control', rel[0] === 'assets' ? 'public, max-age=31536000, immutable' : 'no-cache');
    },
  }));

  router.use((req, res, next) => {
    const read = ['GET', 'HEAD'].includes(req.method);
    if (!read || (req.path.startsWith('/assets/') && loadIndex())) return res.status(404).json({ error: 'not_found' });
    return sendIndex(req, res, next);   // a deep link (or the 503 page when not built)
  });

  return router;
}
