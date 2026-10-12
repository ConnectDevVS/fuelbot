// The printed report's header and not-dispensed list (dashboard plan §5.8): shown on paper only.
// The list is every not-dispensed sale in the period, fetched when "Print report" is pressed
// (200 a page, up to 1,000 rows, with a note beyond).
import { api } from '../../api/client.js';
import { DateTime } from '../../ui/DateTime.jsx';
import { nameOf } from '../../lib/names.js';
import { formatDateTime } from '../../lib/time.js';
import { t } from '../../strings.js';
import { Charged } from './SalesTable.jsx';
import styles from './sales.module.css';

export const PRINT_CAP = 1000;

/** Every sale for params (dispensed=false), 200 at a time, up to PRINT_CAP. → {rows, capped} */
export async function fetchAllSales(params, { signal } = {}) {
  const rows = [];
  let cursor = null;
  do {
    const q = new URLSearchParams(params);
    q.set('limit', '200');
    if (cursor) q.set('cursor', cursor);
    const page = await api('GET', `/sales?${q}`, { signal });
    rows.push(...page.items);
    cursor = page.next_cursor;
  } while (cursor && rows.length < PRINT_CAP);
  return { rows: rows.slice(0, PRINT_CAP), capped: Boolean(cursor) || rows.length > PRINT_CAP };
}

/** tenantName, period (words), by (group words), who (email), at (ms), tz. */
export function PrintHeader({ tenantName, period, by, who, at, tz }) {
  return (
    <header className={`print-only ${styles.printHeader}`}>
      <div className="overline">{[tenantName, period, by].filter(Boolean).join(' · ')}</div>
      <h1 className="page-title">{t('sales.print.title')}</h1>
      <div className={styles.printMeta}>{t('sales.print.generated', { time: formatDateTime(at, tz), who })}</div>
    </header>
  );
}

/** The fetched not-dispensed rows as a plain table (no links, no buttons). */
export function PrintNotDispensed({ data, names, staff }) {
  if (!data) return null;
  return (
    <section className={`print-only ${styles.printBlock}`} aria-label={t('sales.tab.notDispensed')}>
      <h2 className={styles.printTitle}>{t('sales.nd.tab', { n: data.rows.length })}</h2>
      <p className={styles.printMeta}>{t('sales.nd.note')}</p>
      {data.rows.length === 0 ? <p>{t('sales.nd.none')}</p> : (
        <table className={styles.printTable}>
          <thead>
            <tr>
              {['time', 'order', 'machine', 'flavor', 'charged', 'transaction', ...(staff ? ['result', 'reason'] : [])]
                .map((c) => <th key={c} className="overline">{t(`sales.col.${c}`)}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((s) => (
              <tr key={s.order_id}>
                <td><DateTime value={s.ts} /></td>
                <td className="num">{s.order_number ?? '—'}</td>
                <td>{nameOf(names.machineNames, s.machine_id)}</td>
                <td>{nameOf(names.flavorNames, s.flavor_id)}</td>
                <td className="num"><Charged sale={s} /></td>
                <td className="mono">{s.transaction_id ?? '—'}</td>
                {staff && <td>{s.dispensing_result ?? '—'}</td>}
                {staff && <td>{s.dispensing_reason || '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {data.capped && <p className={styles.printMeta}>{t('sales.print.capped', { n: PRINT_CAP })}</p>}
    </section>
  );
}
