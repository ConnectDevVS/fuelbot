import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { renderUi } from '../../test/render.jsx';
import { ProvisioningCard } from './ProvisioningCard.jsx';

const KEY = '7KQM-2XPA-9TRD-4WZC-HN3B';
/** The whole page's markup, attributes included (aria-labels carry values too). */
const markup = () => new XMLSerializer().serializeToString(document.body);

/** Holds the key in state like the pages do, and drops it on Done. */
function Holder() {
  const [key, setKey] = useState(KEY);
  if (!key) return <p>done</p>;
  return <ProvisioningCard tenantId="powerfuel" machineId="SHC816DJ" keyValue={key} onDone={() => setKey(null)} />;
}

describe('ProvisioningCard', () => {
  let writeText;
  beforeEach(() => {
    writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  });
  afterEach(() => { delete navigator.clipboard; });

  it('copies canonical values', async () => {
    renderUi(<Holder />, { dataRouter: true });
    // Shown grouped for reading…
    expect(screen.getByText('S H C 8 1 6 D J')).toBeTruthy();
    expect(screen.getByText('9TRD')).toBeTruthy();
    // …copied without the spacing.
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy machine_id.txt' })); });
    expect(writeText).toHaveBeenLastCalledWith('SHC816DJ');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy machine_key.txt' })); });
    expect(writeText).toHaveBeenLastCalledWith(KEY);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy tenant_id.txt' })); });
    expect(writeText).toHaveBeenLastCalledWith('powerfuel');
  });

  it('Done disabled until acknowledged', () => {
    renderUi(<Holder />, { dataRouter: true });
    const done = screen.getByRole('button', { name: 'Done' });
    expect(done.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: "I've written down or printed the key" }));
    expect(done.disabled).toBe(false);
  });

  it('unmount clears the key from the DOM and state', () => {
    const view = renderUi(<Holder />, { dataRouter: true });
    expect(document.body.textContent).toContain('HN3B');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByText('done')).toBeTruthy();
    expect(document.body.textContent).not.toContain('HN3B');
    expect(markup()).not.toContain('HN3B');
    view.unmount();
    expect(markup()).not.toContain('HN3B');
  });
});
