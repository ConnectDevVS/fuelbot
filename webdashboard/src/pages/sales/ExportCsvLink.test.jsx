import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderUi } from '../../test/render.jsx';
import { ExportCsvLink } from './ExportCsvLink.jsx';

describe('ExportCsvLink', () => {
  it('carries the filters, never limit or cursor', () => {
    const params = new URLSearchParams({ from: '2026-09-01T00:00:00+05:30', to: '2026-09-29T00:00:00+05:30', tenant: 'powerfuel',
      machine: 'DEV00001', dispensed: 'false', limit: '50', cursor: 'abc', group: 'day' });
    renderUi(<ExportCsvLink params={params} />);
    const link = screen.getByRole('link', { name: /Export CSV/ });
    const url = new URL(link.getAttribute('href'), 'http://x');
    expect(url.pathname).toBe('/api/v1/sales/export.csv');
    expect(Object.fromEntries(url.searchParams)).toEqual({ from: '2026-09-01T00:00:00+05:30', to: '2026-09-29T00:00:00+05:30',
      tenant: 'powerfuel', machine: 'DEV00001', dispensed: 'false' });
    expect(link.hasAttribute('download')).toBe(true);
  });
});
