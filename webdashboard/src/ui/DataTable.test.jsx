import { afterEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderUi, setWidth } from '../test/render.jsx';
import { DataTable } from './DataTable.jsx';

const COLUMNS = [
  { key: 'name', title: 'Machine', priority: 1 },
  { key: 'revenue', title: 'Today', priority: 2, align: 'right' },
  { key: 'site', title: 'Site', priority: 3 },
];
const ROWS = [{ id: 'DEV00001', name: 'Bay 02', revenue: '₹1,705', site: 'Ground floor' }];

describe('DataTable', () => {
  let restore;
  afterEach(() => restore?.());

  it('renders antd Table ≥ 760 px and cards below', () => {
    restore = setWidth(1024);
    const wide = renderUi(<DataTable columns={COLUMNS} rows={ROWS} rowHref={(r) => `/t/powerfuel/machines/${r.id}`} />);
    expect(wide.container.querySelector('table')).not.toBeNull();
    expect(screen.getByText('Ground floor')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Bay 02' }).getAttribute('href')).toBe('/t/powerfuel/machines/DEV00001');
    wide.unmount();
    restore();

    restore = setWidth(390);
    const phone = renderUi(<DataTable columns={COLUMNS} rows={ROWS} rowHref={(r) => `/t/powerfuel/machines/${r.id}`} />);
    expect(phone.container.querySelector('table')).toBeNull();
    expect(phone.container.querySelector('.ant-card')).not.toBeNull();
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('₹1,705')).toBeTruthy();
    expect(screen.queryByText('Ground floor')).toBeNull();   // priority 3: tablet and up only
    expect(screen.getByRole('link', { name: 'Bay 02' })).toBeTruthy();
  });

  it('shows priority 4 on desktop only, and marks every row and card with data-row', () => {
    const columns = [...COLUMNS, { key: 'location', title: 'Location', priority: 4 }];
    const rows = [{ ...ROWS[0], location: 'FUELBOT · BAY 02' }];
    for (const [width, shown] of [[1440, true], [1024, false]]) {
      restore = setWidth(width);
      const view = renderUi(<DataTable columns={columns} rows={rows} />);
      expect(Boolean(screen.queryByText('FUELBOT · BAY 02')), `${width}`).toBe(shown);
      expect(view.container.querySelector('tr[data-row="DEV00001"]')).not.toBeNull();
      view.unmount();
      restore();
    }
    restore = setWidth(390);
    const phone = renderUi(<DataTable columns={columns} rows={rows} />);
    expect(phone.container.querySelector('.ant-card[data-row="DEV00001"]')).not.toBeNull();
  });

  it('leaves an empty value out of a phone card', () => {
    restore = setWidth(390);
    const columns = [COLUMNS[0], { key: 'status', title: 'Status', priority: 2, render: (r) => (r.archived ? 'Archived' : null) }];
    renderUi(<DataTable columns={columns} rows={[{ id: 'a', name: 'Guava' }, { id: 'b', name: 'Kiwi', archived: true }]} />);
    expect(screen.getAllByText('Status')).toHaveLength(1);
    expect(screen.getByText('Archived')).toBeTruthy();
  });
});
