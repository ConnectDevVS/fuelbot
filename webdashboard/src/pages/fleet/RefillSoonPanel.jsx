// Fleet's "Refill soon": collapsed by default, and GET /stock only when opened (dashboard plan
// §2.6: /stock costs queries per machine and hopper).
import { useQuery } from '@tanstack/react-query';
import { Collapse } from 'antd';
import { api } from '../../api/client.js';
import { DataTable } from '../../ui/DataTable.jsx';
import { StockChip } from '../../ui/Chips.jsx';
import { EmptyState, ErrorPanel, PageSkeleton } from '../../ui/States.jsx';
import { formatCount } from '../../lib/money.js';
import { t, tn } from '../../strings.js';

const STATES = 'empty,low,refill_needed';

function RefillSoonList({ tenantNames }) {
  const query = useQuery({
    queryKey: ['stock', 'fleet', STATES],
    queryFn: ({ signal }) => api('GET', `/stock?state=${STATES}`, { signal }).then((r) => r.items),
  });
  if (query.isPending) return <PageSkeleton rows={3} />;
  if (query.error) return <ErrorPanel error={query.error} onRetry={query.refetch} />;
  const columns = [
    { key: 'product', title: t('stock.col.product'), priority: 1, render: (r) => `${r.product_name ?? r.product_id} · ${t('stock.hopper', { n: r.hopper })}` },
    { key: 'state', title: t('stock.col.state'), priority: 2, render: (r) => <StockChip state={r.state} /> },
    { key: 'machine', title: t('stock.col.machine'), priority: 2, render: (r) => <span>{r.machine_name || r.machine_id} <span className="mono">{r.machine_id}</span></span> },
    { key: 'tenant', title: t('stock.col.tenant'), priority: 3, render: (r) => tenantNames.get(r.tenant_id) ?? r.tenant_id },
    { key: 'left', title: t('stock.col.left'), priority: 2, align: 'right',
      render: (r) => (r.portions_left === null || r.portions_left === undefined ? '—' : tn('stock.portions', r.portions_left, { n: formatCount(r.portions_left) })) },
  ];
  return (
    <DataTable columns={columns} rows={query.data} rowKey={(r) => `${r.machine_id}:${r.hopper}`}
      rowHref={(r) => `/t/${encodeURIComponent(r.tenant_id)}/machines/${encodeURIComponent(r.machine_id)}/stock`}
      empty={<EmptyState message={t('fleet.refill.none')} />} />
  );
}

export function RefillSoonPanel({ tenantNames }) {
  // antd Collapse renders a panel's children only once it's opened (no forceRender): the query
  // above isn't even mounted until then.
  return (
    <Collapse items={[{ key: 'refill', label: <b>{t('fleet.refill.title')}</b>, children: <RefillSoonList tenantNames={tenantNames} /> }]} />
  );
}
