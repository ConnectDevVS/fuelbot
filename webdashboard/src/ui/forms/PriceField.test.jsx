import { describe, expect, it } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { Button, Form } from 'antd';
import { renderUi } from '../../test/render.jsx';
import { PriceField, priceRules } from './PriceField.jsx';

function PriceForm({ editable, onFinish }) {
  return (
    <Form initialValues={{ actual_price: 90, offer_price: 75 }} onFinish={onFinish}>
      <Form.Item name="actual_price" label="Price" rules={priceRules({ required: true })}><PriceField editable={editable} /></Form.Item>
      <Form.Item name="offer_price" label="Offer" rules={priceRules()}><PriceField editable={editable} /></Form.Item>
      <Button htmlType="submit">Save</Button>
    </Form>
  );
}

describe('PriceField', () => {
  it('read-only without price:write and still reports its value', async () => {
    let sent;
    renderUi(<PriceForm editable={false} onFinish={(v) => { sent = v; }} />);
    expect(screen.getByText('₹90')).toBeTruthy();
    expect(screen.getByText('₹75')).toBeTruthy();
    expect(screen.queryByRole('spinbutton')).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })); });
    expect(sent).toEqual({ actual_price: 90, offer_price: 75 });
  });

  it('editable: required, whole rupees, sent as numbers', async () => {
    let sent;
    renderUi(<PriceForm editable onFinish={(v) => { sent = v; }} />);
    const [price] = screen.getAllByRole('spinbutton');
    expect(price.getAttribute('aria-valuemin')).toBe('1');   // the input itself refuses 0 and decimals
    fireEvent.change(price, { target: { value: '' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })); });
    expect(await screen.findByText('Enter a price')).toBeTruthy();
    expect(sent).toBeUndefined();
    fireEvent.change(price, { target: { value: '95' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })); });
    expect(sent).toEqual({ actual_price: 95, offer_price: 75 });
    expect(typeof sent.actual_price).toBe('number');
  });
});
