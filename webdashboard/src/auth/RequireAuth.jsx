// Pages behind a session. No session → sign-in (with `next`); a temporary password → only the
// change-password page.
import { Navigate, Outlet, useLocation } from 'react-router';
import { Skeleton } from 'antd';
import { useMe } from './session.js';
import { signInPath } from './redirect.js';
import { isApiError } from '../api/client.js';

export function RequireAuth({ allowPasswordChange = false, children }) {
  const { data: me, error, isPending } = useMe();
  const location = useLocation();
  if (isPending) return <Skeleton active className="page-skeleton" />;
  if (error) {
    if (isApiError(error, 403, 'tenant_disabled')) return <Navigate to="/sign-in?reason=tenant_disabled" replace />;
    return <Navigate to={signInPath(`/dashboard${location.pathname}${location.search}`)} replace />;
  }
  if (me.user.must_change_password && !allowPasswordChange) return <Navigate to="/change-password" replace />;
  return children ?? <Outlet />;
}
