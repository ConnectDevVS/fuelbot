// Complaints (dashboard plan §5.20; SRV-52): /t/:tid/complaints for a tenant's users (operators and
// viewers see the ones they raised, a tenant admin all of the tenant's; the server scopes it) and
// staff in a tenant; /complaints for staff across tenants, with a tenant filter. Newest activity
// first, 50 at a time. The status filter and the tenant live in the URL. Raise (tenant users).
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Segmented, Select } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { api } from '../../api/client.js';
import { useCan, useDisplayTz } from '../../auth/session.js';
import { PageHeader, RefreshButton } from '../../ui/PageHeader.jsx';
import { DataTable, LoadMore } from '../../ui/DataTable.jsx';
import { ComplaintStatusChip } from '../../ui/Chips.jsx';
import { RelativeTime } from '../../ui/DateTime.jsx';
import { useToast } from '../../ui/dialogs.js';
import { EmptyState, ErrorPanel, PageSkeleton } from '../../ui/States.jsx';
import { formatDayHeading } from '../../lib/time.js';
import { RaiseComplaintDialog } from './RaiseComplaintDialog.jsx';
import { t } from '../../strings.js';
import styles from './complaints.module.css';

// ?status= → the API's status list ('' = every status).
export const FILTERS = { active: 'open,with_service', closed: 'closed', all: '' };

export const complaintHref = (tid, number) => `/t/${encodeURIComponent(tid)}/complaints/${number}`;

export default function ComplaintsPage() {
  const { tid } = useParams();   // undefined on /complaints (staff)
  const tz = useDisplayTz();
  const can = useCan();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const filter = FILTERS[params.get('status')] !== undefined ? params.get('status') : 'active';
  const tenantFilter = tid ? null : params.get('tenant') || null;
  const [raising, setRaising] = useState(false);
  const setParam = (key, value, fallback) => setParams((prev) => {
    const next = new URLSearchParams(prev);
    if (!value || value === fallback) next.delete(key);
    else next.set(key, value);
    return next;
  }, { replace: true });

  const query = useInfiniteQuery({
    queryKey: ['complaints', 'list', tid ?? 'all', filter, tenantFilter],
    queryFn: ({ pageParam, signal }) => {
      const q = new URLSearchParams({ limit: '50' });
      if (FILTERS[filter]) q.set('status', FILTERS[filter]);
      if (tenantFilter) q.set('tenant', tenantFilter);
      if (pageParam) q.set('cursor', pageParam);
      return api('GET', `${tid ? `/tenants/${encodeURIComponent(tid)}` : ''}/complaints?${q}`, { signal });
    },
    initialPageParam: null,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
  const tenants = useQuery({
    queryKey: ['tenants'],
    queryFn: ({ signal }) => api('GET', '/tenants', { signal }).then((r) => r.items),
    enabled: !tid,
  });
  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];
  const raise = can('complaints:raise') && Boolean(tid);

  const columns = [
    { key: 'complaint', title: t('complaints.col.complaint'), priority: 1, render: (c) => (
      <span className={styles.title}>
        <span className={`num ${styles.number}`}>{t('complaints.number', { n: c.number })}</span>
        <span className={styles.text} title={c.title}>{c.title}</span>
      </span>
    ) },
    ...(!tid ? [{ key: 'tenant', title: t('complaints.col.tenant'), priority: 2, render: (c) => c.tenant_name ?? c.tenant_id }] : []),
    { key: 'status', title: t('complaints.col.status'), priority: 2, render: (c) => <ComplaintStatusChip status={c.status} /> },
    ...(can('complaints:read_all') ? [{ key: 'by', title: t('complaints.col.raisedBy'), priority: 2, render: (c) => c.created_by.name }] : []),
    { key: 'activity', title: t('complaints.col.activity'), priority: 2,
      render: (c) => <RelativeTime value={c.last_activity_at} now={query.dataUpdatedAt || undefined} /> },
    // Desktop only: on a tablet the staff list (with Tenant and Raised by) needs the width.
    { key: 'comments', title: t('complaints.col.comments'), priority: 4, align: 'right', render: (c) => <span className="num">{c.comment_count}</span> },
  ];

  // Raise stays in the header (one button); the empty state names what the filter shows.
  const emptyKey = `complaints.empty.${filter}`;

  const closeDialog = async (complaint) => {
    setRaising(false);
    if (!complaint) return;
    await queryClient.invalidateQueries({ queryKey: ['complaints'] });
    toast.success(t('complaints.raised', { n: complaint.number }));
    navigate(complaintHref(tid, complaint.number));
  };

  return (
    <section>
      <PageHeader overline={formatDayHeading(query.dataUpdatedAt || undefined, tz)} title={t(tid ? 'page.complaints' : 'page.complaintsAll')}
        actions={(
          <>
            <RefreshButton queries={[query]} />
            {raise && <Button type="primary" icon={<PlusOutlined />} onClick={() => setRaising(true)}>{t('complaints.raise')}</Button>}
          </>
        )} />
      <div className={styles.toolbar}>
        <Segmented aria-label={t('complaints.filter')} value={filter} onChange={(v) => setParam('status', v, 'active')}
          options={Object.keys(FILTERS).map((k) => ({ value: k, label: t(`complaints.filter.${k}`) }))} />
        {!tid && (
          <Select aria-label={t('complaints.tenant')} value={tenantFilter ?? ''} className={styles.tenant}
            onChange={(v) => setParam('tenant', v)}
            options={[{ value: '', label: t('switcher.all') }, ...(tenants.data ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
        )}
      </div>
      {query.isPending && <PageSkeleton rows={6} />}
      {query.error && <ErrorPanel error={query.error} onRetry={query.refetch} />}
      {query.data && (
        <DataTable columns={columns} rows={rows} rowKey={(c) => `${c.tenant_id ?? tid}-${c.number}`}
          rowHref={(c) => complaintHref(tid ?? c.tenant_id, c.number)} empty={<EmptyState message={t(emptyKey)} />}
          footer={<LoadMore hasMore={query.hasNextPage} loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()} />} />
      )}
      {raise && <RaiseComplaintDialog open={raising} tid={tid} onClose={closeDialog} />}
    </section>
  );
}
