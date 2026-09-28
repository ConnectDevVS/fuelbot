// Fleet (dashboard plan §5.2): the staff landing. Every machine in every tenant, problems first.
// One GET /fleet on entry and on Refresh; nothing refetches by itself.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Input, Select } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { api } from '../../api/client.js';
import { useDisplayTz } from '../../auth/session.js';
import { PageHeader, RefreshButton } from '../../ui/PageHeader.jsx';
import { DataTable } from '../../ui/DataTable.jsx';
import { StatusBadge } from '../../ui/Chips.jsx';
import { EmptyState, ErrorPanel, PageSkeleton } from '../../ui/States.jsx';
import { RelativeTime } from '../../ui/DateTime.jsx';
import { Money } from '../../ui/Money.jsx';
import { machineName } from '../../lib/names.js';
import { formatClock, formatDayHeading } from '../../lib/time.js';
import { buildFleet, STATUS_ORDER } from './fleetModel.js';
import { RefillSoonPanel } from './RefillSoonPanel.jsx';
import { t, tn } from '../../strings.js';
import styles from './fleet.module.css';

export const fleetKey = ['fleet'];

function MachineCell({ m }) {
  return (
    <span className={styles.machine}>
      <b>{machineName(m)}</b>
      <span className="mono">{m.id}</span>
    </span>
  );
}

function StatusCell({ m }) {
  const tz = useDisplayTz();
  const maintenance = m.maintenance?.enabled ? m.maintenance : null;
  return (
    <span className={styles.status}>
      <StatusBadge machine={m} />
      {maintenance && (
        <span className={styles.maintenance}>
          {t('fleet.maintenance', { message: maintenance.message || '—' })}
          {maintenance.flagged_by && ` · ${t('fleet.flaggedBy', { who: maintenance.flagged_by, time: maintenance.flagged_at ? formatClock(maintenance.flagged_at, tz) : '—' })}`}
        </span>
      )}
    </span>
  );
}

function TodayCell({ m }) {
  const today = m.today ?? {};
  return (
    <span className={styles.today}>
      <Money value={today.revenue ?? 0} />
      <span> · {tn('fleet.orders', today.count ?? 0)}</span>
      {today.not_dispensed > 0 && <span className={styles.nd}> · {t('fleet.notDispensed', { n: today.not_dispensed })}</span>}
    </span>
  );
}

export default function FleetPage() {
  const tz = useDisplayTz();
  const query = useQuery({ queryKey: fleetKey, queryFn: ({ signal }) => api('GET', '/fleet', { signal }) });
  const [statuses, setStatuses] = useState(() => new Set());
  const [tenant, setTenant] = useState(null);
  const [search, setSearch] = useState('');
  const model = useMemo(() => buildFleet(query.data, { statuses, tenant, search }), [query.data, statuses, tenant, search]);
  const tenantNames = useMemo(() => new Map((query.data?.tenants ?? []).map((x) => [x.id, x.name])), [query.data]);

  const toggle = (s) => setStatuses((prev) => {
    const next = new Set(prev);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    return next;
  });

  const columns = [
    { key: 'machine', title: t('fleet.col.machine'), priority: 1, render: (m) => <MachineCell m={m} /> },
    { key: 'status', title: t('fleet.col.status'), priority: 2, render: (m) => <StatusCell m={m} /> },
    { key: 'seen', title: t('fleet.col.seen'), priority: 2, render: (m) => <RelativeTime value={m.last_seen_at} now={query.dataUpdatedAt} /> },
    { key: 'today', title: t('fleet.col.today'), priority: 2, align: 'right', render: (m) => <TodayCell m={m} /> },
  ];

  return (
    <section>
      <PageHeader overline={formatDayHeading(query.dataUpdatedAt || undefined, tz)} title={t('page.fleet')}
        actions={<RefreshButton queries={[query]} />} />
      {query.isPending && <PageSkeleton rows={6} />}
      {query.error && <ErrorPanel error={query.error} onRetry={query.refetch} />}
      {query.data && (
        <>
          <div className={styles.controls}>
            <div className={styles.chips} role="group" aria-label={t('fleet.filter')}>
              {STATUS_ORDER.map((s) => (
                <Button key={s} aria-pressed={statuses.has(s)} type={statuses.has(s) ? 'primary' : 'default'}
                  onClick={() => toggle(s)} className={styles.chip}>
                  {t(`status.${s}`)} <b className="num">{model.counts[s]}</b>
                </Button>
              ))}
            </div>
            <div className={styles.filters}>
              <Select aria-label={t('fleet.tenant')} className={styles.tenant} value={tenant ?? ''} onChange={(v) => setTenant(v || null)}
                options={[{ value: '', label: t('switcher.all') },
                  ...(query.data.tenants ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
              <Input allowClear prefix={<SearchOutlined />} placeholder={t('fleet.search')} aria-label={t('fleet.search')}
                value={search} onChange={(e) => setSearch(e.target.value)} className={styles.search} />
            </div>
          </div>

          {model.total === 0 && <EmptyState message={t('fleet.empty')} />}
          {model.total > 0 && model.sections.length === 0 && <EmptyState message={t('fleet.noMatch')} />}
          {model.sections.map(({ tenant: section, rows }) => (
            <section key={section.id} className={styles.section} aria-label={section.name}>
              <h2 className={styles.sectionTitle}>
                {section.name}
                <span className="overline"> · {tn('fleet.machineCount', section.machines ?? rows.length)}</span>
              </h2>
              {rows.length === 0
                ? <p className={styles.none}>{t('fleet.noMachines')}</p>
                : <DataTable columns={columns} rows={rows}
                    rowHref={(m) => `/t/${encodeURIComponent(m.tenant_id)}/machines/${encodeURIComponent(m.id)}/menu`} />}
            </section>
          ))}

          <div className={styles.section}>
            <RefillSoonPanel tenantNames={tenantNames} />
          </div>
        </>
      )}
    </section>
  );
}
