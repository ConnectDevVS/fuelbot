// A row of filters (dashboard plan §2.9): inline on tablet and desktop; on a phone, a "Filters (n)"
// button whose sheet holds the same controls, one per line and full width. The controls apply as
// they change (as in the row); "Show results" closes the sheet, Reset clears them. (The Sales page
// has its own draft-and-apply sheet: its filters live in the URL.)
import { useState } from 'react';
import { Button } from 'antd';
import { FilterOutlined } from '@ant-design/icons';
import { useLayoutSize } from '../lib/useMedia.js';
import { Sheet } from './Sheet.jsx';
import { t } from '../strings.js';
import styles from './ui.module.css';

/** label: the group's name; count: active filters (for the phone button); onReset(); children: the controls. */
export function FilterBar({ label, count = 0, onReset, children }) {
  const phone = useLayoutSize() === 'phone';
  const [open, setOpen] = useState(false);
  if (!phone) return <div className={styles.filterRow} role="group" aria-label={label}>{children}</div>;
  return (
    <div className={styles.filterBar}>
      <Button icon={<FilterOutlined />} onClick={() => setOpen(true)}>
        {count ? t('filters.count', { n: count }) : t('filters.title')}
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)}
        title={(
          <div className={styles.filterSheetTitle}>
            <span>{t('filters.title')}</span>
            {onReset && <Button type="link" disabled={!count} onClick={onReset}>{t('filters.reset')}</Button>}
          </div>
        )}
        footer={<Button size="large" type="primary" block onClick={() => setOpen(false)}>{t('filters.done')}</Button>}>
        <div className={styles.filterStack} role="group" aria-label={label}>{children}</div>
      </Sheet>
    </div>
  );
}
