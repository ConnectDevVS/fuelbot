// All settings come from environment variables (server/.env in dev; see .env.example).
import crypto from 'node:crypto';

const MACHINE_AUTH_MODES = ['off', 'optional', 'required'];
const STORAGE_KINDS = ['local', 's3'];

function int(value, fallback) {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
}

export function loadSettings(env = process.env) {
  const port = int(env.PORT, 8790);
  const production = env.NODE_ENV === 'production';
  let jwtSecret = env.JWT_SECRET || '';
  if (!jwtSecret) {
    if (production) throw new Error('JWT_SECRET is required when NODE_ENV=production');
    // Dev: a random secret per process (sessions end on restart).
    jwtSecret = crypto.randomBytes(32).toString('hex');
  }
  const machineAuth = env.MACHINE_AUTH || 'required';
  if (!MACHINE_AUTH_MODES.includes(machineAuth)) {
    throw new Error(`MACHINE_AUTH must be one of ${MACHINE_AUTH_MODES.join(', ')}`);
  }
  const storage = env.STORAGE || 'local';
  if (!STORAGE_KINDS.includes(storage)) {
    throw new Error(`STORAGE must be one of ${STORAGE_KINDS.join(', ')}`);
  }
  const publicUrl = (env.PUBLIC_URL || `http://127.0.0.1:${port}`).replace(/\/+$/, '');
  return {
    production,
    port,
    host: env.HOST || '127.0.0.1',
    mongoUrl: env.MONGO_URL || 'mongodb://127.0.0.1:27017/fuelbot',
    jwtSecret,
    sessionHours: int(env.SESSION_HOURS, 48),
    bcryptCost: int(env.BCRYPT_COST, 12),
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : production,
    machineAuth,
    offlineAfterSec: int(env.OFFLINE_AFTER_SEC, 300),
    displayTz: env.DISPLAY_TZ || 'Asia/Kolkata',
    loginRateLimit: int(env.LOGIN_RATE_LIMIT, 10),
    logRequests: env.LOG_REQUESTS !== 'false',
    publicUrl,
    storage,
    localStorageDir: env.LOCAL_STORAGE_DIR || new URL('../uploads/', import.meta.url).pathname,
    s3: {
      bucket: env.S3_BUCKET || '',
      region: env.S3_REGION || 'ap-south-1',
      prefix: (env.S3_PREFIX || '').replace(/^\/+|\/+$/g, ''),
      publicBaseUrl: (env.S3_PUBLIC_BASE_URL || '').replace(/\/+$/, ''),
    },
  };
}
