// Users (dashboard plan §5.12; SRV-46): /t/:tid/users for a tenant admin (their company) and staff in a
// tenant; /users for staff across tenants, with a tenant filter. 50 at a time with Load more. Per row:
// Edit, Reset password, Disable / Enable (after a confirm). Your own row: edit your name only.
import { useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Alert, Button, Dropdown, Select, Tag } from 'antd';
import { MoreOutlined, PlusOutlined } from '@ant-design/icons';
import { api } from '../../api/client.js';
import { messageFor } from '../../api/errors.js';
import { useDisplayTz, useMe } from '../../auth/session.js';
import { useIsStaff } from '../../shell/tenant.js';
import { PageHeader, RefreshButton } from '../../ui/PageHeader.jsx';
import { DataTable, LoadMore } from '../../ui/DataTable.jsx';
import { DateTime } from '../../ui/DateTime.jsx';
import { useConfirm, useToast } from '../../ui/dialogs.js';
import { EmptyState, ErrorPanel, PageSkeleton } from '../../ui/States.jsx';
import { machineName, useMachines } from '../../lib/names.js';
import { formatDayHeading } from '../../lib/time.js';
import { UserDialog } from './UserDialog.jsx';
import { t } from '../../strings.js';
import styles from './users.module.css';

export default function UsersPage() {
  const { tid } = useParams();   // undefined on /users (staff)
  const tz = useDisplayTz();
  const staff = useIsStaff();
  const { data: me } = useMe();
  const confirm = useConfirm();
  const toast = useToast();
  const [tenantFilter, setTenantFilter] = useState(null);
  const tenant = tid ?? tenantFilter;
  const query = useInfiniteQuery({
    queryKey: ['users', 'list', tenant ?? 'all'],
    queryFn: ({ pageParam, signal }) => {
      const q = new URLSearchParams({ limit: '50' });
      if (tenant) q.set('tenant', tenant);
      if (pageParam) q.set('cursor', pageParam);
      return api('GET', `/users?${q}`, { signal });
    },
    initialPageParam: null,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
  const tenants = useQuery({
    queryKey: ['tenants'],
    queryFn: ({ signal }) => api('GET', '/tenants', { signal }).then((r) => r.items),
    enabled: staff,
  });
  const machines = useMachines(tid ?? tenantFilter);
  const machineNames = useMemo(() => new Map((machines.data ?? []).map((m) => [m.id, machineName(m)])), [machines.data]);
  const tenantNames = useMemo(() => new Map((tenants.data ?? []).map((x) => [x.id, x.name])), [tenants.data]);
  const [dialog, setDialog] = useState(null);   // {mode, user}
  const [problem, setProblem] = useState(null);
  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];
  const isSelf = (u) => u.id === me?.user?.id;

  const setDisabled = async (u, disabled) => {
    const name = u.name || u.email;
    if (disabled && !(await confirm('disableUser', { name }))) return;
    setProblem(null);
    try {
      await api('PATCH', `/users/${encodeURIComponent(u.id)}`, { body: { disabled } });
      toast.success(t(disabled ? 'users.disabledToast' : 'users.enabled', { name }));
      query.refetch();
    } catch (err) {
      setProblem(messageFor(err));
    }
  };

  const status = (u) => {
    if (u.disabled) return <Tag>{t('users.disabled')}</Tag>;
    if (u.must_change_password) return <Tag color="warning">{t('users.mustChange')}</Tag>;
    return <span>{t('users.active')}</span>;
  };
  const columns = [
    { key: 'name', title: t('users.col.name'), priority: 1, render: (u) => (
      <span className={styles.who}><b>{u.name || '—'}{isSelf(u) && <span className={styles.muted}> · {t('users.you')}</span>}</b><span>{u.email}</span></span>
    ) },
    { key: 'role', title: t('users.col.role'), priority: 2, render: (u) => t(`role.${u.role}`) },
    ...(!tid ? [{ key: 'tenant', title: t('users.col.tenant'), priority: 2, render: (u) => (u.tenant_id ? tenantNames.get(u.tenant_id) ?? u.tenant_id : '—') }] : []),
    // FuelBot staff aren't limited to machines at all: "—", not "All machines".
    { key: 'machines', title: t('users.col.machines'), priority: 2, render: (u) => (!u.tenant_id ? '—' : u.machines?.length
      ? u.machines.map((id) => machineNames.get(id) ?? id).join(', ') : t('users.allMachines')) },
    { key: 'status', title: t('users.col.status'), priority: 2, render: status },
    { key: 'last', title: t('users.col.lastSignIn'), priority: 3, render: (u) => (u.last_login_at ? <DateTime value={u.last_login_at} /> : t('users.never')) },
    { key: 'actions', title: '', priority: 2, align: 'right', render: (u) => {
      const items = [
        { key: 'edit', label: t('users.edit') },
        ...(isSelf(u) ? [] : [
          { key: 'reset', label: t('users.reset') },
          u.disabled ? { key: 'enable', label: t('users.enable') } : { key: 'disable', label: t('users.disable'), danger: true },
        ]),
      ];
      return (
        <Dropdown trigger={['click']} menu={{ items, onClick: ({ key, domEvent }) => {
          domEvent.stopPropagation();
          if (key === 'edit' || key === 'reset') setDialog({ mode: key, user: u });
          else setDisabled(u, key === 'disable');
        } }}>
          <Button type="text" icon={<MoreOutlined />} aria-label={t('users.actionsFor', { name: u.name || u.email })}
            onClick={(e) => e.stopPropagation()} />
        </Dropdown>
      );
    } },
  ];

  const closeDialog = (saved) => {
    const mode = dialog?.mode;
    setDialog(null);
    if (!saved) return;
    const name = saved.name || saved.email;
    toast.success(t(mode === 'create' ? 'users.created' : mode === 'reset' ? 'users.resetDone' : 'users.saved', { name }));
    query.refetch();
  };

  return (
    <section>
      <PageHeader overline={formatDayHeading(query.dataUpdatedAt || undefined, tz)} title={t(tid ? 'page.users' : 'page.usersAll')}
        actions={(
          <>
            <RefreshButton queries={[query]} />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setDialog({ mode: 'create' })}>{t('users.new')}</Button>
          </>
        )} />
      {!tid && staff && (
        <div className={styles.toolbar}>
          <Select aria-label={t('users.tenant')} value={tenantFilter ?? ''} className={styles.tenant}
            onChange={(v) => setTenantFilter(v || null)}
            options={[{ value: '', label: t('switcher.all') }, ...(tenants.data ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
        </div>
      )}
      {problem && <Alert type="error" showIcon title={problem} className={styles.gap} />}
      {query.isPending && <PageSkeleton rows={6} />}
      {query.error && <ErrorPanel error={query.error} onRetry={query.refetch} />}
      {query.data && (
        <DataTable columns={columns} rows={rows} empty={<EmptyState message={t('users.empty')} />}
          footer={<LoadMore hasMore={query.hasNextPage} loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()} />} />
      )}
      {dialog && (
        <UserDialog mode={dialog.mode} user={dialog.user} tid={tid ?? null} staff={staff} tenants={tenants.data ?? []}
          self={dialog.user ? isSelf(dialog.user) : false} onClose={closeDialog} />
      )}
    </section>
  );
}
