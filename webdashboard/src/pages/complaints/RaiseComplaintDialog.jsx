// Raise a complaint (dashboard plan §5.20; SRV-52): a title and a description, plain text. A bottom
// sheet on a phone, from the right elsewhere. Closing with text typed asks first (nothing is kept).
import { useState } from 'react';
import { Button, Form, Input } from 'antd';
import { api } from '../../api/client.js';
import { Sheet } from '../../ui/Sheet.jsx';
import { useConfirm } from '../../ui/dialogs.js';
import { FormError } from '../../ui/forms/FormError.jsx';
import { applyServerError } from '../../ui/forms/applyServerError.js';
import { t } from '../../strings.js';
import styles from './complaints.module.css';

export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 4000;

const trimmedLength = (min, max, message) => ({
  validator: (_, v) => {
    const n = (v ?? '').trim().length;
    return n >= min && n <= max ? Promise.resolve() : Promise.reject(new Error(message));
  },
});

/** open, tid; onClose(complaint | undefined). */
export function RaiseComplaintDialog({ open, tid, onClose }) {
  const [form] = Form.useForm();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);

  const close = async () => {
    const { title, description } = form.getFieldsValue();
    if ((title ?? '').trim() || (description ?? '').trim()) {
      if (!(await confirm('discardComplaint'))) return;
    }
    form.resetFields();
    setProblem(null);
    onClose();
  };
  const submit = async (v) => {
    setBusy(true);
    setProblem(null);
    try {
      const { complaint } = await api('POST', `/tenants/${encodeURIComponent(tid)}/complaints`,
        { body: { title: v.title.trim(), description: v.description.trim() } });
      form.resetFields();
      onClose(complaint);
    } catch (err) {
      setProblem(applyServerError(err, form));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={close} title={t('complaints.raise.title')}
      footer={(
        <div className={styles.footer}>
          <Button size="large" onClick={close}>{t('action.cancel')}</Button>
          <Button size="large" type="primary" loading={busy} onClick={() => form.submit()}>{t('complaints.raise.submit')}</Button>
        </div>
      )}>
      <p className={styles.lead}>{t('complaints.raise.lead')}</p>
      <Form form={form} layout="vertical" requiredMark={false} onFinish={submit}>
        <FormError problem={problem} form={form} />
        <Form.Item name="title" label={t('complaints.raise.titleLabel')} extra={t('complaints.raise.titleHelp')}
          rules={[trimmedLength(3, TITLE_MAX, t('complaints.raise.titleRule'))]}>
          <Input maxLength={TITLE_MAX} showCount autoFocus />
        </Form.Item>
        <Form.Item name="description" label={t('complaints.raise.description')} extra={t('complaints.raise.descriptionHelp')}
          className={styles.counted}
          rules={[trimmedLength(1, DESCRIPTION_MAX, t('complaints.raise.descriptionRule'))]}>
          <Input.TextArea rows={8} maxLength={DESCRIPTION_MAX} showCount />
        </Form.Item>
      </Form>
    </Sheet>
  );
}
