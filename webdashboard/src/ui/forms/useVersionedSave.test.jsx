import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { Button, Form, Input } from 'antd';
import { ApiError } from '../../api/client.js';
import { renderUi } from '../../test/render.jsx';
import { useVersionedSave } from './useVersionedSave.jsx';
import { FormError } from './FormError.jsx';

const INITIAL = { name: 'Prymor Guava', description: 'Fruity' };
const THEIRS = { id: 'guava', name: 'Guava (new)', description: 'Fruity', rev: 4 };

function Editor({ save, fetchCurrent = async () => THEIRS, onDiscard }) {
  const [form] = Form.useForm();
  const saver = useVersionedSave({
    form, initial: INITIAL, version: 3,
    fields: [{ name: 'name', label: 'Name' }, { name: 'description', label: 'Description' }],
    fetchCurrent, valuesOf: (p) => ({ name: p.name, description: p.description }), versionOf: (p) => p.rev,
    save, success: 'Saved', onDiscard: (p) => { form.setFieldsValue({ name: p.name, description: p.description }); onDiscard?.(p); },
  });
  return (
    <Form form={form} initialValues={INITIAL} onFinish={saver.submit}>
      <FormError problem={saver.problem} form={form} />
      <Form.Item name="name" label="Name"><Input /></Form.Item>
      <Form.Item name="description" label="Description"><Input /></Form.Item>
      <Button htmlType="submit">Save</Button>
    </Form>
  );
}

async function editDescriptionAndSave(text = 'Tangy') {
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: text } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })); });
}

describe('useVersionedSave', () => {
  it('sends If-Match', async () => {
    const save = vi.fn(async (values, version) => ({ ...values, rev: version + 1 }));
    renderUi(<Editor save={save} />);
    await editDescriptionAndSave();
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith({ name: 'Prymor Guava', description: 'Tangy' }, 3);
    expect(await screen.findByText('Saved')).toBeTruthy();
  });

  it('409 opens the conflict dialog with changed fields', async () => {
    const save = vi.fn(async () => { throw new ApiError(409, 'version_conflict', { current: 4 }); });
    renderUi(<Editor save={save} />);
    await editDescriptionAndSave();
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('Someone else changed this since you opened it.');
    const rows = [...dialog.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((td) => td.textContent));
    expect(rows).toEqual([['Name', 'Guava (new)', 'Prymor Guava'], ['Description', 'Fruity', 'Tangy']]);
  });

  it('Keep mine re-saves with the new version', async () => {
    const save = vi.fn()
      .mockImplementationOnce(async () => { throw new ApiError(409, 'version_conflict', { current: 4 }); })
      .mockImplementationOnce(async (values, version) => ({ ...values, rev: version + 1 }));
    renderUi(<Editor save={save} />);
    await editDescriptionAndSave();
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: 'Keep my changes' })); });
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    // Their name (you didn't touch it) + your description, at their version.
    expect(save).toHaveBeenLastCalledWith({ name: 'Guava (new)', description: 'Tangy' }, 4);
  });

  it('Discard mine takes theirs', async () => {
    const save = vi.fn(async () => { throw new ApiError(409, 'version_conflict', { current: 4 }); });
    const onDiscard = vi.fn();
    renderUi(<Editor save={save} onDiscard={onDiscard} />);
    await editDescriptionAndSave();
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: 'Discard mine' })); });
    expect(onDiscard).toHaveBeenCalledWith(THEIRS);
    expect(screen.getByLabelText('Name').value).toBe('Guava (new)');
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('a new save clears the last attempt\'s field errors', async () => {
    const save = vi.fn()
      .mockImplementationOnce(async () => { throw new ApiError(400, 'invalid_body', [{ field: 'name', error: 'too long' }]); })
      .mockImplementationOnce(async (values, version) => ({ ...values, rev: version + 1 }));
    renderUi(<Editor save={save} />);
    await editDescriptionAndSave('One');
    expect(await screen.findByText('too long', { selector: '.ant-form-item-explain-error' })).toBeTruthy();
    await editDescriptionAndSave('Two');
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('too long', { selector: '.ant-form-item-explain-error' })).toBeNull());
  });

  it('428 shows the generic error', async () => {
    const save = vi.fn(async () => { throw new ApiError(428, 'if_match_required'); });
    renderUi(<Editor save={save} />);
    await editDescriptionAndSave();
    expect((await screen.findByRole('alert')).textContent).toContain('Something went wrong. Reload the page');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
