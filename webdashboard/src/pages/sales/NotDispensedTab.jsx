// The Not dispensed work list (dashboard plan §5.8): paid orders in the period that weren't
// dispensed, to refund by hand in Razorpay. The page's filters apply, with dispensed=false fixed.
// Read-only; its own CSV.
import { Alert } from 'antd';
import { Panel } from '../../ui/Panel.jsx';
import { ExportCsvLink } from './ExportCsvLink.jsx';
import { SalesTable } from './SalesTable.jsx';
import { t } from '../../strings.js';
import styles from './sales.module.css';

/** query: the page's useSalesList for params (the filter params with dispensed=false). */
export function NotDispensedTab({ query, params, names, staff }) {
  return (
    <>
      <Alert className={styles.note} type="info" showIcon title={t('sales.nd.note')} />
      <Panel title={t('sales.tab.notDispensed')} extra={<ExportCsvLink params={params} />}>
        <SalesTable query={query} names={names} staff={staff} focused empty={t('sales.nd.none')} />
      </Panel>
    </>
  );
}
