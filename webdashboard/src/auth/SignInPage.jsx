// Sign in (dashboard plan §5.1). The password stays in the form only: it's sent once, never kept
// in our state, the query cache, the URL or storage, and the field is cleared after a failure.
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Form, Input } from 'antd';
import styles from './auth.module.css';
import { Brand } from './Brand.jsx';
import { signIn } from './session.js';
import { landingPath, safeNext } from './redirect.js';
import { messageFor } from '../api/errors.js';
import { ApiError } from '../api/client.js';
import { t } from '../strings.js';
import { envLabel } from '../envLabel.js';

export default function SignInPage() {
  const [form] = Form.useForm();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(params.get('reason') === 'tenant_disabled' ? t('error.tenant_disabled') : null);

  async function submit({ email, password }) {
    setBusy(true);
    setError(null);
    try {
      const me = await signIn(queryClient, email.trim(), password);
      if (me.user.must_change_password) navigate('/change-password', { replace: true });
      else navigate(safeNext(params.get('next')) ?? landingPath(me), { replace: true });
    } catch (err) {
      setError(messageFor(err instanceof ApiError ? err : null));
      form.setFieldValue('password', '');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.screen}>
      <main className={styles.card}>
        <Brand />
        <h1 className="page-title">{t('signin.title')}</h1>
        <Form form={form} layout="vertical" requiredMark={false} onFinish={submit} disabled={busy}>
          <Form.Item name="email" label={t('signin.email')} rules={[{ required: true, message: t('signin.required.email') }]}>
            <Input type="email" autoComplete="username" inputMode="email" size="large" autoFocus />
          </Form.Item>
          <Form.Item name="password" label={t('signin.password')} rules={[{ required: true, message: t('signin.required.password') }]}>
            <Input.Password autoComplete="current-password" size="large" />
          </Form.Item>
          {error && <Alert type="error" showIcon title={error} role="alert" className="form-alert" />}
          <Button type="primary" htmlType="submit" size="large" block loading={busy}>{t('signin.submit')}</Button>
        </Form>
        <div className={`overline ${styles.footer}`}>{t('brand.footer')}</div>
      </main>
      {envLabel && <div className={styles.envTag} role="note" aria-label={t('signin.env', { label: envLabel })}>{envLabel}</div>}
    </div>
  );
}
