// Every sale matching the filters (dashboard plan §5.7, §5.8; SRV-40): GET /sales, 50 at a time,
// newest first, with Load more (the API pages by cursor). A row opens the order. The tenant view
// says Dispensed / Not dispensed only; staff rows carry the result and reason, and get those
// columns. `focused` is the Not dispensed tab's shorter set. Time, amount and transaction never
// wrap: a wide table scrolls inside its own box on tablet (plan §2.9).
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { DataTable, LoadMore } from '../../ui/DataTable.jsx';
import { DispensedChip } from '../../ui/Chips.jsx';
import { DateTime } from '../../ui/DateTime.jsx';
import { Id } from '../../ui/Id.jsx';
import { Money } from '../../ui/Money.jsx';
import { EmptyState, ErrorPanel, PageSkeleton } from '../../ui/States.jsx';
import { nameOf } from '../../lib/names.js';
import { t } from '../../strings.js';
import styles from './sales.module.css';

export const PAGE_SIZE = 50;

export function useSalesList(params, enabled = true) {
  const qs = params.toString();
  return useInfiniteQuery({
    enabled,
    queryKey: ['sales', 'list', qs],
    queryFn: ({ pageParam, signal }) => {
      const q = new URLSearchParams(qs);
      q.set('limit', String(PAGE_SIZE));
      if (pageParam) q.set('cursor', pageParam);
      return api('GET', `/sales?${q}`, { signal });
    },
    initialPageParam: null,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
}

export const orderHref = (s) => `/orders/${encodeURIComponent(s.order_id)}`;

/** Charged, with the list price struck through when an offer applied. */
export function Charged({ sale }) {
  const offer = sale.offer_price !== null && sale.offer_price !== undefined && sale.offer_price !== sale.actual_price;
  return <Money value={sale.charged_price} was={offer ? sale.actual_price : undefined} />;
}

/**
 * query: useSalesList(...). names: {machineNames, flavorNames} (Maps, ids shown when unknown).
 * staff: adds Result + Reason. focused: the Not dispensed columns. empty: the empty message.
 */
export function SalesTable({ query, names, staff, focused = false, empty }) {
  if (query.isPending) return <PageSkeleton kind="plain" rows={6} />;
  if (query.error) return <ErrorPanel error={query.error} onRetry={query.refetch} />;
  const rows = query.data.pages.flatMap((p) => p.items);
  const machine = (s) => nameOf(names.machineNames, s.machine_id);
  const flavor = (s) => nameOf(names.flavorNames, s.flavor_id);
  const columns = [
    { key: 'time', title: t('sales.col.time'), priority: 1, render: (s) => <span className={styles.nowrap}><DateTime value={s.ts} /></span> },
    { key: 'order', title: t('sales.col.order'), priority: 3, align: 'right', render: (s) => <span className="num">{s.order_number ?? '—'}</span> },
    { key: 'machine', title: t('sales.col.machine'), priority: 2, render: machine },
    { key: 'flavor', title: t('sales.col.flavor'), priority: 2, render: flavor },
    ...(focused ? [] : [{ key: 'base', title: t('sales.col.base'), priority: 3, render: (s) => s.base_id ?? '—' }]),
    { key: 'charged', title: t('sales.col.charged'), priority: 2, align: 'right', render: (s) => <span className={styles.nowrap}><Charged sale={s} /></span> },
    ...(focused ? [] : [{ key: 'payment', title: t('sales.col.payment'), priority: 3, render: (s) => (s.payment_method ?? '—').toUpperCase() }]),
    { key: 'txn', title: t('sales.col.transaction'), priority: focused ? 2 : 3,
      render: (s) => (s.transaction_id ? <span className={styles.nowrap} onClick={(e) => e.stopPropagation()}><Id value={s.transaction_id} /></span> : '—') },
    ...(focused ? [] : [{ key: 'status', title: t('sales.col.status'), priority: 2, render: (s) => <DispensedChip sale={s} /> }]),
    ...(staff ? [
      // On the Not dispensed list they're the point: phone cards show them too.
      { key: 'result', title: t('sales.col.result'), priority: focused ? 2 : 3, render: (s) => s.dispensing_result ?? '—' },
      { key: 'reason', title: t('sales.col.reason'), priority: focused ? 2 : 3, render: (s) => s.dispensing_reason || '—' },
    ] : []),
  ];
  return (
    <DataTable columns={columns} rows={rows} rowKey="order_id" rowHref={orderHref}
      empty={<EmptyState message={empty ?? t('sales.noSales')} />}
      footer={<LoadMore hasMore={query.hasNextPage} loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()} />} />
  );
}
