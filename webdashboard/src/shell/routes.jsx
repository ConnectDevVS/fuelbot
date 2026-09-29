// The router (dashboard plan §3.3), built from pages.js. Every page sits behind the session, its
// tenant scope (/t/:tid/*) and its permission gate, inside the shell; not-yet-built pages show
// which story brings them.
import { lazy } from 'react';
import { RequireAuth } from '../auth/RequireAuth.jsx';
import Landing from '../pages/Landing.jsx';
import NotFound from '../pages/NotFound.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import { Gate, TenantScope } from './Guards.jsx';
import { PAGES } from './pages.js';
import { t } from '../strings.js';

const Layout = lazy(() => import('./Layout.jsx'));
const SignInPage = lazy(() => import('../auth/SignInPage.jsx'));
const ChangePasswordPage = lazy(() => import('../auth/ChangePasswordPage.jsx'));
const ComingSoon = lazy(() => import('../pages/ComingSoon.jsx'));
const Gallery = lazy(() => import('../pages/Gallery.jsx'));

const SalesPage = lazy(() => import('../pages/sales/SalesPage.jsx'));

// Built pages, by page id (lazy). Anything not here is a ComingSoon placeholder.
export const COMPONENTS = {
  fleet: lazy(() => import('../pages/fleet/FleetPage.jsx')),
  home: lazy(() => import('../pages/home/HomePage.jsx')),
  sales: SalesPage,
  order: lazy(() => import('../pages/orders/OrderPage.jsx')),
  stock: lazy(() => import('../pages/stock/RefillSoonPage.jsx')),
  machine: lazy(() => import('../pages/machine/MachinePage.jsx')),
  'sales-all': SalesPage,
};

function pageElement(page) {
  const Component = COMPONENTS[page.id];
  const body = Component ? <Component /> : <ComingSoon title={t(page.title)} story={page.story} />;
  const gated = <Gate page={page}>{body}</Gate>;
  return page.path.startsWith('/t/:tid') ? <TenantScope>{gated}</TenantScope> : gated;
}

export const routes = [
  { path: '/sign-in', element: <SignInPage />, errorElement: <ErrorBoundary /> },
  {
    path: '/change-password',
    element: <RequireAuth allowPasswordChange><ChangePasswordPage /></RequireAuth>,
    errorElement: <ErrorBoundary />,
  },
  {
    element: <RequireAuth><Layout /></RequireAuth>,
    errorElement: <ErrorBoundary />,
    children: [
      { path: '/', element: <Landing /> },
      // Every shared component (SRV-34): dev builds, or ?gallery for staff (the page checks).
      { path: '/_gallery', element: <Gallery /> },
      ...PAGES.map((page) => ({ path: page.path, element: pageElement(page), handle: { page } })),
      { path: '*', element: <NotFound /> },
    ],
  },
];
