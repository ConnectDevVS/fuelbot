// Tenants (dashboard plan §5.14; SRV-47; staff with tenants:create): every company, with Open (its
// Home), New tenant, and Disable / Enable (after the DP §4.9 confirm: its machines are refused and
// its users can't sign in).
import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Space, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { api } from '../../api/client.js';
import { messageFor } from '../../api/errors.js';
import { useCan, useDisplayTz } from '../../auth/session.js';
import { PageHeader, RefreshButton } from '../../ui/PageHeader.jsx';
import { DataTable } from '../../ui/DataTable.jsx';
import { DateTime } from '../../ui/DateTime.jsx';
import { useConfirm, useToast } from '../../ui/dialogs.js';
import { EmptyState, ErrorPanel, PageSkeleton } from '../../ui/States.jsx';
import { formatDayHeading } from '../../lib/time.js';
import { NewTenantDialog } from './NewTenantDialog.jsx';
import { t } from '../../strings.js';
import styles from './tenants.module.css';

export default function TenantsPage() {
  const tz = useDisplayTz();
  const can = useCan();
  const confirm = useConfirm();
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['tenants'],
    queryFn: ({ signal }) => api('GET', '/tenants', { signal }).then((r) => r.items),
  });
  const [creating, setCreating] = useState(false);
  const [problem, setProblem] = useState(null);

  const setDisabled = async (tenant, disabled) => {
    if (disabled && !(await confirm('disableTenant', { name: tenant.name }))) return;
    setProblem(null);
    try {
      await api('PATCH', `/tenants/${encodeURIComponent(tenant.id)}`, { body: { disabled } });
      toast.success(t(disabled ? 'tenants.disabledToast' : 'tenants.enabled', { name: tenant.name }));
      await queryClient.invalidateQueries({ queryKey: ['tenants'] });
    } catch (err) {
      setProblem(messageFor(err));
    }
  };

  const columns = [
    { key: 'id', title: t('tenants.col.id'), priority: 1, render: (x) => <span className="mono">{x.id}</span> },
    { key: 'name', title: t('tenants.col.name'), priority: 2, render: (x) => x.name },
    { key: 'machines', title: t('tenants.col.machines'), priority: 2, align: 'right', render: (x) => <span className="num">{x.machine_count ?? 0}</span> },
    { key: 'created', title: t('tenants.col.created'), priority: 3, render: (x) => (x.created_at ? <DateTime value={x.created_at} dateOnly /> : '—') },
    { key: 'status', title: t('tenants.col.status'), priority: 2, render: (x) => (x.disabled ? <Tag>{t('tenants.disabled')}</Tag> : t('tenants.active')) },
    { key: 'actions', title: '', priority: 2, align: 'right', render: (x) => (
      <Space onClick={(e) => e.stopPropagation()}>
        <Link to={`/t/${encodeURIComponent(x.id)}/home`}><Button size="small">{t('tenants.open')}</Button></Link>
        {can('tenants:disable') && (x.disabled
          ? <Button size="small" onClick={() => setDisabled(x, false)}>{t('tenants.enable')}</Button>
          : <Button size="small" danger onClick={() => setDisabled(x, true)}>{t('tenants.disable')}</Button>)}
      </Space>
    ) },
  ];

  return (
    <section>
      <PageHeader overline={formatDayHeading(query.dataUpdatedAt || undefined, tz)} title={t('page.tenants')}
        actions={(
          <>
            <RefreshButton queries={[query]} />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>{t('tenants.new')}</Button>
          </>
        )} />
      {problem && <Alert type="error" showIcon title={problem} className={styles.gap} />}
      {query.isPending && <PageSkeleton rows={4} />}
      {query.error && <ErrorPanel error={query.error} onRetry={query.refetch} />}
      {query.data && <DataTable columns={columns} rows={query.data} empty={<EmptyState message={t('tenants.empty')} />} />}
      {creating && (
        <NewTenantDialog onClose={async (made) => {
          setCreating(false);
          if (!made) return;
          toast.success(t('tenants.created', { name: made.name }));
          await queryClient.invalidateQueries({ queryKey: ['tenants'] });
        }} />
      )}
    </section>
  );
}
