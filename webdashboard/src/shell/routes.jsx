// The route table (dashboard plan §3.3). SRV-32: sign-in, change password, the landing redirect
// and placeholders for the landing pages; SRV-33 adds the full map, gating and the shell.
import { lazy } from 'react';
import { RequireAuth } from '../auth/RequireAuth.jsx';
import AppLayout from './AppLayout.jsx';
import Landing from '../pages/Landing.jsx';
import ComingSoon from '../pages/ComingSoon.jsx';
import { t } from '../strings.js';

const SignInPage = lazy(() => import('../auth/SignInPage.jsx'));
const ChangePasswordPage = lazy(() => import('../auth/ChangePasswordPage.jsx'));

export const routes = [
  { path: '/sign-in', element: <SignInPage /> },
  { path: '/change-password', element: <RequireAuth allowPasswordChange><ChangePasswordPage /></RequireAuth> },
  {
    element: <RequireAuth><AppLayout /></RequireAuth>,
    children: [
      { path: '/', element: <Landing /> },
      { path: '/fleet', element: <ComingSoon title={t('page.fleet')} story="SRV-36" /> },
      { path: '/t/:tid/home', element: <ComingSoon title={t('page.home')} story="SRV-38" /> },
      { path: '/t/:tid/sales', element: <ComingSoon title={t('page.sales')} story="SRV-39" /> },
    ],
  },
];
