// The Express app. createApp() takes its dependencies so tests can build one per suite.
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { pingDb } from './db.js';
import { HttpError } from './errors.js';
import { kioskRouter } from './routes/kiosk.js';
import { apiRouter } from './routes/api.js';

export function createApp({ settings }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.locals.settings = settings;

  if (settings.logRequests) {
    // Method, path (no query: presigned or filter values), status, time. Never headers or bodies.
    app.use((req, res, next) => {
      const start = process.hrtime.bigint();
      res.on('finish', () => {
        const ms = Number(process.hrtime.bigint() - start) / 1e6;
        const path = req.originalUrl.split('?')[0];
        console.log(`[http] ${req.method} ${path} ${res.statusCode} ${ms.toFixed(1)}ms`);
      });
      next();
    });
  }

  app.use(helmet());
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());

  app.get('/healthz', async (req, res) => {
    await pingDb();
    res.json({ ok: true });
  });

  app.use('/fuelbot', kioskRouter());
  app.use('/api/v1', apiRouter(settings));

  app.use((req, res) => res.status(404).json({ error: 'not_found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid_json' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'too_large' });
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
    }
    console.error('[http] unhandled error', err);
    res.status(500).json({ error: 'internal' });
  });

  return app;
}
