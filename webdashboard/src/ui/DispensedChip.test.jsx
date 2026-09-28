import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderUi } from '../test/render.jsx';
import { DispensedChip, StockChip } from './Chips.jsx';

describe('DispensedChip', () => {
  it('shows reasons only when present', () => {
    const tenant = renderUi(<DispensedChip sale={{ order_id: 'a2', dispensed: false }} />);
    expect(screen.getByText('Not dispensed')).toBeTruthy();
    expect(tenant.container.textContent).toBe('Not dispensed');
    tenant.unmount();

    renderUi(<DispensedChip sale={{ order_id: 'a2', dispensed: false, dispensing_result: 'timeout', dispensing_reason: 'deadline' }} />);
    expect(screen.getByText('Not dispensed')).toBeTruthy();
    expect(screen.getByText('timeout · deadline')).toBeTruthy();
  });

  it('dispensed sales and stock states read as words', () => {
    renderUi(<><DispensedChip sale={{ dispensed: true }} /><StockChip state="refill_needed" /><StockChip state="weird" /></>);
    expect(screen.getByText('Dispensed')).toBeTruthy();
    expect(screen.getByText('Refill needed')).toBeTruthy();
    expect(screen.getByText('Unknown')).toBeTruthy();
  });
});
