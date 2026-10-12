import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { renderUi } from '../test/render.jsx';
import { CopyField } from './Id.jsx';

describe('CopyField', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('copies the canonical value', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    renderUi(<CopyField value="SHC816DJ" display="S H C 8 1 6 D J" label="machine_id.txt" />);
    expect(screen.getByText('S H C 8 1 6 D J')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy machine_id.txt' })); });
    expect(writeText).toHaveBeenCalledWith('SHC816DJ');
    expect(screen.getByText('Copied')).toBeTruthy();
  });

  it('selects the value when the clipboard is refused', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn(async () => { throw new Error('denied'); }) } });
    renderUi(<CopyField value="7KQM2XPA9TRD4WZCHN3B" display="7KQM - 2XPA - 9TRD - 4WZC - HN3B" />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy' })); });
    expect(window.getSelection().toString()).toBe('7KQM - 2XPA - 9TRD - 4WZC - HN3B');
    expect(screen.queryByText('Copied')).toBeNull();
  });
});
