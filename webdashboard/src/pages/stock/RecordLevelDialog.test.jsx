import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderUi } from '../../test/render.jsx';

const calls = [];
vi.mock('../../api/client.js', async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(async (method, path, options) => { calls.push({ method, path, body: options?.body }); return { event: {} }; }),
}));
const { RecordLevelDialog } = await import('./RecordLevelDialog.jsx');

const HOPPERS = [{ hopper: 1, product_name: 'Prymor Guava' }, { hopper: 2, product_name: 'MMN Chocolate' }];

function open(mode = 'refill', onClose = vi.fn()) {
  renderUi(<RecordLevelDialog open mode={mode} tid="powerfuel" mid="DEV00001" hoppers={HOPPERS} hopper={2} onClose={onClose} />);
  return onClose;
}

async function enter(value) {
  const input = screen.getByLabelText(/Level/);
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Save/ })); });
}

describe('RecordLevelDialog', () => {
  beforeEach(() => { calls.length = 0; });

  it('validates 0–50000 whole grams; sends numbers; never sends product_id', async () => {
    const onClose = open();
    expect(screen.getByText('Product in this hopper: MMN Chocolate (from the menu).')).toBeTruthy();
    await enter('');
    expect(await screen.findByText('Enter the level in grams')).toBeTruthy();
    await enter('60000');   // clamped to the max by the input, still valid: 50,000
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toEqual({ hopper: 2, level_g: 50000 });
    calls.length = 0;

    await enter('2000');
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({ method: 'POST', path: '/tenants/powerfuel/machines/DEV00001/stock/refills', body: { hopper: 2, level_g: 2000 } });
    expect(typeof calls[0].body.level_g).toBe('number');
    expect(calls[0].body).not.toHaveProperty('product_id');
    await waitFor(() => expect(onClose).toHaveBeenCalledWith(true));
  });

  it('adjust posts to adjustments with the note', async () => {
    open('adjust');
    fireEvent.change(screen.getByPlaceholderText('e.g. new bag'), { target: { value: '  weighed  ' } });
    await enter('1234');
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].path).toMatch(/\/stock\/adjustments$/);
    expect(calls[0].body).toEqual({ hopper: 2, level_g: 1234, note: 'weighed' });
  });
});
