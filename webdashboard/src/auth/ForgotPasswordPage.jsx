// Forgot password, step 1 (dashboard plan §5.1; S11, SRV-58): the email. The server answers the same
// for any email and mails a code to an active account; the reset page gets the email in router
// state (never the URL).
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Alert, Button, Form, Input } from 'antd';
import styles from './auth.module.css';
import { Brand } from './Brand.jsx';
import { requestResetCode } from './session.js';
import { messageFor } from '../api/errors.js';
import { t } from '../strings.js';

export default function ForgotPasswordPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit({ email }) {
    setBusy(true);
    setError(null);
    try {
      await requestResetCode(email.trim());
      navigate('/reset-password', { state: { email: email.trim() } });
    } catch (err) {
      setError(messageFor(err));
      setBusy(false);
    }
  }

  return (
    <div className={styles.screen}>
      <main className={styles.card}>
        <Brand />
        <h1 className="page-title">{t('forgot.title')}</h1>
        <p className={styles.lead}>{t('forgot.lead')}</p>
        <Form layout="vertical" requiredMark={false} onFinish={submit} disabled={busy}
          initialValues={{ email: location.state?.email ?? '' }}>
          <Form.Item name="email" label={t('signin.email')} rules={[{ required: true, message: t('signin.required.email') }]}>
            <Input type="email" autoComplete="username" inputMode="email" size="large" autoFocus />
          </Form.Item>
          {error && <Alert type="error" showIcon title={error} role="alert" className="form-alert" />}
          <Button type="primary" htmlType="submit" size="large" block loading={busy}>{t('forgot.submit')}</Button>
        </Form>
        <Button type="link" onClick={() => navigate('/sign-in')}>{t('forgot.back')}</Button>
      </main>
    </div>
  );
}
