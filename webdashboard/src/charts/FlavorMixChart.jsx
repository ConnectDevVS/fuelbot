// Flavor mix (dashboard plan §5.3; SRV-37): revenue per flavor, horizontal bars sorted by revenue,
// one series (so no legend: the title says "revenue"), the value at each bar's end. More than 8
// flavors → the top 7 + "Other". Names from the products (archived included); unknown ids as is.
import { ChartTooltip } from './ChartTooltip.jsx';
import { ChartTable } from './ChartTable.jsx';
import { formatCount, formatMoney } from '../lib/money.js';
import { EmptyState } from '../ui/States.jsx';
import { t, tn } from '../strings.js';
import styles from './charts.module.css';

export const OTHER = '__other__';

/** Sorted rows {key, name, revenue, count}; > 8 → top 7 + Other. */
export function flavorRows(items, names) {
  const rows = (items ?? []).filter((i) => (i.revenue ?? 0) > 0 || (i.count ?? 0) > 0)
    .map((i) => ({ key: i.key, name: names?.get(i.key) ?? i.key ?? '—', revenue: i.revenue ?? 0, count: i.count ?? 0 }))
    .sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));
  if (rows.length <= 8) return rows;
  const rest = rows.slice(7);
  return [...rows.slice(0, 7), {
    key: OTHER, name: t('chart.other', { n: rest.length }),
    revenue: rest.reduce((s, r) => s + r.revenue, 0), count: rest.reduce((s, r) => s + r.count, 0),
  }];
}

export function FlavorMixChart({ items, names, title, emptyMessage }) {
  const rows = flavorRows(items, names);
  const max = Math.max(0, ...rows.map((r) => r.revenue));
  const total = rows.reduce((s, r) => ({ key: 'total', name: t('chart.total'), revenue: s.revenue + r.revenue, count: s.count + r.count }),
    { revenue: 0, count: 0 });
  return (
    <figure className={styles.figure} aria-label={title ?? t('chart.flavorMix')}>
      {rows.length === 0 ? <EmptyState message={emptyMessage ?? t('chart.noSales')} /> : (
        <div className={styles.mix} role="list">
          {rows.map((r) => {
            const pct = max > 0 ? (r.revenue / max) * 100 : 0;
            return (
              <ChartTooltip key={r.key} title={r.name} rows={[
                { key: 'r', series: 'a', value: formatMoney(r.revenue), label: t('chart.revenueWord') },
                { key: 'c', series: null, value: formatCount(r.count), label: tn('chart.ordersWord', r.count) },
              ]}>
                <div className={styles.mixRow} role="listitem" tabIndex={0}
                  aria-label={`${r.name}: ${formatMoney(r.revenue)}, ${tn('chart.orders', r.count, { n: formatCount(r.count) })}`}>
                  <span className={styles.mixName}>{r.name}</span>
                  {/* Square at the baseline, 4 px rounded at the data end. The width is set through
                      the CSSOM (React's style prop), which the CSP allows (unlike a style="" string). */}
                  <span className={styles.mixTrack} aria-hidden="true">
                    <span className={`${styles.mixFill} ${styles.fillA}`} style={{ width: `${Math.max(pct, 1)}%` }} />
                  </span>
                  <span className={`num ${styles.mixValue}`}>{formatMoney(r.revenue)}</span>
                </div>
              </ChartTooltip>
            );
          })}
        </div>
      )}
      <ChartTable caption={title ?? t('chart.flavorMix')} rows={rows} totals={rows.length ? total : null} columns={[
        { key: 'flavor', title: t('chart.col.flavor'), render: (r) => r.name },
        { key: 'revenue', title: t('chart.col.revenue'), align: 'right', render: (r) => formatMoney(r.revenue) },
        { key: 'orders', title: t('chart.col.orders'), align: 'right', render: (r) => formatCount(r.count) },
      ]} />
    </figure>
  );
}
