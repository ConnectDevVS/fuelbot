// Tables (§4 pattern 5, §2.9): antd Table from 760 px; below, a card per row with the columns of
// priority ≤ 2 (the first column is the card's title, the rest label/value pairs). A row links to
// its page (rowHref): the first cell is a real link, so keyboards and screen readers reach it.
// Cursor lists page with Load more (no page numbers: the API pages by cursor).
import { Link, useNavigate } from 'react-router';
import { Button, Card, Table } from 'antd';
import { useLayoutSize } from '../lib/useMedia.js';
import { t } from '../strings.js';
import styles from './ui.module.css';

/**
 * columns: [{key, title, render?(row), align?, priority? (1 = always; phone shows ≤ 2), sorter?, width?}]
 */
export function DataTable({ columns, rows, rowKey = 'id', rowHref, loading, empty, footer }) {
  const phone = useLayoutSize() === 'phone';
  const navigate = useNavigate();
  const keyOf = (row) => (typeof rowKey === 'function' ? rowKey(row) : row[rowKey]);
  const cell = (col, row) => (col.render ? col.render(row) : row[col.key]);
  const titleCell = (row) => {
    const content = cell(columns[0], row);
    return rowHref ? <Link to={rowHref(row)} onClick={(e) => e.stopPropagation()}>{content}</Link> : content;
  };

  if (phone) {
    const shown = columns.slice(1).filter((c) => (c.priority ?? 3) <= 2);
    return (
      <div className={styles.cards}>
        {rows.length === 0 && !loading && empty}
        {rows.map((row) => (
          <Card key={keyOf(row)} size="small" className={rowHref ? styles.clickable : undefined}
            onClick={rowHref ? () => navigate(rowHref(row)) : undefined}>
            <div className={styles.cardTitle}>{titleCell(row)}</div>
            {shown.length > 0 && (
              <dl className={styles.pairs}>
                {shown.map((c) => [
                  <dt key={`${c.key}-t`} className="overline">{c.title}</dt>,
                  <dd key={`${c.key}-v`}>{cell(c, row)}</dd>,
                ])}
              </dl>
            )}
          </Card>
        ))}
        {footer}
      </div>
    );
  }

  const antColumns = columns.map((c, i) => ({
    key: c.key,
    dataIndex: c.key,
    title: <span className="overline">{c.title}</span>,
    align: c.align,
    width: c.width,
    sorter: c.sorter,
    render: (_, row) => (i === 0 ? titleCell(row) : cell(c, row)),
  }));
  return (
    <div className={styles.tableWrap}>
      <Table
        columns={antColumns}
        dataSource={rows}
        rowKey={keyOf}
        loading={loading}
        pagination={false}
        size="middle"
        locale={{ emptyText: empty ?? t('table.empty') }}
        rowClassName={rowHref ? styles.clickable : undefined}
        onRow={rowHref ? (row) => ({ onClick: () => navigate(rowHref(row)) }) : undefined}
      />
      {footer}
    </div>
  );
}

/** Load more for a cursor list (useInfiniteQuery: hasNextPage / fetchNextPage). */
export function LoadMore({ hasMore, loading, onClick }) {
  if (!hasMore) return null;
  return (
    <div className={styles.loadMore}>
      <Button onClick={onClick} loading={loading}>{t('table.loadMore')}</Button>
    </div>
  );
}
