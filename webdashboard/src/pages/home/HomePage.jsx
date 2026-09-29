// Tenant Home (dashboard plan §5.3): today at a glance, plus what needs attention. Five reads in
// parallel on entry and on Refresh (fleet, the revenue and flavor summaries, stock, product names);
// nothing refetches by itself (§2.6). Read-only for every role. The server scopes the data: an
// operator limited to machines sees theirs only, and staff see the platform badge because the
// fleet items carry it.
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Col, Row, Segmented } from 'antd';
import { api } from '../../api/client.js';
import { useCan, useDisplayTz } from '../../auth/session.js';
import { PageHeader, RefreshButton } from '../../ui/PageHeader.jsx';
import { KpiTile } from '../../ui/KpiTile.jsx';
import { EmptyState, ErrorPanel, PageSkeleton } from '../../ui/States.jsx';
import { RevenueChart } from '../../charts/RevenueChart.jsx';
import { FlavorMixChart } from '../../charts/FlavorMixChart.jsx';
import { formatCount, formatMoney } from '../../lib/money.js';
import { useProducts } from '../../lib/names.js';
import { formatClock, formatDayHeading, localDateKey } from '../../lib/time.js';
import { MachineStatusList } from '../machines/MachineStatusList.jsx';
import { RefillSoonList } from '../stock/RefillSoonList.jsx';
import { homeKpis, homeRange } from './homeModel.js';
import { t, tn } from '../../strings.js';
import styles from './home.module.css';

const STOCK_STATES = 'empty,low,refill_needed';
const GROUPS = ['day', 'week', 'month'];
const MACHINE_ROWS = 6;
const REFILL_ROWS = 5;

const summaryUrl = (group, tid, { from, to }) => `/sales/summary?${new URLSearchParams({ group, tenant: tid, from, to })}`;

function Panel({ title, sub, extra, children }) {
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

/** A panel's body for one query: skeleton, error with Retry, or the content. */
function Loaded({ query, rows = 4, children }) {
  if (query.isPending) return <PageSkeleton kind="plain" rows={rows} />;
  if (query.error) return <ErrorPanel error={query.error} onRetry={query.refetch} />;
  return children();
}

function Kpis({ fleet, tid, tz }) {
  const can = useCan();
  const k = homeKpis(fleet.items);
  const orders = tn('fleet.orders', k.count, { n: formatCount(k.count) });
  const ndLink = `/t/${encodeURIComponent(tid)}/sales?view=not-dispensed&period=today`;
  return (
    <Row gutter={[16, 16]} className={styles.kpis}>
      <Col xs={12} lg={6}>
        <KpiTile label={t('home.kpi.revenue')} value={formatMoney(k.revenue)}
          sub={k.count > 0 ? t('home.kpi.avg', { orders, avg: formatMoney(k.avg) }) : t('home.kpi.noOrders')} />
      </Col>
      <Col xs={12} lg={6}>
        <KpiTile label={t('home.kpi.orders')} value={formatCount(k.count)}
          sub={k.lastSaleAt ? t('home.kpi.lastAt', { time: formatClock(k.lastSaleAt, tz) }) : t('home.kpi.noOrders')} />
      </Col>
      <Col xs={12} lg={6}>
        <KpiTile label={t('home.kpi.notDispensed')} value={formatCount(k.notDispensed)} warn={k.notDispensed > 0}
          sub={k.notDispensed > 0 ? (
            <>
              {formatMoney(k.notDispensedAmount)}
              {can('sales:read') && <> · <Link to={ndLink} className={styles.seeList}>{t('home.kpi.seeList')} →</Link></>}
            </>
          ) : t('home.kpi.ndNone')} />
      </Col>
      <Col xs={12} lg={6}>
        <KpiTile label={t('home.kpi.machines')}
          value={<>{formatCount(k.online)}<span className={styles.of}>/{formatCount(k.total)}</span></>}
          sub={`${t('home.kpi.online')} · ${k.outOfService > 0 ? t('home.kpi.outOfService', { n: k.outOfService }) : t('home.kpi.allInService')}`} />
      </Col>
    </Row>
  );
}

export default function HomePage() {
  const { tid } = useParams();
  const tz = useDisplayTz();
  const can = useCan();
  const [group, setGroup] = useState('day');
  // "Today" for the chart ranges; Refresh moves it on when the day has changed (no timers).
  const [now, setNow] = useState(() => Date.now());
  const range = homeRange(group, now, tz);
  const enc = encodeURIComponent(tid);

  const fleet = useQuery({
    queryKey: ['fleet', tid],
    queryFn: ({ signal }) => api('GET', `/fleet?tenant=${enc}`, { signal }),
  });
  const series = useQuery({
    queryKey: ['summary', tid, group, range.from, range.to],
    queryFn: ({ signal }) => api('GET', summaryUrl(group, tid, range), { signal }),
  });
  const mix = useQuery({
    queryKey: ['summary', tid, 'flavor', range.from, range.to],
    queryFn: ({ signal }) => api('GET', summaryUrl('flavor', tid, range), { signal }),
  });
  const stock = useQuery({
    queryKey: ['stock', tid, STOCK_STATES],
    queryFn: ({ signal }) => api('GET', `/stock?tenant=${enc}&state=${STOCK_STATES}`, { signal }).then((r) => r.items),
  });
  const products = useProducts(tid, { archived: true });
  const names = useMemo(() => new Map((products.data ?? []).map((p) => [p.id, p.name])), [products.data]);

  const refresh = () => {
    const at = Date.now();
    const sameDay = localDateKey(at, tz) === range.today;
    if (!sameDay) setNow(at);   // new summary keys: those two load by themselves
    return Promise.all([fleet, stock, products, ...(sameDay ? [series, mix] : [])].map((q) => q.refetch()));
  };

  const rangeText = t(`home.range.${group}`);
  const noSales = t(`home.noSales.${group}`);
  const machinesHref = `/t/${enc}/machines`;

  return (
    <section>
      <PageHeader overline={formatDayHeading(fleet.dataUpdatedAt || now, tz)} title={t('home.title')}
        actions={<RefreshButton queries={[fleet, series, mix, stock, products]} onRefresh={refresh} />} />

      {fleet.isPending && <PageSkeleton kind="kpis" />}
      {fleet.error && <ErrorPanel error={fleet.error} onRetry={fleet.refetch} />}
      {fleet.data && <Kpis fleet={fleet.data} tid={tid} tz={tz} />}

      <Row gutter={[16, 16]} className={styles.row}>
        <Col xs={24} xl={14}>
          <Panel title={t('home.revenue')} sub={t('home.range.revenueSub', { range: rangeText })} extra={(
            <Segmented value={group} onChange={setGroup} aria-label={t('home.group')}
              options={GROUPS.map((g) => ({ value: g, label: t(`period.${g}`) }))} />
          )}>
            <Loaded query={series} rows={6}>
              {() => <RevenueChart items={series.data.items} group={group} from={range.from} to={range.to} tz={tz}
                title={`${t('home.revenue')} · ${rangeText}`} emptyMessage={noSales} />}
            </Loaded>
          </Panel>
        </Col>
        <Col xs={24} xl={10}>
          <Panel title={t('home.flavorMix')} sub={t('home.range.mixSub', { range: rangeText })}>
            <Loaded query={mix} rows={6}>
              {() => <FlavorMixChart items={mix.data.items} names={names} title={`${t('home.flavorMix')} · ${rangeText}`}
                emptyMessage={noSales} />}
            </Loaded>
          </Panel>
        </Col>
      </Row>

      <Row gutter={[16, 16]} className={styles.row}>
        <Col xs={24} xl={14}>
          <Panel title={t('home.machines')} extra={<Link to={machinesHref} className={styles.more}>{t('home.allMachines')} →</Link>}>
            <Loaded query={fleet}>
              {() => (
                <MachineStatusList machines={fleet.data.items} now={fleet.dataUpdatedAt} limit={MACHINE_ROWS}
                  empty={<EmptyState message={t('home.noMachines')} action={can('machines:manage') && (
                    <Link to={`${machinesHref}/new`}><Button type="primary">{t('home.register')}</Button></Link>
                  )} />} />
              )}
            </Loaded>
          </Panel>
        </Col>
        <Col xs={24} xl={10}>
          <Panel title={t('home.refill')} extra={<Link to={`/t/${enc}/stock`} className={styles.more}>{t('home.stock')} →</Link>}>
            <Loaded query={stock}>
              {() => <RefillSoonList rows={stock.data} limit={REFILL_ROWS} empty={<EmptyState message={t('home.refillNone')} />} />}
            </Loaded>
          </Panel>
        </Col>
      </Row>
    </section>
  );
}
