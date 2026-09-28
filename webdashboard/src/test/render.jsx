// Rendering components in tests: a signed-in user in the query cache, a router, antd's context.
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { App as AntApp, ConfigProvider } from 'antd';
import { antdTheme } from '../theme/antdTheme.js';

export const ME = {
  user: { id: 'u1', email: 'owner@powerfuel.test', name: 'Owner', role: 'tenant_admin', tenant_id: 'powerfuel', machines: [] },
  permissions: ['machines:read', 'sales:read'],
  all_machines: true,
  tenant: { id: 'powerfuel', name: 'PowerFuel Gym', logo_text: 'PF' },
  display_tz: 'Asia/Kolkata',
  session_expires_at: '2099-01-01T00:00:00Z',
};

export function renderUi(ui, { me = ME, path = '/' } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['me'], me);
  return render(
    <ConfigProvider theme={antdTheme}>
      <AntApp>
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>,
  );
}

/** Makes matchMedia('(min-width: Npx)') answer for a window this wide. Returns a restore function. */
export function setWidth(px) {
  const before = window.matchMedia;
  window.matchMedia = (query) => {
    const min = /min-width:\s*(\d+)px/.exec(query);
    const max = /max-width:\s*(\d+(?:\.\d+)?)px/.exec(query);
    const matches = (!min || px >= Number(min[1])) && (!max || px <= Number(max[1]));
    return { matches, media: query, onchange: null, addListener() {}, removeListener() {},
      addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } };
  };
  return () => { window.matchMedia = before; };
}
