// A page block (Home, Sales): a card that is a named region, with a title, an optional line under
// it and actions on the right (wrapping under on a phone). `Loaded` renders one query's states inside
// it: a skeleton, an error with Retry (the rest of the page stays usable), or the content.
import { Card } from 'antd';
import { ErrorPanel, PageSkeleton } from './States.jsx';
import styles from './ui.module.css';

export function Panel({ title, sub, extra, children }) {
  return (
    <Card className={styles.panel} role="region" aria-label={title}>
      <div className={styles.panelHead}>
        <div className={styles.panelText}>
          <h2 className={styles.panelTitle}>{title}</h2>
          {sub && <div className={styles.panelSub}>{sub}</div>}
        </div>
        {extra}
      </div>
      {children}
    </Card>
  );
}

/** children: a function, called only once the query has data. */
export function Loaded({ query, rows = 4, children }) {
  if (query.isPending) return <PageSkeleton kind="plain" rows={rows} />;
  if (query.error) return <ErrorPanel error={query.error} onRetry={query.refetch} />;
  return children();
}
