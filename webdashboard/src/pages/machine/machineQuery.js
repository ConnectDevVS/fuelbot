// The machine page's read (dashboard plan §5.6): GET /tenants/:tid/machines/:mid → {machine}, shared by
// the frame and its tabs (menu, menu_version, bases…). Under ['machines', tid], so invalidating the
// tenant's machine list refreshes it too.
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.js';

export const machineKey = (tid, mid) => ['machines', tid, mid];
export const machinePath = (tid, mid) => `/tenants/${encodeURIComponent(tid)}/machines/${encodeURIComponent(mid)}`;

export function useMachine(tid, mid) {
  return useQuery({
    queryKey: machineKey(tid, mid),
    queryFn: ({ signal }) => api('GET', machinePath(tid, mid), { signal }).then((r) => r.machine),
    retry: false,
  });
}
