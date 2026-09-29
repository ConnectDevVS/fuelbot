// Record refill / Adjust (dashboard plan §5.6.3; SRV-41): the level of one hopper in whole grams
// (0–50,000) and an optional note. The server records the product that's on the hopper per the
// menu, so the dialog only shows it and never sends it. A bottom sheet on a phone
// (design/stock-refill-phone.png), from the right elsewhere. `stock:write` only (the caller hides it).
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Form, Input, InputNumber, Select } from 'antd';
import { api } from '../../api/client.js';
import { useToast } from '../../ui/dialogs.js';
import { Sheet } from '../../ui/Sheet.jsx';
import { FormError } from '../../ui/forms/FormError.jsx';
import { applyServerError } from '../../ui/forms/applyServerError.js';
import { formatCount } from '../../lib/money.js';
import { t } from '../../strings.js';
import styles from './stock.module.css';

export const MAX_LEVEL_G = 50000;

const wholeGrams = {
  validator: (_, v) => (v === null || v === undefined || (Number.isInteger(v) && v >= 0 && v <= MAX_LEVEL_G)
    ? Promise.resolve() : Promise.reject(new Error(t('level.range')))),
};

/**
 * open, mode: 'refill' | 'adjust'; tid, mid: the machine; hoppers: [{hopper, product_name}] on its
 * menu; hopper: the preset one; onClose(saved).
 */
export function RecordLevelDialog({ open, mode, tid, mid, hoppers, hopper, onClose }) {
  const [form] = Form.useForm();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState(null);
  const chosen = Form.useWatch('hopper', form) ?? hopper;
  const product = hoppers.find((h) => h.hopper === chosen);
  const path = `/tenants/${encodeURIComponent(tid)}/machines/${encodeURIComponent(mid)}/stock/${mode === 'adjust' ? 'adjustments' : 'refills'}`;

  const submit = async (values) => {
    setSaving(true);
    setProblem(null);
    const note = (values.note ?? '').trim();
    const body = { hopper: values.hopper, level_g: values.level_g, ...(note ? { note } : {}) };
    try {
      await api('POST', path, { body });
      // The machine's stock and history, the refill-soon lists (Home, Stock, Fleet): all under 'stock'.
      await queryClient.invalidateQueries({ queryKey: ['stock'] });
      toast.success(t('level.saved', { n: body.hopper, level: t('stock.grams', { n: formatCount(body.level_g) }) }));
      onClose(true);
    } catch (err) {
      setProblem(applyServerError(err, form));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onClose={() => onClose(false)} title={t(`level.title.${mode}`)}
      footer={(
        <div className={styles.dialogFooter}>
          <Button size="large" onClick={() => onClose(false)}>{t('action.cancel')}</Button>
          <Button size="large" type="primary" loading={saving} onClick={() => form.submit()}>{t(`level.save.${mode}`)}</Button>
        </div>
      )}>
      <Form form={form} layout="vertical" requiredMark={false} initialValues={{ hopper }} onFinish={submit}>
        <FormError problem={problem} form={form} />
        <Form.Item name="hopper" label={<span className="overline">{t('level.hopper')}</span>}
          extra={product ? t('level.product', { name: product.product_name ?? '—' }) : undefined}>
          <Select disabled={hoppers.length < 2}
            options={hoppers.map((h) => ({ value: h.hopper, label: `${h.hopper} · ${h.product_name ?? '—'}` }))} />
        </Form.Item>
        <Form.Item name="level_g" label={<span className="overline">{t(`level.level.${mode}`)}</span>}
          extra={t(`level.help.${mode}`)} rules={[{ required: true, message: t('level.required') }, wholeGrams]}>
          <InputNumber size="large" precision={0} min={0} max={MAX_LEVEL_G} suffix="g" inputMode="numeric"
            className={styles.level} autoFocus />
        </Form.Item>
        <Form.Item name="note" label={<span className="overline">{t('level.note')}</span>} rules={[{ max: 200 }]}>
          <Input maxLength={200} placeholder={t('level.notePlaceholder')} />
        </Form.Item>
      </Form>
    </Sheet>
  );
}
