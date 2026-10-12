// /dashboard/: staff → Fleet, everyone else → their tenant's Home (dashboard plan §3.2).
import { Navigate } from 'react-router';
import { useMe } from '../auth/session.js';
import { landingPath } from '../auth/redirect.js';

export default function Landing() {
  const { data: me } = useMe();
  return <Navigate to={landingPath(me)} replace />;
}
