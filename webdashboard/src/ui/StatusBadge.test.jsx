import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderUi } from '../test/render.jsx';
import { StatusBadge } from './Chips.jsx';

// As captured from /api/v1/fleet (DEV00001 with an open HOMING_TIMEOUT), per view.
const TENANT_VIEW = {
  id: 'DEV00001', tenant_id: 'powerfuel', name: 'Bay 02', location_label: 'FUELBOT · BAY 02', disabled: false,
  configured: true, last_seen_at: '2026-09-28T07:10:00Z', online: true, in_service: false,
};
const PLATFORM_VIEW = {
  ...TENANT_VIEW, status: 'fault', faults: [{ code: 'HOMING_TIMEOUT', since: '2026-09-28T04:12:00Z' }],
  maintenance: { enabled: false, message: '', flagged_by: null, flagged_at: null, faults: [] }, last_seen_ip: '10.0.0.7',
};

describe('StatusBadge', () => {
  it('tenant machine view never renders a platform status', () => {
    const { container } = renderUi(<StatusBadge machine={TENANT_VIEW} />);
    expect(screen.getByText('Online')).toBeTruthy();
    expect(screen.getByText('Out of service')).toBeTruthy();
    expect(container.textContent).not.toMatch(/fault|homing|maintenance/i);
  });

  it('platform view shows FAULT and the code', () => {
    renderUi(<StatusBadge machine={PLATFORM_VIEW} />);
    expect(screen.getByText('Fault')).toBeTruthy();
    expect(screen.getByText('HOMING_TIMEOUT since 09:42 IST')).toBeTruthy();
    expect(screen.queryByText('Online')).toBeNull();
  });

  it('adds Disabled and Not configured from either view', () => {
    renderUi(<StatusBadge machine={{ ...TENANT_VIEW, online: false, in_service: true, disabled: true, configured: false }} />);
    for (const text of ['Offline', 'In service', 'Disabled', 'Not configured']) expect(screen.getByText(text)).toBeTruthy();
  });
});
