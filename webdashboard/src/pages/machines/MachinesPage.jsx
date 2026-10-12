// Machines (dashboard plan §5.4; SRV-42): every machine the caller may see (the server scopes a
// limited operator to theirs) from GET /fleet?tenant=, as the shared MachineStatusList plus Menu and
// Location. Register a machine with machines:manage. A row opens the machine.
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Button, Input } from 'antd';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { api } from '../../api/client.js';
import { useCan, useDisplayTz } from '../../auth/session.js';
import { PageHeader, RefreshButton } from '../../ui/PageHeader.jsx';
import { EmptyState, ErrorPanel, PageSkeleton } from '../../ui/States.jsx';
import { machineName } from '../../lib/names.js';
import { formatDayHeading } from '../../lib/time.js';
import { MachineStatusList } from './MachineStatusList.jsx';
import { t, tn } from '../../strings.js';
import styles from './machines.module.css';

function matches(m, q) {
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  return [machineName(m), m.id, m.location_label ?? '', m.site ?? ''].some((v) => v.toLowerCase().includes(needle));
}

export default function MachinesPage() {
  const { tid } = useParams();
  const tz = useDisplayTz();
  const manage = useCan()('machines:manage');
  const query = useQuery({
    queryKey: ['fleet', tid],
    queryFn: ({ signal }) => api('GET', `/fleet?tenant=${encodeURIComponent(tid)}`, { signal }),
  });
  const [search, setSearch] = useState('');
  const rows = useMemo(() => (query.data?.items ?? []).filter((m) => matches(m, search)), [query.data, search]);
  const register = `/t/${encodeURIComponent(tid)}/machines/new`;

  const extraColumns = [
    // "Not configured" is already a chip in Status.
    { key: 'menu', title: t('machines.col.menu'), priority: 3,
      render: (m) => <span className={styles.nowrap}>{m.configured ? tn('machines.menuItems', m.menu?.length ?? 0) : '—'}</span> },
    // Desktop only: squeezed into a tablet's width it wrapped onto four lines.
    { key: 'location', title: t('machines.col.location'), priority: 4,
      render: (m) => <span className={styles.location}>{[m.location_label, m.site].filter(Boolean).join(' · ') || '—'}</span> },
  ];

  return (
    <section>
      <PageHeader overline={formatDayHeading(query.dataUpdatedAt || undefined, tz)} title={t('page.machines')}
        actions={(
          <>
            <RefreshButton queries={[query]} />
            {manage && <Link to={register}><Button type="primary" icon={<PlusOutlined />}>{t('machines.register')}</Button></Link>}
          </>
        )} />
      <div className={styles.toolbar}>
        <Input allowClear prefix={<SearchOutlined />} placeholder={t('machines.search')} aria-label={t('machines.search')}
          value={search} onChange={(e) => setSearch(e.target.value)} className={styles.search} />
      </div>
      {query.isPending && <PageSkeleton rows={6} />}
      {query.error && <ErrorPanel error={query.error} onRetry={query.refetch} />}
      {query.data && (
        <MachineStatusList machines={rows} now={query.dataUpdatedAt} extraColumns={extraColumns}
          empty={query.data.items.length === 0
            ? <EmptyState message={t(manage ? 'machines.empty.admin' : 'machines.empty.other')}
                action={manage && <Link to={register}><Button type="primary">{t('machines.register')}</Button></Link>} />
            : <EmptyState message={t('machines.noMatch')} />} />
      )}
    </section>
  );
}
