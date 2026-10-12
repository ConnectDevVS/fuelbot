// Fault intervals (dashboard plan §5.6.10, §5.15; platform only): GET /faults → {code, from, to|null,
// duration_sec|null}. Ongoing ones first ("ongoing since …"), then the closed ones, newest first,
// with their duration. Shared by a machine's Faults tab and the staff Faults page (SRV-48).
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Tag } from 'antd';
import { api } from '../../api/client.js';
import { useDisplayTz } from '../../auth/session.js';
import { DataTable } from '../../ui/DataTable.jsx';
import { EmptyState, ErrorPanel, PageSkeleton } from '../../ui/States.jsx';
import { formatDateTime, formatDuration } from '../../lib/time.js';
import { t } from '../../strings.js';
import styles from '../telemetry/telemetry.module.css';

/** Ongoing first, then closed; each group newest first. */
export function orderFaults(items = []) {
  const newest = (a, b) => Date.parse(b.from) - Date.parse(a.from);
  return [...items.filter((i) => !i.to).sort(newest), ...items.filter((i) => i.to).sort(newest)];
}

export function useFaults(params) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  return useQuery({
    queryKey: ['faults', qs],
    queryFn: ({ signal }) => api('GET', `/faults?${qs}`, { signal }).then((r) => r.items),
  });
}

/** query: useFaults(...); showMachine: the staff page's machine column. */
export function FaultIntervals({ query, showMachine = false }) {
  const tz = useDisplayTz();
  if (query.isPending) return <PageSkeleton rows={4} />;
  if (query.error) return <ErrorPanel error={query.error} onRetry={query.refetch} />;
  const columns = [
    { key: 'code', title: t('faults.col.code'), priority: 1, render: (f) => <span className="mono">{f.code}</span> },
    ...(showMachine ? [{ key: 'machine', title: t('faults.col.machine'), priority: 2, render: (f) => (
      <Link to={`/t/${encodeURIComponent(f.tenant_id)}/machines/${encodeURIComponent(f.machine_id)}/faults`} className="mono">{f.tenant_id} · {f.machine_id}</Link>
    ) }] : []),
    { key: 'state', title: '', priority: 2, render: (f) => (f.to ? <Tag>{t('faults.cleared')}</Tag> : <Tag color="error">{t('faults.open')}</Tag>) },
    { key: 'when', title: t('faults.col.when'), priority: 2, render: (f) => (f.to
      ? t('faults.closed', { from: formatDateTime(f.from, tz), to: formatDateTime(f.to, tz), duration: formatDuration(f.duration_sec) })
      : <span className={styles.ongoing}>{t('faults.ongoing', { time: formatDateTime(f.from, tz) })}</span>) },
  ];
  return <DataTable columns={columns} rows={orderFaults(query.data)} rowKey={(f) => `${f.machine_id}:${f.code}:${f.from}`}
    empty={<EmptyState message={t('faults.none')} />} />;
}
