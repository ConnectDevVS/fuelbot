// The API client (dashboard plan §2.3): same-origin fetch with the session cookie, the CSRF header
// on every write, If-Match when given. A non-2xx response throws ApiError {status, code, details},
// where code is the body's `error`. No tokens, no Authorization header.

/** @typedef {{body?: unknown, ifMatch?: number|string, signal?: AbortSignal}} ApiOptions */

export const CSRF = { 'X-Requested-With': 'fuelbot-dashboard' };

export class ApiError extends Error {
  /** @param {number} status 0 for a network failure @param {string} code @param {unknown} [details] */
  constructor(status, code, details) {
    super(code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const READS = new Set(['GET', 'HEAD']);

/**
 * @param {string} method
 * @param {string} path under /api/v1, e.g. '/auth/me'
 * @param {ApiOptions} [options]
 */
export async function api(method, path, { body, ifMatch, signal } = {}) {
  const headers = { Accept: 'application/json' };
  if (!READS.has(method)) Object.assign(headers, CSRF, { 'Content-Type': 'application/json' });
  if (ifMatch !== undefined && ifMatch !== null) headers['If-Match'] = String(ifMatch);
  let res;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError(0, 'network_error');
  }
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      // not JSON (a proxy's error page): the status says enough
    }
  }
  if (!res.ok) throw new ApiError(res.status, typeof data?.error === 'string' ? data.error : `http_${res.status}`, data?.details);
  return data;
}

export const isApiError = (err, status, code) => err instanceof ApiError
  && (status === undefined || err.status === status) && (code === undefined || err.code === code);
