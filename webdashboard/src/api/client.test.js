import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './client.js';

function mockFetch(status, body, { json = true } = {}) {
  const fn = vi.fn(async () => new Response(json ? JSON.stringify(body) : body, { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('api client', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('adds CSRF on writes only', async () => {
    const fetch = mockFetch(200, { ok: true });
    await api('GET', '/auth/me');
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) await api(method, '/x', { body: { a: 1 } });
    await api('PUT', '/menu', { body: {}, ifMatch: 7 });
    const [getUrl, get] = fetch.mock.calls[0];
    expect(getUrl).toBe('/api/v1/auth/me');
    expect(get.headers['X-Requested-With']).toBeUndefined();
    expect(get.headers['If-Match']).toBeUndefined();
    expect(get.credentials).toBe('same-origin');
    expect(get.body).toBeUndefined();
    for (const [, init] of fetch.mock.calls.slice(1)) {
      expect(init.headers['X-Requested-With']).toBe('fuelbot-dashboard');
      expect(init.headers['Content-Type']).toBe('application/json');
      expect(init.headers.Authorization).toBeUndefined();
    }
    expect(fetch.mock.calls[1][1].body).toBe('{"a":1}');
    expect(fetch.mock.calls.at(-1)[1].headers['If-Match']).toBe('7');
  });

  it('throws ApiError with code and details', async () => {
    const details = [{ field: 'menu[2].hopper', error: 'whole number 1–6' }];
    mockFetch(400, { error: 'invalid_body', details });
    const err = await api('PUT', '/menu', { body: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect([err.status, err.code, err.details]).toEqual([400, 'invalid_body', details]);

    mockFetch(502, '<html>Bad gateway</html>', { json: false });
    const bad = await api('GET', '/fleet').catch((e) => e);
    expect([bad.status, bad.code, bad.details]).toEqual([502, 'http_502', undefined]);

    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const offline = await api('GET', '/fleet').catch((e) => e);
    expect([offline.status, offline.code]).toEqual([0, 'network_error']);
  });
});
