// A machine's refills and adjustments (dashboard plan §5.6.3): newest first, 20 at a time with Load
// more (GET …/stock/history, cursor). When, kind, hopper, product (the one recorded), level, by, note.
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { DataTable, LoadMore } from '../../ui/DataTable.jsx';
import { DateTime } from '../../ui/DateTime.jsx';
import { EmptyState, ErrorPanel, PageSkeleton } from '../../ui/States.jsx';
import { formatCount } from '../../lib/money.js';
import { nameOf } from '../../lib/names.js';
import { t } from '../../strings.js';
import { machinePath } from './machineQuery.js';

export function useStockHistory(tid, mid) {
  return useInfiniteQuery({
    queryKey: ['stock', tid, 'history', mid],
    queryFn: ({ pageParam, signal }) => api('GET',
      `${machinePath(tid, mid)}/stock/history?limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`, { signal }),
    initialPageParam: null,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
}

export function StockHistory({ query, flavorNames }) {
  if (query.isPending) return <PageSkeleton kind="plain" rows={4} />;
  if (query.error) return <ErrorPanel error={query.error} onRetry={query.refetch} />;
  const rows = query.data.pages.flatMap((p) => p.items);
  return (
    <DataTable rows={rows} empty={<EmptyState message={t('stock.history.none')} />}
      columns={[
        { key: 'when', title: t('stock.col.when'), priority: 1, render: (e) => <DateTime value={e.at} /> },
        { key: 'kind', title: t('stock.col.kind'), priority: 2, render: (e) => t(`stock.kind.${e.kind}`) },
        { key: 'hopper', title: t('stock.col.hopper'), priority: 2, align: 'right', render: (e) => <span className="num">{e.hopper}</span> },
        { key: 'product', title: t('stock.col.product'), priority: 2, render: (e) => nameOf(flavorNames, e.product_id) },
        { key: 'level', title: t('stock.col.level'), priority: 2, align: 'right',
          render: (e) => <span className="num">{t('stock.grams', { n: formatCount(e.level_g) })}</span> },
        { key: 'by', title: t('stock.col.by'), priority: 2, render: (e) => e.user_email ?? '—' },
        { key: 'note', title: t('stock.col.note'), priority: 3, render: (e) => e.note || '—' },
      ]}
      footer={<LoadMore hasMore={query.hasNextPage} loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()} />} />
  );
}
