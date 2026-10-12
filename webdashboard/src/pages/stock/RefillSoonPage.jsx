// Refill soon (dashboard plan §5.10; SRV-41): every hopper that isn't OK across the tenant's machines
// (the caller's, for a limited operator: the server scopes it), most urgent first as the server sorts
// them. One GET /stock (every non-ok state); the chips filter it here, so their counts stay right.
// A row opens the machine's Stock tab; with stock:write, Record refill inline.
import { useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Button } from 'antd';
import { api } from '../../api/client.js';
import { useCan, useDisplayTz } from '../../auth/session.js';
import { PageHeader, RefreshButton } from '../../ui/PageHeader.jsx';
import { EmptyState, ErrorPanel, PageSkeleton } from '../../ui/States.jsx';
import { formatCount } from '../../lib/money.js';
import { formatDate, formatDayHeading } from '../../lib/time.js';
import { RecordLevelDialog } from './RecordLevelDialog.jsx';
import { RefillSoonList } from './RefillSoonList.jsx';
import { t } from '../../strings.js';
import styles from './stock.module.css';

export const SOON_STATES = ['empty', 'low', 'refill_needed', 'unknown', 'not_estimated'];

export default function RefillSoonPage() {
  const { tid } = useParams();
  const tz = useDisplayTz();
  const write = useCan()('stock:write');
  const query = useQuery({
    queryKey: ['stock', tid, 'soon'],
    queryFn: ({ signal }) => api('GET', `/stock?tenant=${encodeURIComponent(tid)}`, { signal }).then((r) => r.items),
  });
  const [states, setStates] = useState(() => new Set(SOON_STATES));
  const [dialog, setDialog] = useState(null);   // a row
  const counts = useMemo(() => Object.fromEntries(SOON_STATES.map((s) => [s, (query.data ?? []).filter((r) => r.state === s).length])),
    [query.data]);
  const rows = (query.data ?? []).filter((r) => states.has(r.state));
  const toggle = (s) => setStates((prev) => {
    const next = new Set(prev);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    return next;
  });

  const extraColumns = [
    { key: 'last', title: t('stock.col.lastRefill'), priority: 3, render: (r) => (r.last_refill
      ? t('stock.lastShort', { level: t('stock.grams', { n: formatCount(r.last_refill.level_g) }), when: formatDate(r.last_refill.at, tz) })
      : t('stock.never')) },
    ...(write ? [{ key: 'action', title: t('stock.col.action'), priority: 2, align: 'right', render: (r) => (
      <Button size="small" onClick={(e) => { e.stopPropagation(); e.preventDefault(); setDialog(r); }}>{t('stock.refill')}</Button>
    ) }] : []),
  ];

  return (
    <section>
      <PageHeader overline={formatDayHeading(query.dataUpdatedAt || undefined, tz)} title={t('stock.title')}
        actions={<RefreshButton queries={[query]} />} />
      <div className={styles.chips} role="group" aria-label={t('stock.chips')}>
        {SOON_STATES.map((s) => (
          <Button key={s} aria-pressed={states.has(s)} type={states.has(s) ? 'primary' : 'default'} onClick={() => toggle(s)} className={styles.chip}>
            {t(`stock.${s}`)} <b className="num">{counts[s]}</b>
          </Button>
        ))}
      </div>
      {query.isPending && <PageSkeleton rows={5} />}
      {query.error && <ErrorPanel error={query.error} onRetry={query.refetch} />}
      {query.data && (
        <RefillSoonList rows={rows} extraColumns={extraColumns}
          empty={<EmptyState message={t(query.data.length === 0 ? 'stock.soon.empty' : 'stock.soon.noMatch')} />} />
      )}
      {write && dialog && (
        <RecordLevelDialog open mode="refill" tid={tid} mid={dialog.machine_id} hopper={dialog.hopper}
          hoppers={[{ hopper: dialog.hopper, product_name: dialog.product_name ?? dialog.product_id }]}
          onClose={() => setDialog(null)} />
      )}
    </section>
  );
}
