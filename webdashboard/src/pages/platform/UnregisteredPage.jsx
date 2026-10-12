// Unregistered machines (dashboard plan §5.18; SRV-48; unregistered:read): ids that sent records but
// aren't registered to the tenant they claimed. Ids come only from the server, so each row is a
// mistake to fix on the machine (a typo, or another tenant's tenant_id.txt).
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { useDisplayTz } from '../../auth/session.js';
import { PageHeader, RefreshButton } from '../../ui/PageHeader.jsx';
import { DataTable } from '../../ui/DataTable.jsx';
import { DateTime } from '../../ui/DateTime.jsx';
import { EmptyState, ErrorPanel, PageSkeleton } from '../../ui/States.jsx';
import { formatDayHeading } from '../../lib/time.js';
import { t } from '../../strings.js';
import styles from './platform.module.css';

export default function UnregisteredPage() {
  const tz = useDisplayTz();
  const query = useQuery({ queryKey: ['unregistered'], queryFn: ({ signal }) => api('GET', '/unregistered', { signal }).then((r) => r.items) });
  const columns = [
    { key: 'machine', title: t('unreg.col.machine'), priority: 1, render: (r) => <span className="mono">{r.machine_id}</span> },
    { key: 'claimed', title: t('unreg.col.claimed'), priority: 2, render: (r) => <span className="mono">{r.tenant_id}</span> },
    { key: 'sales', title: t('unreg.col.sales'), priority: 2, align: 'right', render: (r) => <span className="num">{r.sales}</span> },
    { key: 'telemetry', title: t('unreg.col.telemetry'), priority: 2, align: 'right', render: (r) => <span className="num">{r.telemetry}</span> },
    { key: 'first', title: t('unreg.col.first'), priority: 3, render: (r) => <DateTime value={r.first_seen} /> },
    { key: 'last', title: t('unreg.col.last'), priority: 2, render: (r) => <DateTime value={r.last_seen} /> },
    { key: 'under', title: t('unreg.col.under'), priority: 2, render: (r) => (r.registered_under ? <span className="mono">{r.registered_under}</span> : '—') },
  ];
  return (
    <section>
      <PageHeader overline={formatDayHeading(query.dataUpdatedAt || undefined, tz)} title={t('page.unregistered')} actions={<RefreshButton queries={[query]} />} />
      <p className={styles.help}>{t('unreg.help')}</p>
      {query.isPending && <PageSkeleton rows={4} />}
      {query.error && <ErrorPanel error={query.error} onRetry={query.refetch} />}
      {query.data && <DataTable columns={columns} rows={query.data} rowKey={(r) => `${r.tenant_id}:${r.machine_id}`}
        empty={<EmptyState message={t('unreg.empty')} />} />}
    </section>
  );
}
