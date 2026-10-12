// React Query (dashboard plan §2.6): no focus refetch, no polling, 5 min fresh, one retry for
// reads but never on a 4xx. Session errors are routed globally (DP §2.3): 401 → sign-in with the
// current path as `next` (open forms are remembered); 403 password_change_required → the change
// form; 403 tenant_disabled → sign-in with that message.
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from './client.js';
import { currentPath, goTo } from './navigation.js';
import { snapshotForms } from '../auth/pendingForm.js';
import { signInPath } from '../auth/redirect.js';

const onSignInPage = () => /^\/dashboard\/sign-in(\/|\?|$)/.test(currentPath());

export function makeQueryClient() {
  let client;
  async function onError(error) {
    if (!(error instanceof ApiError)) return;
    if (error.status === 401 && error.code === 'not_signed_in') {
      if (onSignInPage()) return;
      snapshotForms();
      await goTo(signInPath(currentPath()), { replace: true });
      client.clear();
    } else if (error.status === 403 && error.code === 'password_change_required') {
      await goTo('/change-password', { replace: true });
    } else if (error.status === 403 && error.code === 'tenant_disabled') {
      if (onSignInPage()) return;
      await goTo('/sign-in?reason=tenant_disabled', { replace: true });
      client.clear();
    }
  }
  client = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchInterval: false,
        retry: (count, error) => count < 1 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
      },
      mutations: { retry: false },
    },
  });
  return client;
}
