import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderUi } from '../test/render.jsx';
import { ComplaintStatusChip } from './Chips.jsx';

describe('ComplaintStatusChip', () => {
  it('labels the three statuses', () => {
    for (const [status, label] of [['open', 'Open'], ['with_service', 'With service'], ['closed', 'Closed']]) {
      const { unmount } = renderUi(<ComplaintStatusChip status={status} />);
      expect(screen.getByText(label)).toBeTruthy();
      unmount();
    }
  });

  it('an unknown status reads as Open, never a raw code', () => {
    const { container } = renderUi(<ComplaintStatusChip status="pending" />);
    expect(container.textContent).toBe('Open');
  });
});
