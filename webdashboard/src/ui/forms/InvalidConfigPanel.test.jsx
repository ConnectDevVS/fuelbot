import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { ApiError } from '../../api/client.js';
import { renderUi } from '../../test/render.jsx';
import { InvalidConfigPanel } from './InvalidConfigPanel.jsx';

describe('InvalidConfigPanel', () => {
  it("lists each machine's app errors", () => {
    // As captured: PATCH a product's hopper clash on two machines → 422.
    const error = new ApiError(422, 'invalid_config', [
      { machine_id: 'DEV00001', errors: ['chocolate: hopper 1 already used by guava'] },
      { machine_id: 'E2E00002', errors: ['chocolate: hopper 1 already used by guava', 'guava: actual_price must be > 0'] },
    ]);
    const machines = [{ id: 'DEV00001', name: 'Bay 02' }, { id: 'E2E00002', name: '', location_label: 'FUELBOT · BAY 03' }];
    renderUi(<InvalidConfigPanel error={error} machines={machines} />);
    expect(screen.getByText('The machine would reject this')).toBeTruthy();
    expect(screen.getByText('Bay 02')).toBeTruthy();
    expect(screen.getByText('FUELBOT · BAY 03')).toBeTruthy();
    expect(screen.getAllByText('chocolate: hopper 1 already used by guava')).toHaveLength(2);
    expect(screen.getByText('guava: actual_price must be > 0')).toBeTruthy();
    expect(screen.getByText('Nothing was saved.')).toBeTruthy();
  });

  it('renders nothing for other errors', () => {
    const { container } = renderUi(<InvalidConfigPanel error={new ApiError(409, 'version_conflict')} />);
    expect(container.textContent).toBe('');
  });
});
