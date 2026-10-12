// Change password (dashboard plan §5.1): forced (a temporary password: shown alone, no navigation,
// sign out available) or voluntary (from the account menu). Passwords stay in the form only.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Form, Input } from 'antd';
import styles from './auth.module.css';
import { Brand } from './Brand.jsx';
import { changePassword, signOut, useMe } from './session.js';
import { landingPath } from './redirect.js';
import { messageFor } from '../api/errors.js';
import { ApiError } from '../api/client.js';
import { t } from '../strings.js';

const FIELD_OF = { wrong_password: 'current', same_password: 'new', weak_password: 'new' };
const MIN = 10;

export default function ChangePasswordPage() {
  const { data: me } = useMe();
  const forced = Boolean(me?.user.must_change_password);
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(values) {
    setBusy(true);
    setError(null);
    try {
      const next = await changePassword(queryClient, values.current, values.new);
      form.resetFields();
      if (!forced) message.success(t('password.changed'));
      navigate(landingPath(next), { replace: true });
    } catch (err) {
      const field = err instanceof ApiError ? FIELD_OF[err.code] : undefined;
      if (field) form.setFields([{ name: field, errors: [messageFor(err)] }]);
      else setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    await signOut(queryClient);
    navigate('/sign-in', { replace: true });
  }

  return (
    <div className={styles.screen}>
      <main className={styles.card}>
        <Brand />
        <h1 className="page-title">{t(forced ? 'password.title.forced' : 'password.title')}</h1>
        <p className={styles.lead}>{t(forced ? 'password.forced.lead' : 'password.voluntary.lead')}</p>
        <Form form={form} layout="vertical" requiredMark={false} onFinish={submit} disabled={busy}>
          <Form.Item name="current" label={t(forced ? 'password.current.forced' : 'password.current')}
            rules={[{ required: true, message: t('signin.required.password') }]}>
            <Input.Password autoComplete="current-password" size="large" autoFocus />
          </Form.Item>
          <Form.Item name="new" label={t('password.new')} extra={t('password.rule')}
            rules={[{ required: true, min: MIN, message: t('password.rule') }]}>
            <Input.Password autoComplete="new-password" size="large" />
          </Form.Item>
          <Form.Item name="repeat" label={t('password.repeat')} dependencies={['new']}
            rules={[{ required: true, message: t('password.mismatch') },
              ({ getFieldValue }) => ({
                validator: (_, value) => (!value || value === getFieldValue('new')
                  ? Promise.resolve() : Promise.reject(new Error(t('password.mismatch')))),
              })]}>
            <Input.Password autoComplete="new-password" size="large" />
          </Form.Item>
          {error && <Alert type="error" showIcon title={error} role="alert" className="form-alert" />}
          <Button type="primary" htmlType="submit" size="large" block loading={busy}>{t('password.submit')}</Button>
        </Form>
        {forced
          ? <Button type="link" onClick={leave}>{t('account.signout')}</Button>
          : <Button type="link" onClick={() => navigate(-1)}>{t('password.back')}</Button>}
      </main>
    </div>
  );
}
