// Names for ids (dashboard plan §2.10): sales and summaries carry ids. Flavors come from the
// tenant's products including archived ones (old sales name them); machines from its machine list.
// An unknown id shows as itself.
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';

/** name || location_label || id (the dev seed's DEV00001 has an empty name). */
export function machineName(m) {
  if (!m) return '';
  return (m.name && m.name.trim()) || (m.location_label && m.location_label.trim()) || m.id || '';
}

export function nameOf(names, id) {
  return names?.get(id) ?? id ?? '';
}

export const productsKey = (tid, archived = false) => ['products', tid, { archived }];
export const machinesKey = (tid) => ['machines', tid];

export function useProducts(tid, { archived = false } = {}) {
  return useQuery({
    queryKey: productsKey(tid, archived),
    queryFn: ({ signal }) => api('GET', `/tenants/${encodeURIComponent(tid)}/products${archived ? '?archived=true' : ''}`,
      { signal }).then((r) => r.items),
    enabled: Boolean(tid),
  });
}

export function useMachines(tid) {
  return useQuery({
    queryKey: machinesKey(tid),
    queryFn: ({ signal }) => api('GET', `/tenants/${encodeURIComponent(tid)}/machines`, { signal }).then((r) => r.items),
    enabled: Boolean(tid),
  });
}

/** Map product id → name (archived included). */
export function useFlavorNames(tid) {
  const { data } = useProducts(tid, { archived: true });
  return new Map((data ?? []).map((p) => [p.id, p.name]));
}

/** Map machine id → display name. */
export function useMachineNames(tid) {
  const { data } = useMachines(tid);
  return new Map((data ?? []).map((m) => [m.id, machineName(m)]));
}
