// The chart tooltip (antd Tooltip, so it follows hover, keyboard focus and touch, with the theme and
// nonce): the value leads, the label follows; series keyed by a short stroke of their colour.
import { Tooltip } from 'antd';
import { palette } from '../theme/palette.js';
import styles from './charts.module.css';

/** rows: [{key, series ('a' | 'b' | null), label, value}] */
export function ChartTooltipContent({ title, rows }) {
  return (
    <div className={styles.tip}>
      <div className={styles.tipTitle}>{title}</div>
      {rows.map((r) => (
        <div key={r.key} className={styles.tipRow}>
          {r.series ? <span className={`${styles.tipKey} ${r.series === 'b' ? styles.keyB : styles.keyA}`} aria-hidden="true" /> : <span className={styles.tipKeySpace} />}
          <b className="num">{r.value}</b>
          <span className={styles.tipLabel}>{r.label}</span>
        </div>
      ))}
    </div>
  );
}

export function ChartTooltip({ title, rows, children }) {
  return (
    <Tooltip title={<ChartTooltipContent title={title} rows={rows} />} color={palette.surface} trigger={['hover', 'focus', 'click']}
      mouseEnterDelay={0} mouseLeaveDelay={0.05} destroyOnHidden>
      {children}
    </Tooltip>
  );
}
