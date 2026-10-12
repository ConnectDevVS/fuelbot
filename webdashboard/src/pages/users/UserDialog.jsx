// Create / edit a user, or reset their password (dashboard plan §5.12; SRV-46). Roles offered:
// tenant roles (a tenant admin's own tenant); staff also platform_admin (no tenant), and pick the
// tenant for a tenant role. Machines only for operator / viewer (empty = all). Editing never
// crosses platform ↔ tenant, and your own row can't change role (the server says forbidden_self).
// Server errors map to fields (DP §7 users codes via applyServerError).
import { useState } from 'react';
import { Button, Form, Input, Modal, Select } from 'antd';
import { api } from '../../api/client.js';
import { FormError } from '../../ui/forms/FormError.jsx';
import { applyServerError } from '../../ui/forms/applyServerError.js';
import { machineName, useMachines } from '../../lib/names.js';
import { TempPasswordField } from './TempPasswordField.jsx';
import { t } from '../../strings.js';

export const TENANT_ROLES = ['tenant_admin', 'operator', 'viewer'];
export const MACHINE_ROLES = ['operator', 'viewer'];

/**
 * mode: 'create' | 'edit' | 'reset'. user (edit/reset). tid: the page's tenant (null on staff's
 * /users). staff: may create platform_admin and pick tenants. tenants: [{id, name}] (staff).
 * self: the user is the signed-in one. onClose(saved user | undefined).
 */
export function UserDialog({ mode, user, tid, staff, tenants = [], self = false, onClose }) {
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const role = Form.useWatch('role', form) ?? user?.role;
  const tenantId = Form.useWatch('tenant_id', form) ?? user?.tenant_id ?? tid;
  const machines = useMachines(MACHINE_ROLES.includes(role) ? tenantId : null);
  const platformUser = user?.role === 'platform_admin';

  const roleOptions = (() => {
    if (mode === 'edit') return platformUser ? ['platform_admin'] : TENANT_ROLES;   // never across scopes
    return staff ? [...TENANT_ROLES, 'platform_admin'] : TENANT_ROLES;
  })().map((r) => ({ value: r, label: t(`role.${r}`) }));

  const submit = async (v) => {
    setBusy(true);
    setProblem(null);
    try {
      let saved;
      if (mode === 'create') {
        const tenantRole = TENANT_ROLES.includes(v.role);
        saved = (await api('POST', '/users', { body: {
          email: v.email.trim(), name: (v.name ?? '').trim(), role: v.role, password: v.password,
          ...(tenantRole ? { tenant_id: tid ?? v.tenant_id } : {}),
          ...(MACHINE_ROLES.includes(v.role) ? { machines: v.machines ?? [] } : {}),
        } })).user;
      } else if (mode === 'edit') {
        saved = (await api('PATCH', `/users/${encodeURIComponent(user.id)}`, { body: {
          name: (v.name ?? '').trim(),
          ...(self ? {} : { role: v.role }),
          ...(!self && MACHINE_ROLES.includes(v.role) ? { machines: v.machines ?? [] } : {}),
        } })).user;
      } else {
        saved = (await api('POST', `/users/${encodeURIComponent(user.id)}/password`, { body: { password: v.password } })).user;
      }
      form.resetFields();   // the temporary password leaves the form with the dialog
      onClose(saved);
    } catch (err) {
      setProblem(applyServerError(err, form));
    } finally {
      setBusy(false);
    }
  };

  const title = mode === 'create' ? t('users.dialog.new')
    : t(mode === 'edit' ? 'users.dialog.edit' : 'users.dialog.reset', { name: user?.name || user?.email });
  const ok = t(mode === 'create' ? 'users.create' : mode === 'edit' ? 'users.save' : 'users.resetSave');

  return (
    <Modal open title={title} onCancel={() => onClose()} destroyOnHidden width={560}
      footer={[
        <Button key="cancel" onClick={() => onClose()}>{t('action.cancel')}</Button>,
        <Button key="ok" type="primary" loading={busy} onClick={() => form.submit()}>{ok}</Button>,
      ]}>
      <Form form={form} layout="vertical" requiredMark={false} onFinish={submit}
        initialValues={{ email: user?.email ?? '', name: user?.name ?? '', role: user?.role ?? 'operator',
          tenant_id: user?.tenant_id ?? tid ?? undefined, machines: user?.machines ?? [], password: '' }}>
        <FormError problem={problem} form={form} />
        {mode !== 'reset' && (
          <>
            <Form.Item name="email" label={t('users.email')} rules={[{ required: true, message: t('error.invalid_email') }]}>
              <Input type="email" disabled={mode !== 'create'} autoComplete="off" />
            </Form.Item>
            <Form.Item name="name" label={t('users.name')} rules={[{ max: 100 }]}>
              <Input />
            </Form.Item>
            {self ? <p>{t('users.selfNote')}</p> : (
              <Form.Item name="role" label={t('users.role')}>
                <Select options={roleOptions} />
              </Form.Item>
            )}
            {mode === 'create' && staff && !tid && TENANT_ROLES.includes(role) && (
              <Form.Item name="tenant_id" label={t('users.userTenant')} rules={[{ required: true, message: t('error.unknown_tenant') }]}>
                <Select showSearch={{ optionFilterProp: 'label' }} options={tenants.map((x) => ({ value: x.id, label: x.name }))} />
              </Form.Item>
            )}
            {!self && MACHINE_ROLES.includes(role) && (
              <Form.Item name="machines" label={t('users.machines')} extra={t('users.machines.help')}>
                <Select mode="multiple" allowClear placeholder={t('users.allMachines')} loading={machines.isPending}
                  options={(machines.data ?? []).map((m) => ({ value: m.id, label: `${machineName(m)} · ${m.id}` }))} />
              </Form.Item>
            )}
          </>
        )}
        {mode !== 'edit' && (
          <Form.Item name="password" label={t('temp.label')} rules={[{ required: true, message: t('temp.required') }]}>
            <TempPasswordField />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}
