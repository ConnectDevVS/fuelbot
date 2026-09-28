// Route guards: the tenant in the URL must be one the user may see (else Not found, and for tenant
// users without any request), and the user needs the page's permission (else Not available, and
// the page never mounts, so none of its queries run).
import { Skeleton } from 'antd';
import { useCan } from '../auth/session.js';
import { allowed } from './pages.js';
import { useCurrentTenant } from './tenant.js';
import NotFound from '../pages/NotFound.jsx';
import NotAvailable from '../pages/NotAvailable.jsx';
import { ErrorPanel } from '../ui/States.jsx';
import { isApiError } from '../api/client.js';

export function TenantScope({ children }) {
  const { error, pending, queryError } = useCurrentTenant();
  if (error === 'not_found' || isApiError(queryError, 404)) return <NotFound />;
  if (queryError) return <ErrorPanel error={queryError} />;
  if (pending) return <Skeleton active />;
  return children;
}

export function Gate({ page, children }) {
  const can = useCan();
  return allowed(page, can) ? children : <NotAvailable />;
}
