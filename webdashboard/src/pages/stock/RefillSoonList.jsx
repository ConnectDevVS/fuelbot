// Hoppers that need attention (dashboard plan §5.3, §5.10), as GET /stock returns them (sorted by
// urgency): product with machine · hopper under it, the StockChip, portions and ≈ days left. Home
// shows the top 5, Fleet's panel adds the tenant, the Stock page (SRV-41) adds its own columns.
import { DataTable } from '../../ui/DataTable.jsx';
import { StockChip } from '../../ui/Chips.jsx';
import { formatCount } from '../../lib/money.js';
import { t, tn } from '../../strings.js';
import styles from './stock.module.css';

export const stockHref = (r) => `/t/${encodeURIComponent(r.tenant_id)}/machines/${encodeURIComponent(r.machine_id)}/stock`;

export function LeftCell({ r }) {
  if (r.portions_left === null || r.portions_left === undefined) return <span className={styles.left}>—</span>;
  return (
    <span className={styles.left}>
      <span className="num">{tn('stock.portions', r.portions_left, { n: formatCount(r.portions_left) })}</span>
      {r.portions_left > 0 && r.days_left !== null && r.days_left !== undefined && <span className={styles.days}>{tn('stock.days', r.days_left)}</span>}
    </span>
  );
}

/**
 * rows: /stock items. limit: the first n. tenantNames: Map id → name adds a Tenant column (staff).
 * extraColumns: more DataTable columns (SRV-41). empty: shown when there are none.
 */
export function RefillSoonList({ rows, limit, tenantNames, extraColumns = [], empty }) {
  const columns = [
    { key: 'product', title: t('stock.col.product'), priority: 1, render: (r) => (
      <span className={styles.product}>
        <b>{r.product_name ?? r.product_id}</b>
        <span className="overline">{r.machine_name || r.machine_id} · {t('stock.hopper', { n: r.hopper })}</span>
      </span>
    ) },
    { key: 'state', title: t('stock.col.state'), priority: 2, render: (r) => <StockChip state={r.state} /> },
    ...(tenantNames ? [{ key: 'tenant', title: t('stock.col.tenant'), priority: 3, render: (r) => tenantNames.get(r.tenant_id) ?? r.tenant_id }] : []),
    { key: 'left', title: t('stock.col.left'), priority: 2, align: 'right', render: (r) => <LeftCell r={r} /> },
    ...extraColumns,
  ];
  const shown = limit ? rows.slice(0, limit) : rows;
  return <DataTable columns={columns} rows={shown} rowKey={(r) => `${r.machine_id}:${r.hopper}`} rowHref={stockHref} empty={empty} />;
}
