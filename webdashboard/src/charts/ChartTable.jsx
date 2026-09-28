// "Show as table" under each chart: the same numbers without a chart (and without hovering).
import { useState } from 'react';
import { Button } from 'antd';
import { TableOutlined } from '@ant-design/icons';
import { t } from '../strings.js';
import styles from './charts.module.css';

/** columns: [{key, title, align?, render(row)}]; totals: a row object or null. */
export function ChartTable({ columns, rows, totals, caption }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`${styles.tableToggle} no-print`}>
      <Button type="link" size="small" icon={<TableOutlined />} aria-expanded={open} onClick={() => setOpen(!open)}>
        {t(open ? 'chart.hideTable' : 'chart.showTable')}
      </Button>
      {open && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className="overline">{caption}</caption>
            <thead>
              <tr>{columns.map((c) => <th key={c.key} className={`overline ${c.align === 'right' ? styles.right : ''}`}>{c.title}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>{columns.map((c) => <td key={c.key} className={c.align === 'right' ? styles.right : ''}>{c.render(r)}</td>)}</tr>
              ))}
            </tbody>
            {totals && (
              <tfoot>
                <tr>{columns.map((c) => <td key={c.key} className={c.align === 'right' ? styles.right : ''}>{c.render(totals)}</td>)}</tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
