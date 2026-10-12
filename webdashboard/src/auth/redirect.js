// Where to go after sign-in (dashboard plan §3.2). `next` wins only when it's a /dashboard/ path of
// this site: anything else is ignored, so a crafted link can't redirect elsewhere.
const BASE = '/dashboard';

/** A router path (relative to /dashboard) from `next`, or null when it isn't a safe dashboard path. */
export function safeNext(next) {
  if (typeof next !== 'string' || !next.startsWith(`${BASE}/`)) return null;
  if (next.startsWith('//') || next.includes('\\') || /(^|\/)\.\.?(\/|$|\?)/.test(next)) return null;
  if ([...next].some((c) => c.charCodeAt(0) < 32)) return null;
  const path = next.slice(BASE.length);
  if (path === '/sign-in' || path.startsWith('/sign-in?') || path.startsWith('/sign-in/')) return null;
  return path;
}

/** Staff land on Fleet; everyone else on their tenant's Home (the permission, never the role). */
export function landingPath(me) {
  if (me.permissions.includes('telemetry:read')) return '/fleet';
  return `/t/${encodeURIComponent(me.tenant?.id ?? me.user.tenant_id)}/home`;
}

export function signInPath(next) {
  return next ? `/sign-in?next=${encodeURIComponent(next)}` : '/sign-in';
}
