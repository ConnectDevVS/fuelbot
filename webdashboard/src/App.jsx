// The app root: antd's ConfigProvider (theme, CSP nonce, locale), antd's App (which gives
// App.useApp() its message/modal with that context), React Query, and the router.
import { Suspense } from 'react';
import { RouterProvider } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, ConfigProvider, Skeleton } from 'antd';
import enGB from 'antd/locale/en_GB';
import { antdTheme } from './theme/antdTheme.js';

export function App({ nonce, router, queryClient }) {
  return (
    <ConfigProvider theme={antdTheme} csp={nonce ? { nonce } : undefined} locale={enGB}>
      <AntApp>
        <QueryClientProvider client={queryClient}>
          <Suspense fallback={<Skeleton active className="page-skeleton" />}>
            <RouterProvider router={router} />
          </Suspense>
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  );
}
