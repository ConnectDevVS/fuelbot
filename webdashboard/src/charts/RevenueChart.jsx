// Revenue over time (dashboard plan §2.8, §5.3; SRV-37): a column per day / ISO week / month in the
// display zone, missing buckets as zero. The dispensed part (revenue − not dispensed) from the
// baseline; the not-dispensed part stacked on top, hatched at 135°, after a 2 px surface gap.
// Columns ≤ 24 px, 4 px rounded tops, square at the baseline; one ₹ axis; hairline grid; legend
// above; a tooltip per column (hover, focus, tap); "Show as table" below.
import { useId } from 'react';
import { ChartTooltip } from './ChartTooltip.jsx';
import { ChartTable } from './ChartTable.jsx';
import { formatAxisMoney, niceTicks, placeLabels } from './scales.js';
import { useWidth } from './useWidth.js';
import { bucketAxisLabel, bucketKeys, bucketLabel } from '../lib/time.js';
import { formatCount, formatMoney } from '../lib/money.js';
import { useLayoutSize } from '../lib/useMedia.js';
import { EmptyState } from '../ui/States.jsx';
import { t, tn } from '../strings.js';
import styles from './charts.module.css';

const HEIGHT = { desktop: 200, tablet: 180, phone: 160 };
const GAP = 2;
const RADIUS = 4;
const MAX_BAR = 24;
const PAD_TOP = 8;   // room for the top tick's label

/** A rectangle with rounded top corners only (square at the baseline). */
export function roundedTop(x, y, w, h, r = RADIUS) {
  const rr = Math.max(0, Math.min(r, h, w / 2));
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

/** Buckets in order, zero-filled, from the summary items. */
export function revenueSeries(items, group, from, to, tz) {
  const byKey = new Map((items ?? []).map((i) => [i.key, i]));
  const keys = from && to ? bucketKeys(group, from, to, tz) : (items ?? []).map((i) => i.key);
  return keys.map((key) => {
    const i = byKey.get(key) ?? {};
    const revenue = i.revenue ?? 0;
    const nd = Math.min(i.not_dispensed_amount ?? 0, revenue);
    return { key, revenue, dispensed: revenue - nd, notDispensedAmount: nd, count: i.count ?? 0, notDispensed: i.not_dispensed ?? 0 };
  });
}

export function HatchSwatch({ className }) {
  const id = `h${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg className={className} viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
      <Hatch id={id} />
      <rect width="12" height="12" rx="2" fill={`url(#${id})`} />
    </svg>
  );
}

/** The 135° hatch: lines of the not-dispensed colour on a light wash of it. */
function Hatch({ id }) {
  return (
    <defs>
      <pattern id={id} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(135)">
        <rect width="5" height="5" className={styles.hatchBg} />
        <line x1="0" y1="0" x2="0" y2="5" className={styles.hatchLine} />
      </pattern>
    </defs>
  );
}

export function RevenueChart({ items, group = 'day', from, to, tz = 'Asia/Kolkata', title }) {
  const size = useLayoutSize();
  const [ref, width] = useWidth();
  const hatchId = `hatch${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const series = revenueSeries(items, group, from, to, tz);
  const empty = series.every((b) => b.revenue === 0);
  const compact = size === 'phone';

  const height = HEIGHT[size] ?? 200;
  const ticks = niceTicks(Math.max(...series.map((b) => b.revenue), 0));
  const top = ticks.at(-1);
  const left = compact ? 40 : 56;
  const plotW = Math.max(0, width - left - 4);
  const plotH = height;
  const svgH = PAD_TOP + plotH + 26;
  const band = series.length ? plotW / series.length : plotW;
  const barW = Math.max(2, Math.min(MAX_BAR, band - 4, band * 0.62));
  const y = (v) => plotH - (top > 0 ? (v / top) * plotH : 0);
  // x labels: centred, clamped inside the plot, never touching (mono 11 px ≈ 7 px a character).
  const axisLabels = series.map((b) => bucketAxisLabel(b.key, group));
  const placed = placeLabels(series.map((_, i) => left + band * i + band / 2), axisLabels.map((l) => l.length * 7), left, width);
  const labelAt = new Map(placed.map((p) => [p.i, p.x]));
  const hasNd = series.some((b) => b.notDispensedAmount > 0);

  const describe = (b) => [
    `${bucketLabel(b.key, group)}: ${formatMoney(b.revenue)}`,
    tn('chart.orders', b.count, { n: formatCount(b.count) }),
    b.notDispensed ? t('chart.ndShort', { n: b.notDispensed, amount: formatMoney(b.notDispensedAmount) }) : null,
  ].filter(Boolean).join(', ');

  const totals = series.reduce((acc, b) => ({ key: 'total', revenue: acc.revenue + b.revenue, count: acc.count + b.count,
    notDispensed: acc.notDispensed + b.notDispensed, notDispensedAmount: acc.notDispensedAmount + b.notDispensedAmount }),
  { revenue: 0, count: 0, notDispensed: 0, notDispensedAmount: 0 });

  return (
    <figure className={styles.figure} aria-label={title ?? t('chart.revenue')}>
      <div className={styles.legend}>
        <span className={styles.legendItem}><span className={`${styles.swatch} ${styles.fillA}`} aria-hidden="true" />{t('chart.dispensed')}</span>
        <span className={styles.legendItem}><HatchSwatch className={styles.swatchSvg} />{t('chart.notDispensed')}</span>
      </div>
      <div ref={ref} className={styles.plot}>
        {empty ? <EmptyState message={t('chart.noSales')} /> : (
          <svg className={styles.svg} viewBox={`0 0 ${width} ${svgH}`} width="100%" height={svgH} role="group"
            aria-label={t('chart.revenueAria', { n: series.length })}>
            <Hatch id={hatchId} />
            <g transform={`translate(0 ${PAD_TOP})`}>
            {ticks.map((v) => (
              <g key={v}>
                <line x1={left} x2={width} y1={y(v)} y2={y(v)} className={v === 0 ? styles.baseline : styles.grid} />
                <text x={left - 6} y={y(v)} dy="0.32em" textAnchor="end" className={styles.axisText}>{formatAxisMoney(v, compact)}</text>
              </g>
            ))}
            {series.map((b, i) => {
              const cx = left + band * i + band / 2;
              const x = cx - barW / 2;
              const yTop = y(b.revenue);
              const yD = y(b.dispensed);
              const dH = plotH - yD;
              const ndH = Math.max(0, yD - yTop - (dH > 0 ? GAP : 0));   // the gap sits between two parts only
              const showNd = b.notDispensedAmount > 0 && ndH >= 1;
              return (
                <g key={b.key} className={styles.bar}>
                  {dH > 0 && (showNd
                    ? <rect x={x} y={yD} width={barW} height={dH} className={styles.fillA} data-part="dispensed" />
                    : <path d={roundedTop(x, yD, barW, dH)} className={styles.fillA} data-part="dispensed" />)}
                  {showNd && <path d={roundedTop(x, yTop, barW, ndH)} fill={`url(#${hatchId})`} data-part="not-dispensed" />}
                  {labelAt.has(i) && (
                    <text x={labelAt.get(i)} y={plotH + 17} textAnchor="middle" className={styles.axisText}>{axisLabels[i]}</text>
                  )}
                  <ChartTooltip title={bucketLabel(b.key, group)} rows={[
                    { key: 'r', series: null, value: formatMoney(b.revenue), label: t('chart.revenueWord') },
                    { key: 'c', series: null, value: formatCount(b.count), label: tn('chart.ordersWord', b.count) },
                    ...(hasNd ? [{ key: 'nd', series: 'b', value: formatMoney(b.notDispensedAmount), label: tn('chart.ndTip', b.notDispensed, { n: b.notDispensed }) }] : []),
                  ]}>
                    <rect x={left + band * i} y={0} width={band} height={plotH} className={styles.hit} tabIndex={0}
                      role="img" aria-label={describe(b)} data-bucket={b.key} />
                  </ChartTooltip>
                </g>
              );
            })}
            </g>
          </svg>
        )}
      </div>
      <ChartTable caption={title ?? t('chart.revenue')} rows={series} totals={totals} columns={[
        { key: 'period', title: t('chart.col.period'), render: (r) => (r.key === 'total' ? t('chart.total') : bucketLabel(r.key, group)) },
        { key: 'revenue', title: t('chart.col.revenue'), align: 'right', render: (r) => formatMoney(r.revenue) },
        { key: 'orders', title: t('chart.col.orders'), align: 'right', render: (r) => formatCount(r.count) },
        { key: 'nd', title: t('chart.col.nd'), align: 'right',
          render: (r) => (r.notDispensed ? `${formatCount(r.notDispensed)} · ${formatMoney(r.notDispensedAmount)}` : '—') },
      ]} />
    </figure>
  );
}
