// Forgot password, step 2 (dashboard plan §5.1; S11, SRV-58): new password, repeat, and the emailed
// code, in that order (product owner). Success says so and returns to sign-in after 3 seconds (the reset doesn't sign in). The
// email comes in router state; without it (a reload, a pasted URL) this goes back to step 1.
// Passwords and the code stay in the form only.
import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Alert, Button, Form, Input } from 'antd';
import styles from './auth.module.css';
import { Brand } from './Brand.jsx';
import { CodeInput, CODE_LENGTH, useCooldown } from './CodeField.jsx';
import { requestResetCode, resetPassword } from './session.js';
import { messageFor } from '../api/errors.js';
import { ApiError } from '../api/client.js';
import { t } from '../strings.js';

const FIELD_OF = { invalid_code: 'code', weak_password: 'new' };
const MIN = 10;
export const BACK_AFTER_MS = 3000;

export default function ResetPasswordPage() {
  const email = useLocation().state?.email;
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const [resent, setResent] = useState(false);
  const cooldown = useCooldown(60, { startNow: true });   // step 1 just sent the code

  useEffect(() => {
    if (!done) return undefined;
    const id = setTimeout(() => navigate('/sign-in', { replace: true }), BACK_AFTER_MS);
    return () => clearTimeout(id);
  }, [done, navigate]);

  if (!email) return <Navigate to="/forgot-password" replace />;

  async function submit(values) {
    setBusy(true);
    setError(null);
    try {
      await resetPassword(email, values.code, values.new);
      form.resetFields();
      setDone(true);
    } catch (err) {
      const field = err instanceof ApiError ? FIELD_OF[err.code] : undefined;
      if (field) form.setFields([{ name: field, errors: [messageFor(err)] }]);
      else setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError(null);
    setResent(false);
    try {
      await requestResetCode(email);
      setResent(true);
      cooldown.start();
    } catch (err) {
      setError(messageFor(err));
    }
  }

  return (
    <div className={styles.screen}>
      <main className={styles.card}>
        <Brand />
        <h1 className="page-title">{t('reset.title')}</h1>
        {done ? (
          <>
            <Alert type="success" showIcon role="status" title={t('reset.done')} />
            <Button type="primary" size="large" block onClick={() => navigate('/sign-in', { replace: true })}>
              {t('reset.signIn')}
            </Button>
          </>
        ) : (
          <>
            <p className={styles.lead}>{t('reset.lead', { email })}</p>
            <Form form={form} layout="vertical" requiredMark={false} onFinish={submit} disabled={busy}>
              <Form.Item name="new" label={t('password.new')} extra={t('password.rule')}
                rules={[{ required: true, min: MIN, message: t('password.rule') }]}>
                <Input.Password autoComplete="new-password" size="large" autoFocus />
              </Form.Item>
              <Form.Item name="repeat" label={t('password.repeat')} dependencies={['new']}
                rules={[{ required: true, message: t('password.mismatch') },
                  ({ getFieldValue }) => ({
                    validator: (_, value) => (!value || value === getFieldValue('new')
                      ? Promise.resolve() : Promise.reject(new Error(t('password.mismatch')))),
                  })]}>
                <Input.Password autoComplete="new-password" size="large" />
              </Form.Item>
              <Form.Item name="code" label={t('code.label')} rules={[{ required: true, len: CODE_LENGTH, message: t('code.required') }]}
                extra={(
                  <span className={styles.codeHelp}>
                    <span role="status">{t(resent ? 'reset.resent' : 'reset.codeHelp')}</span>
                    <Button type="link" onClick={resend} disabled={cooldown.left > 0}>
                      {cooldown.left > 0 ? t('code.wait', { seconds: cooldown.left }) : t('code.resend')}
                    </Button>
                  </span>
                )}>
                <CodeInput />
              </Form.Item>
              {error && <Alert type="error" showIcon title={error} role="alert" className="form-alert" />}
              <Button type="primary" htmlType="submit" size="large" block loading={busy}>{t('reset.submit')}</Button>
            </Form>
            <Button type="link" onClick={() => navigate('/forgot-password', { state: { email } })}>{t('reset.otherEmail')}</Button>
          </>
        )}
      </main>
    </div>
  );
}
