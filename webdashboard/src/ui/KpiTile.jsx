// A KPI (dashboard plan §4): mono label, big number, a line under it; `warn` uses the warn surface.
// A named group, so a screen reader (and a test) finds each tile by its label.
import { Card } from 'antd';
import styles from './ui.module.css';

export function KpiTile({ label, value, sub, warn = false }) {
  return (
    <Card className={`${styles.kpi} ${warn ? styles.kpiWarn : ''}`} size="small" variant="outlined" role="group" aria-label={label}>
      <div className="overline">{label}</div>
      <div className={styles.kpiValue}>{value}</div>
      {sub && <div className={styles.kpiSub}>{sub}</div>}
    </Card>
  );
}
