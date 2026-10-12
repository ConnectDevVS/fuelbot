// The tenant the page is about (dashboard plan §2.7): /t/:tid/* in the URL. Tenant users only ever
// have their own (from /auth/me; no request); staff read the named tenant (GET /tenants/:tid).
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { api } from '../api/client.js';
import { useCan, useMe } from '../auth/session.js';

export function useIsStaff() {
  return useCan()('telemetry:read');
}

export function useTenantQuery(tid, enabled = true) {
  return useQuery({
    queryKey: ['tenants', tid],
    queryFn: ({ signal }) => api('GET', `/tenants/${encodeURIComponent(tid)}`, { signal }).then((r) => r.tenant),
    enabled: Boolean(tid) && enabled,
  });
}

/** {tid, tenant: {id, name, logo_text} | null, pending, error} for the current URL. */
export function useCurrentTenant() {
  const { tid } = useParams();
  const { data: me } = useMe();
  const staff = useIsStaff();
  const query = useTenantQuery(tid, staff);
  if (!tid) return { tid: null, tenant: staff ? null : me.tenant, pending: false, error: null };
  if (!staff) {
    const own = me.tenant && me.tenant.id === tid;
    return { tid, tenant: own ? me.tenant : null, pending: false, error: own ? null : 'not_found' };
  }
  const t = query.data;
  return {
    tid,
    tenant: t ? { id: t.id, name: t.name, logo_text: t.branding?.logo_text ?? null } : null,
    pending: query.isPending,
    error: query.error ? 'error' : null,
    queryError: query.error,
  };
}
