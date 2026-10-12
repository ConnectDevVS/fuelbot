// Export CSV (dashboard plan §5.7): a plain link to the server's streamed CSV with the page's
// filters (never limit or cursor: the export is every matching sale). The session cookie
// authenticates it; the server picks the tenant or platform columns.
import { Button } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { t } from '../../strings.js';

/** params: URLSearchParams of the filters (filters.js filterParams). */
export function csvHref(params) {
  const q = new URLSearchParams(params);
  q.delete('limit');
  q.delete('cursor');
  q.delete('group');
  return `/api/v1/sales/export.csv?${q}`;
}

export function ExportCsvLink({ params }) {
  return (
    <Button href={csvHref(params)} download icon={<DownloadOutlined />} className="no-print">
      {t('sales.csv')}
    </Button>
  );
}
