// New tenant (dashboard plan §5.14): id (a slug that goes into every machine's tenant_id.txt and can't
// change), name, and optional kiosk branding. 409 tenant_exists → "That id is taken" on the id.
import { useState } from 'react';
import { Button, Form, Input, Modal } from 'antd';
import { api } from '../../api/client.js';
import { FormError } from '../../ui/forms/FormError.jsx';
import { applyServerError } from '../../ui/forms/applyServerError.js';
import { t } from '../../strings.js';

export function NewTenantDialog({ onClose }) {
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const submit = async (v) => {
    setBusy(true);
    setProblem(null);
    const branding = Object.fromEntries(Object.entries({ display_name: v.display_name, logo_text: v.logo_text })
      .map(([k, x]) => [k, (x ?? '').trim()]).filter(([, x]) => x));
    try {
      const { tenant } = await api('POST', '/tenants', { body: { id: v.id.trim(), name: v.name.trim(),
        ...(Object.keys(branding).length ? { branding } : {}) } });
      onClose(tenant);
    } catch (err) {
      setProblem(applyServerError(err, form));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open title={t('tenants.new')} onCancel={() => onClose()} destroyOnHidden
      footer={[
        <Button key="cancel" onClick={() => onClose()}>{t('action.cancel')}</Button>,
        <Button key="ok" type="primary" loading={busy} onClick={() => form.submit()}>{t('tenants.create')}</Button>,
      ]}>
      <Form form={form} layout="vertical" requiredMark={false} onFinish={submit}>
        <FormError problem={problem} form={form} />
        <Form.Item name="id" label={t('tenants.id')} extra={t('tenants.id.help')}
          rules={[{ required: true, message: t('tenants.id.required') }, { pattern: /^[a-z0-9][a-z0-9_-]{0,39}$/, message: t('tenants.id.help') }]}>
          <Input maxLength={40} className="mono" autoComplete="off" />
        </Form.Item>
        <Form.Item name="name" label={t('tenants.name')} rules={[{ required: true, whitespace: true, message: t('tenants.name.required') }, { max: 100 }]}>
          <Input maxLength={100} />
        </Form.Item>
        <Form.Item name="display_name" label={t('tenants.display')} rules={[{ max: 60 }]}>
          <Input maxLength={60} />
        </Form.Item>
        <Form.Item name="logo_text" label={t('tenants.logo')} rules={[{ max: 4, message: t('company.logoMax') }]}>
          <Input />
        </Form.Item>
      </Form>
    </Modal>
  );
}
