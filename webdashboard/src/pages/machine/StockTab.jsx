// The Stock tab (dashboard plan §5.6.3; SRV-41; mock-ups design/stock-phone.png,
// stock-refill-phone.png): one card per hopper, then the history. With stock:write, Record refill /
// Adjust on each card and the low mark inline; operators and viewers get no buttons at all.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { useCan } from '../../auth/session.js';
import { RefreshButton } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { ErrorPanel, PageSkeleton } from '../../ui/States.jsx';
import { useProducts } from '../../lib/names.js';
import { RecordLevelDialog } from '../stock/RecordLevelDialog.jsx';
import { HopperCard } from './HopperCard.jsx';
import { StockHistory, useStockHistory } from './StockHistory.jsx';
import { machinePath } from './machineQuery.js';
import { t } from '../../strings.js';
import styles from './machine.module.css';

export default function StockTab({ tid, mid, machine, machineQuery }) {
  const write = useCan()('stock:write');
  const stock = useQuery({
    queryKey: ['stock', tid, 'machine', mid],
    queryFn: ({ signal }) => api('GET', `${machinePath(tid, mid)}/stock`, { signal }).then((r) => r.items),
  });
  const history = useStockHistory(tid, mid);
  const products = useProducts(tid, { archived: true });
  const flavorNames = useMemo(() => new Map((products.data ?? []).map((p) => [p.id, p.name])), [products.data]);
  const [dialog, setDialog] = useState(null);   // {mode, hopper}

  return (
    <>
      <div className={styles.intro}>
        <span>{t('stock.intro')}</span>
        <span className={styles.introActions}><RefreshButton queries={[stock, history, machineQuery]} /></span>
      </div>
      {stock.isPending && <PageSkeleton kind="cards" rows={3} />}
      {stock.error && <ErrorPanel error={stock.error} onRetry={stock.refetch} />}
      {stock.data && (
        <div className={styles.hoppers}>
          {stock.data.map((item) => (
            <HopperCard key={item.hopper} tid={tid} mid={mid} machine={machine} item={item} write={write}
              flavorNames={flavorNames} onAction={(mode) => setDialog({ mode, hopper: item.hopper })} />
          ))}
        </div>
      )}
      <div className={styles.history}>
        <Panel title={t('stock.history')}>
          <StockHistory query={history} flavorNames={flavorNames} />
        </Panel>
      </div>
      {write && dialog && (
        <RecordLevelDialog open mode={dialog.mode} tid={tid} mid={mid} hopper={dialog.hopper}
          hoppers={(stock.data ?? []).map((i) => ({ hopper: i.hopper, product_name: i.product_name ?? i.product_id }))}
          onClose={() => setDialog(null)} />
      )}
    </>
  );
}
