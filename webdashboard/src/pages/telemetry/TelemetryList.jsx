// Telemetry events (dashboard plan §5.6.9, §5.16; platform only): GET /telemetry, 50 at a time with
// Load more, filtered by type (the known ones, or any typed in) and a day range in the display zone.
// A dispense_cycle row expands into its stage timeline; an order id links to the order. Shared by a
// machine's Telemetry tab and the staff Telemetry page (SRV-48), which adds the machine column.
import { useState } from 'react';
import { Link } from 'react-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { DatePicker, Input, Select } from 'antd';
import { api } from '../../api/client.js';
import { useDisplayTz } from '../../auth/session.js';
import { DataTable, LoadMore } from '../../ui/DataTable.jsx';
import { DateTime } from '../../ui/DateTime.jsx';
import { StageTimeline } from '../../ui/StageTimeline.jsx';
import { EmptyState, ErrorPanel, PageSkeleton } from '../../ui/States.jsx';
import dayjs from '../../lib/dayjs.js';
import { addDaysKey, localMidnightIso } from '../../lib/time.js';
import { eventDetails } from './eventDetails.js';
import { t } from '../../strings.js';
import styles from './telemetry.module.css';

export const EVENT_TYPES = ['dispense_cycle', 'machine_fault', 'machine_ok', 'bridge_down', 'bridge_up', 'image_download_failed'];
const OTHER = '__other__';

/** base: fixed params ({machine} or {tenant}); showMachine: the staff page's machine column. */
export function TelemetryList({ base = {}, showMachine = false }) {
  const tz = useDisplayTz();
  const [type, setType] = useState('');
  const [other, setOther] = useState('');
  const [from, setFrom] = useState(null);   // 'YYYY-MM-DD'
  const [to, setTo] = useState(null);
  const q = new URLSearchParams(Object.entries(base).filter(([, v]) => v));
  const effectiveType = type === OTHER ? other.trim() : type;
  if (effectiveType) q.set('type', effectiveType);
  if (from) q.set('from', localMidnightIso(from, tz));
  if (to) q.set('to', localMidnightIso(addDaysKey(to, 1), tz));
  const qs = q.toString();
  const query = useInfiniteQuery({
    queryKey: ['telemetry', qs],
    queryFn: ({ pageParam, signal }) => {
      const p = new URLSearchParams(qs);
      p.set('limit', '50');
      if (pageParam) p.set('cursor', pageParam);
      return api('GET', `/telemetry?${p}`, { signal });
    },
    initialPageParam: null,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];
  const day = (setter) => (d) => setter(d ? d.format('YYYY-MM-DD') : null);

  const columns = [
    { key: 'time', title: t('tel.col.time'), priority: 1, render: (e) => <span className={styles.nowrap}><DateTime value={e.ts} /></span> },
    ...(showMachine ? [{ key: 'machine', title: t('tel.col.machine'), priority: 2, render: (e) => <span className="mono">{e.machine_id ?? '—'}</span> }] : []),
    { key: 'type', title: t('tel.col.type'), priority: 2, render: (e) => <span className="mono">{e.event_type}</span> },
    { key: 'order', title: t('tel.col.order'), priority: 2, render: (e) => (e.order_id
      ? <Link to={`/orders/${encodeURIComponent(e.order_id)}`} onClick={(ev) => ev.stopPropagation()} className="mono">{e.order_id}</Link> : '—') },
    { key: 'result', title: t('tel.col.result'), priority: 2, render: (e) => e.result ?? e.fault ?? e.cleared ?? '—' },
    { key: 'details', title: t('tel.col.details'), priority: 3, render: (e) => <span className={styles.details}>{eventDetails(e) || '—'}</span> },
  ];

  return (
    <>
      <div className={styles.filters} role="group" aria-label={t('tel.type')}>
        <Select aria-label={t('tel.type')} value={type} onChange={setType} className={styles.type} popupMatchSelectWidth={false}
          options={[{ value: '', label: t('tel.type.all') }, ...EVENT_TYPES.map((x) => ({ value: x, label: x })), { value: OTHER, label: t('tel.type.other') }]} />
        {type === OTHER && <Input aria-label={t('tel.type.other')} value={other} onChange={(e) => setOther(e.target.value)} className={styles.other} />}
        <DatePicker aria-label={t('tel.from')} placeholder={t('tel.from')} format="D MMM YYYY" value={from ? dayjs(from) : null} onChange={day(setFrom)} />
        <DatePicker aria-label={t('tel.to')} placeholder={t('tel.to')} format="D MMM YYYY" value={to ? dayjs(to) : null} onChange={day(setTo)} />
      </div>
      {query.isPending && <PageSkeleton rows={6} />}
      {query.error && <ErrorPanel error={query.error} onRetry={query.refetch} />}
      {query.data && (
        <DataTable columns={columns} rows={rows} empty={<EmptyState message={t('tel.empty')} />}
          expand={{ can: (e) => e.event_type === 'dispense_cycle' && (e.stages ?? []).length > 0,
            render: (e) => <StageTimeline stages={e.stages ?? []} durationMs={e.duration_ms ?? null} /> }}
          footer={<LoadMore hasMore={query.hasNextPage} loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()} />} />
      )}
    </>
  );
}
