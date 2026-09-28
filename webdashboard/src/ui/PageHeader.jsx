// Page header (dashboard plan §4 pattern 1): mono overline, heavy uppercase title, actions on the
// right (wrapping under the title on phone). RefreshButton refetches the page's queries and shows
// "Updated hh:mm IST" from the newest of them. No timers anywhere (§2.6).
import { Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useDisplayTz } from '../auth/session.js';
import { formatClock } from '../lib/time.js';
import { t } from '../strings.js';
import styles from './ui.module.css';

export function PageHeader({ overline, title, actions }) {
  return (
    <div className={styles.header}>
      <div className={styles.headerText}>
        {overline && <div className="overline">{overline}</div>}
        <h1 className="page-title">{title}</h1>
      </div>
      {actions && <div className={styles.headerActions}>{actions}</div>}
    </div>
  );
}

/** queries: React Query results (useQuery return values). */
export function RefreshButton({ queries }) {
  const tz = useDisplayTz();
  const updated = Math.max(0, ...queries.map((q) => q.dataUpdatedAt ?? 0));
  const fetching = queries.some((q) => q.isFetching);
  return (
    <>
      {updated > 0 && <span className={`overline ${styles.updated}`}>{t('refresh.updated', { time: formatClock(updated, tz) })}</span>}
      <Button icon={<ReloadOutlined />} loading={fetching} onClick={() => Promise.all(queries.map((q) => q.refetch()))}>
        {t('refresh.button')}
      </Button>
    </>
  );
}
