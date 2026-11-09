// The comment box under a complaint (dashboard plan §5.20; SRV-53). Everyone who sees it comments.
// Staff (complaints:status) can pick a new status: the button becomes "Post and set to <status>" and
// the comment is required. A tenant user (complaints:reopen) on a closed complaint gets Reopen, which
// also needs a comment. A stale status (409 status_changed) keeps the typed text and offers a reload.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Form, Input, Select } from 'antd';
import { api, ApiError } from '../../api/client.js';
import { useCan } from '../../auth/session.js';
import { FormError } from '../../ui/forms/FormError.jsx';
import { applyServerError } from '../../ui/forms/applyServerError.js';
import { messageFor } from '../../api/errors.js';
import { t } from '../../strings.js';
import styles from './complaint.module.css';

export const COMMENT_MAX = 2000;
const STATUSES = ['open', 'with_service', 'closed'];

/** complaint: the detail view; path: its API path; onSaved(complaint); onReload(). */
export function ComplaintReply({ complaint, path, onSaved, onReload }) {
  const can = useCan();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [to, setTo] = useState(null);          // staff: the status to set, null = keep
  const [reopening, setReopening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const [conflict, setConflict] = useState(null);   // 'status_changed' | 'complaint_full'
  const text = Form.useWatch('text', form) ?? '';
  const staff = can('complaints:status');
  const reopen = !staff && can('complaints:reopen') && complaint.status === 'closed';
  const target = staff ? to : reopening ? 'open' : null;
  const mustComment = target !== null;

  const submit = async () => {
    const value = text.trim();
    if (!value) return;
    setBusy(true);
    setProblem(null);
    setConflict(null);
    try {
      const body = target ? { from: complaint.status, to: target, text: value } : { text: value };
      const res = await api('POST', `${path}/${target ? 'status' : 'comments'}`, { body });
      form.resetFields();
      setTo(null);
      setReopening(false);
      onSaved(res.complaint);
      await queryClient.invalidateQueries({ queryKey: ['complaints', 'list'] });
    } catch (err) {
      if (err instanceof ApiError && ['status_changed', 'complaint_full'].includes(err.code)) setConflict(err.code);
      else setProblem(applyServerError(err, form));
    } finally {
      setBusy(false);
    }
  };

  const label = target
    ? (reopening ? t('complaint.postReopen') : t('complaint.postSet', { status: t(`complaint.status.${target}`) }))
    : t('complaint.post');

  return (
    <div className={styles.reply}>
      {conflict === 'status_changed' && (
        <Alert type="warning" showIcon role="alert" title={messageFor(new ApiError(409, 'status_changed'))}
          action={<Button size="small" onClick={() => { setConflict(null); setTo(null); onReload(); }}>{t('complaint.reload')}</Button>} />
      )}
      {conflict === 'complaint_full' && <Alert type="error" showIcon role="alert" title={t('error.complaint_full')} />}
      <Form form={form} layout="vertical" requiredMark={false} onFinish={submit}>
        <FormError problem={problem} form={form} />
        <Form.Item name="text" label={t('complaint.comment')}
          extra={staff ? t('complaint.staffNote') : undefined} className={styles.counted}
          rules={mustComment ? [{ required: true, whitespace: true, message: t('complaint.commentRequired') }] : []}>
          <Input.TextArea rows={4} maxLength={COMMENT_MAX} showCount placeholder={t(mustComment ? 'complaint.why' : 'complaint.placeholder')} />
        </Form.Item>
        <div className={styles.actions}>
          {staff && (
            <Select aria-label={t('complaint.changeStatus')} className={styles.statusSelect} value={to ?? ''}
              onChange={(v) => setTo(v || null)}
              options={[{ value: '', label: t('complaint.keepStatus') },
                ...STATUSES.filter((s) => s !== complaint.status).map((s) => ({ value: s, label: t(`complaint.setTo`, { status: t(`complaint.status.${s}`) }) }))]} />
          )}
          {reopen && !reopening && <Button onClick={() => setReopening(true)}>{t('complaint.reopen')}</Button>}
          {reopening && <Button onClick={() => setReopening(false)}>{t('action.cancel')}</Button>}
          <Button type="primary" htmlType="submit" loading={busy} disabled={!text.trim()}>{label}</Button>
        </div>
      </Form>
    </div>
  );
}
