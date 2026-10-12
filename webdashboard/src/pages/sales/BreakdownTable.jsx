// A breakdown of a summary (dashboard plan §5.7): By flavor, By machine or By tenant. The key's
// name (the id when unknown), orders, revenue, share of the totals' revenue, not dispensed n / ₹.
// Rows stay in the server's order (by revenue).
import { DataTable } from '../../ui/DataTable.jsx';
import { EmptyState } from '../../ui/States.jsx';
import { formatCount, formatMoney } from '../../lib/money.js';
import { t } from '../../strings.js';

/** Share of the total in whole percent ('<1%' for a sliver, '—' when there's no total). */
export function sharePercent(revenue, total) {
  if (!total) return '—';
  const pct = (revenue / total) * 100;
  if (pct > 0 && pct < 1) return '<1%';
  return `${Math.round(pct)}%`;
}

/** items/totals: a summary response. names: Map key → name. keyTitle: the first column's title. */
export function BreakdownTable({ items, totals, names, keyTitle }) {
  const columns = [
    { key: 'key', title: keyTitle, priority: 1, render: (r) => names?.get(r.key) ?? r.key },
    { key: 'orders', title: t('sales.col.orders'), priority: 2, align: 'right', render: (r) => <span className="num">{formatCount(r.count)}</span> },
    { key: 'revenue', title: t('sales.col.revenue'), priority: 2, align: 'right', render: (r) => <span className="num">{formatMoney(r.revenue)}</span> },
    { key: 'share', title: t('sales.col.share'), priority: 2, align: 'right', render: (r) => <span className="num">{sharePercent(r.revenue, totals?.revenue)}</span> },
    { key: 'nd', title: t('sales.col.nd'), priority: 2, align: 'right',
      render: (r) => <span className="num">{r.not_dispensed ? `${formatCount(r.not_dispensed)} · ${formatMoney(r.not_dispensed_amount)}` : '—'}</span> },
  ];
  return <DataTable columns={columns} rows={items} rowKey="key" empty={<EmptyState message={t('sales.noSales')} />} />;
}
