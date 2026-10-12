// The audit log (dashboard plan §5.17; SRV-48; audit:read): who changed what, newest first, 50 at a
// time. Filters: tenant, machine, user (a picker over /users: email → id), action (the known list or
// any typed in), days. A row expands into its before / after diff.
import { useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Input, Select } from 'antd';
import { api } from '../../api/client.js';
import { useDisplayTz } from '../../auth/session.js';
import { PageHeader, RefreshButton } from '../../ui/PageHeader.jsx';
import { DataTable, LoadMore } from '../../ui/DataTable.jsx';
import { DateTime } from '../../ui/DateTime.jsx';
import { EmptyState, ErrorPanel, PageSkeleton } from '../../ui/States.jsx';
import { useDebounced } from '../../lib/useDebounced.js';
import { formatDayHeading } from '../../lib/time.js';
import { AuditDiff } from './AuditDiff.jsx';
import { EMPTY_FILTERS, StaffFilters, staffParams } from './StaffFilters.jsx';
import { t } from '../../strings.js';
import styles from './platform.module.css';

export const ACTIONS = ['auth.login', 'auth.login_failed', 'auth.password_change', 'user.create', 'user.update', 'user.password_reset',
  'tenant.create', 'tenant.update', 'product.create', 'product.update', 'machine.register', 'machine.update', 'machine.bases',
  'machine.maintenance', 'menu.update', 'menu.item_update', 'menu.copy', 'key.issue', 'key.revoke', 'stock.refill', 'stock.adjust'];
const OTHER = '__other__';

export default function AuditPage() {
  const tz = useDisplayTz();
  const [f, setF] = useState(EMPTY_FILTERS);
  const [user, setUser] = useState('');
  const [action, setAction] = useState('');
  const [other, setOther] = useState('');
  const typed = useDebounced(other.trim(), 300);
  const users = useQuery({ queryKey: ['users', 'names'], queryFn: ({ signal }) => api('GET', '/users?limit=200', { signal }).then((r) => r.items) });
  const params = new URLSearchParams(Object.entries({ ...staffParams(f, tz), user: user || null,
    action: action === OTHER ? typed || null : action || null }).filter(([, v]) => v));
  const qs = params.toString();
  const query = useInfiniteQuery({
    queryKey: ['audit', qs],
    queryFn: ({ pageParam, signal }) => {
      const p = new URLSearchParams(qs);
      p.set('limit', '50');
      if (pageParam) p.set('cursor', pageParam);
      return api('GET', `/audit?${p}`, { signal });
    },
    initialPageParam: null,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];

  const columns = [
    { key: 'at', title: t('audit.col.at'), priority: 1, render: (e) => <DateTime value={e.at} /> },
    { key: 'user', title: t('audit.col.user'), priority: 2, render: (e) => e.user_email ?? '—' },
    { key: 'action', title: t('audit.col.action'), priority: 2, render: (e) => <span className="mono">{e.action}</span> },
    { key: 'target', title: t('audit.col.target'), priority: 2, render: (e) => <span className="mono">{e.target ?? '—'}</span> },
    { key: 'where', title: t('audit.col.where'), priority: 3, render: (e) => [e.tenant_id, e.machine_id].filter(Boolean).join(' · ') || '—' },
    { key: 'ip', title: t('audit.col.ip'), priority: 3, render: (e) => <span className="mono">{e.ip ?? '—'}</span> },
  ];

  return (
    <section>
      <PageHeader overline={formatDayHeading(query.dataUpdatedAt || undefined, tz)} title={t('page.audit')} actions={<RefreshButton queries={[query]} />} />
      <StaffFilters value={f} onChange={setF} count={(user ? 1 : 0) + (action ? 1 : 0)}
        onReset={() => { setUser(''); setAction(''); setOther(''); }}>
        <Select aria-label={t('audit.user')} value={user} onChange={setUser} className={styles.select} showSearch={{ optionFilterProp: 'label' }}
          popupMatchSelectWidth={false}
          options={[{ value: '', label: t('audit.user.all') }, ...(users.data ?? []).map((u) => ({ value: u.id, label: u.email }))]} />
        <Select aria-label={t('audit.action')} value={action} onChange={setAction} className={styles.select} popupMatchSelectWidth={false}
          showSearch={{ optionFilterProp: 'label' }}
          options={[{ value: '', label: t('audit.action.all') }, ...ACTIONS.map((a) => ({ value: a, label: a })), { value: OTHER, label: t('audit.action.other') }]} />
        {action === OTHER && <Input aria-label={t('audit.action.other')} value={other} onChange={(e) => setOther(e.target.value)} className={styles.search} />}
      </StaffFilters>
      {query.isPending && <PageSkeleton rows={6} />}
      {query.error && <ErrorPanel error={query.error} onRetry={query.refetch} />}
      {query.data && (
        <DataTable columns={columns} rows={rows} empty={<EmptyState message={t('audit.empty')} />}
          expand={{ can: (e) => Boolean(e.before || e.after), render: (e) => <AuditDiff before={e.before} after={e.after} /> }}
          footer={<LoadMore hasMore={query.hasNextPage} loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()} />} />
      )}
    </section>
  );
}
