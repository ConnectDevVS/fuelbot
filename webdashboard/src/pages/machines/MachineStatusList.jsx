// Machines with their status and today (dashboard plan §5.3, §5.4): Home shows up to 6 rows, the
// Machines list (SRV-42) all of them with more columns. StatusBadge renders what the data carries:
// Online/Offline + In/Out of service for tenant users, the platform badge for staff.
import { DataTable } from '../../ui/DataTable.jsx';
import { StatusBadge } from '../../ui/Chips.jsx';
import { RelativeTime } from '../../ui/DateTime.jsx';
import { Money } from '../../ui/Money.jsx';
import { machineName } from '../../lib/names.js';
import { t, tn } from '../../strings.js';
import styles from './machines.module.css';

export const machineHref = (m) => `/t/${encodeURIComponent(m.tenant_id)}/machines/${encodeURIComponent(m.id)}/menu`;

export function MachineCell({ m }) {
  return (
    <span className={styles.machine}>
      <b>{machineName(m)}</b>
      <span className="mono">{m.id}</span>
    </span>
  );
}

/** ₹ revenue · n orders (· n not dispensed) from a /fleet item's `today`. */
export function TodayCell({ m }) {
  const today = m.today ?? {};
  return (
    <span className={styles.today}>
      <Money value={today.revenue ?? 0} />
      <span> · {tn('fleet.orders', today.count ?? 0)}</span>
      {today.not_dispensed > 0 && <span className={styles.nd}> · {t('fleet.notDispensed', { n: today.not_dispensed })}</span>}
    </span>
  );
}

/**
 * machines: /fleet items. now: the query's dataUpdatedAt (for "4 min ago"). limit: the first n rows.
 * extraColumns: more DataTable columns after Today (SRV-42). empty: shown when there are none.
 */
export function MachineStatusList({ machines, now, limit, extraColumns = [], empty }) {
  const columns = [
    { key: 'machine', title: t('fleet.col.machine'), priority: 1, render: (m) => <MachineCell m={m} /> },
    { key: 'status', title: t('fleet.col.status'), priority: 2, render: (m) => <StatusBadge machine={m} /> },
    { key: 'today', title: t('fleet.col.today'), priority: 2, align: 'right', render: (m) => <TodayCell m={m} /> },
    { key: 'seen', title: t('fleet.col.seen'), priority: 2, render: (m) => <span className={styles.seen}><RelativeTime value={m.last_seen_at} now={now} /></span> },
    ...extraColumns,
  ];
  const rows = limit ? machines.slice(0, limit) : machines;
  return <DataTable columns={columns} rows={rows} rowHref={machineHref} empty={empty} />;
}
