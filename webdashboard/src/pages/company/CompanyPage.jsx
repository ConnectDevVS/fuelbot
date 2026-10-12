// Company (dashboard plan §5.13; SRV-46): the tenant's name (dashboard only) and its kiosk branding:
// display name, logo text (≤ 4, with the kiosk badge previewed live) and support phone. PATCH
// /tenants/:tid, not versioned (the last write wins; rare edits). Branding is in every machine's
// config: it reaches them at their next restart. Read-only without tenant:edit.
import { useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, Card, Form, Input } from 'antd';
import { api } from '../../api/client.js';
import { useCan, useDisplayTz } from '../../auth/session.js';
import { useTenantQuery } from '../../shell/tenant.js';
import { PageHeader, RefreshButton } from '../../ui/PageHeader.jsx';
import { useToast } from '../../ui/dialogs.js';
import { ErrorPanel, PageSkeleton } from '../../ui/States.jsx';
import { FormError } from '../../ui/forms/FormError.jsx';
import { RestartNote } from '../../ui/forms/RestartNote.jsx';
import { applyServerError } from '../../ui/forms/applyServerError.js';
import { useLeaveGuard } from '../../ui/forms/UnsavedBar.jsx';
import { useFormDirty } from '../../ui/forms/useFormDirty.js';
import { formatDayHeading } from '../../lib/time.js';
import { t } from '../../strings.js';
import styles from './company.module.css';

const valuesOf = (tenant) => ({
  name: tenant?.name ?? '',
  branding: { display_name: tenant?.branding?.display_name ?? '', logo_text: tenant?.branding?.logo_text ?? '',
    support_phone: tenant?.branding?.support_phone ?? '' },
});

export default function CompanyPage() {
  const { tid } = useParams();
  const tz = useDisplayTz();
  const canEdit = useCan()('tenant:edit');
  const queryClient = useQueryClient();
  const toast = useToast();
  const query = useTenantQuery(tid);
  const [form] = Form.useForm();
  const { dirty, onValuesChange, reset } = useFormDirty(form);
  useLeaveGuard(dirty);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const logo = Form.useWatch(['branding', 'logo_text'], form) ?? query.data?.branding?.logo_text ?? '';
  const display = Form.useWatch(['branding', 'display_name'], form) ?? query.data?.branding?.display_name ?? '';

  const save = async (v) => {
    setBusy(true);
    setProblem(null);
    try {
      const body = { name: v.name.trim(), branding: Object.fromEntries(Object.entries(v.branding).map(([k, x]) => [k, (x ?? '').trim()])) };
      const { tenant } = await api('PATCH', `/tenants/${encodeURIComponent(tid)}`, { body });
      queryClient.setQueryData(['tenants', tid], tenant);
      await Promise.all([['tenants'], ['config'], ['me']].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      reset(valuesOf(tenant));
      toast.success(t('company.saved'));
    } catch (err) {
      setProblem(applyServerError(err, form));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <PageHeader overline={formatDayHeading(query.dataUpdatedAt || undefined, tz)} title={t('page.company')}
        actions={<RefreshButton queries={[query]} />} />
      {query.isPending && <PageSkeleton kind="plain" rows={6} />}
      {query.error && <ErrorPanel error={query.error} onRetry={query.refetch} />}
      {query.data && (
        <div className={styles.layout}>
          <Form form={form} layout="vertical" requiredMark={false} initialValues={valuesOf(query.data)} onValuesChange={onValuesChange}
            onFinish={save} disabled={!canEdit} className={styles.form}>
            <FormError problem={problem} form={form} />
            <Form.Item name="name" label={t('company.name')} extra={t('company.name.help')}
              rules={[{ required: true, whitespace: true, message: t('company.nameRequired') }, { max: 100 }]}>
              <Input />
            </Form.Item>
            <Form.Item name={['branding', 'display_name']} label={t('company.display')} rules={[{ max: 60 }]}>
              <Input />
            </Form.Item>
            <Form.Item name={['branding', 'logo_text']} label={t('company.logo')} extra={t('company.logo.help')}
              rules={[{ max: 4, message: t('company.logoMax') }]}>
              <Input className={styles.logoInput} />
            </Form.Item>
            <Form.Item name={['branding', 'support_phone']} label={t('company.phone')} extra={t('company.phone.help')} rules={[{ max: 30 }]}>
              <Input inputMode="tel" />
            </Form.Item>
            {canEdit && (
              <div className={styles.actions}>
                <RestartNote variant="shared" />
                <Button type="primary" htmlType="submit" loading={busy} disabled={!dirty}>{t('unsaved.save')}</Button>
              </div>
            )}
          </Form>
          <Card className={styles.previewCard} role="figure" aria-label={t('company.preview')}>
            <div className="overline">{t('company.preview')}</div>
            <div className={styles.kioskHead}>
              <span className={styles.badge}>{logo || '—'}</span>
              <span className={styles.display}>{display}</span>
            </div>
          </Card>
        </div>
      )}
    </section>
  );
}
