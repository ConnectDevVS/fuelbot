// One order (dashboard plan §5.9; SRV-40): GET /orders/:orderId. Everyone sees the sale in their
// view (Dispensed / Not dispensed); staff also get the result and reason, when it was received,
// whether the machine was registered, each dispense cycle's stages and the other events.
// Outside the caller's scope the server says 404, and so does the page (never which).
import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Button, Col, Descriptions, Result, Row } from 'antd';
import { ArrowLeftOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { api } from '../../api/client.js';
import { useMe } from '../../auth/session.js';
import { useIsStaff } from '../../shell/tenant.js';
import { PageHeader, RefreshButton } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { DataTable } from '../../ui/DataTable.jsx';
import { DispensedChip } from '../../ui/Chips.jsx';
import { DateTime } from '../../ui/DateTime.jsx';
import { Id } from '../../ui/Id.jsx';
import { StageTimeline } from '../../ui/StageTimeline.jsx';
import { ErrorPanel, PageSkeleton } from '../../ui/States.jsx';
import { nameOf, useMachines, useProducts, machineName } from '../../lib/names.js';
import { Charged } from '../sales/SalesTable.jsx';
import { t } from '../../strings.js';
import styles from './order.module.css';

// Fields every event has; the rest of an event is its details.
const COMMON = new Set(['id', 'event_id', 'event_type', 'tenant_id', 'machine_id', 'order_id', 'ts', 'received_at', 'machine_known',
  'source', 'v', 'timestamp', 'body_tenant_id', 'body_machine_id', 'stages']);

export function eventDetails(e) {
  return Object.entries(e).filter(([k, v]) => !COMMON.has(k) && v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ');
}

function NotFound() {
  return <Result icon={<QuestionCircleOutlined className="result-icon" />} title={t('notfound.title')} subTitle={t('order.notFound')} />;
}

export default function OrderPage() {
  const { orderId } = useParams();
  const staff = useIsStaff();
  const { data: me } = useMe();
  const query = useQuery({
    queryKey: ['orders', orderId],
    queryFn: ({ signal }) => api('GET', `/orders/${encodeURIComponent(orderId)}`, { signal }),
    retry: false,
  });
  const sale = query.data?.sale ?? null;
  const telemetry = query.data?.telemetry ?? [];
  // Tenant users' sales have no tenant_id (their tenant is implied); staff get the whole record.
  const tid = sale?.tenant_id ?? telemetry[0]?.tenant_id ?? me?.tenant?.id ?? null;
  const products = useProducts(tid, { archived: true });
  const machines = useMachines(tid);
  const flavorNames = useMemo(() => new Map((products.data ?? []).map((p) => [p.id, p.name])), [products.data]);
  const machineNames = useMemo(() => new Map((machines.data ?? []).map((m) => [m.id, machineName(m)])), [machines.data]);
  const back = tid ? `/t/${encodeURIComponent(tid)}/sales` : '/sales';

  if (query.isPending) return <PageSkeleton rows={8} />;
  if (query.error?.status === 404) return <NotFound />;
  if (query.error) return <ErrorPanel error={query.error} onRetry={query.refetch} />;

  const cycles = telemetry.filter((e) => e.event_type === 'dispense_cycle');
  const others = telemetry.filter((e) => e.event_type !== 'dispense_cycle');
  const items = sale ? [
    { key: 'status', label: t('order.status'), children: <DispensedChip sale={sale} /> },
    { key: 'time', label: t('order.time'), children: <DateTime value={sale.ts} /> },
    { key: 'number', label: t('order.number'), children: <span className="num">{sale.order_number ?? '—'}</span> },
    { key: 'id', label: t('order.id'), children: <Id value={sale.order_id} /> },
    { key: 'machine', label: t('order.machine'), children: (
      // A flex cell drops a bare space: the gap comes from CSS.
      <span className={styles.machine}>{nameOf(machineNames, sale.machine_id)}<span className="mono">{sale.machine_id}</span></span>
    ) },
    { key: 'flavor', label: t('order.flavor'), children: nameOf(flavorNames, sale.flavor_id) },
    { key: 'base', label: t('order.base'), children: sale.base_id ?? '—' },
    { key: 'hopper', label: t('order.hopper'), children: sale.hopper ?? '—' },
    { key: 'charged', label: t('order.charged'), children: <Charged sale={sale} /> },
    { key: 'payment', label: t('order.payment'), children: (sale.payment_method ?? '—').toUpperCase() },
    { key: 'txn', label: t('order.transaction'), children: <Id value={sale.transaction_id} /> },
    ...(staff ? [
      { key: 'result', label: t('order.result'), children: sale.dispensing_result ?? '—' },
      { key: 'reason', label: t('order.reason'), children: sale.dispensing_reason || '—' },
      { key: 'received', label: t('order.received'), children: <DateTime value={sale.received_at} /> },
      { key: 'known', label: t('order.machineKnown'), children: sale.machine_known === false ? t('order.no') : t('order.yes') },
    ] : []),
  ] : [];

  return (
    <section>
      <PageHeader overline={sale ? <DateTime value={sale.ts} /> : orderId}
        title={t('order.title', { n: sale?.order_number ?? '' }).trim()}
        actions={(
          <>
            <RefreshButton queries={[query]} />
            <Link to={back}><Button icon={<ArrowLeftOutlined />}>{t('order.back')}</Button></Link>
          </>
        )} />
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={staff ? 14 : 24}>
          <Panel title={t('order.sale')}>
            {sale ? <Descriptions column={{ xs: 1, md: 2 }} size="small" items={items} className={styles.facts} />
              : <p className={styles.none}>{t('order.noSale')}</p>}
          </Panel>
        </Col>
        {staff && (
          <Col xs={24} xl={10}>
            {cycles.map((c) => (
              <div key={c.id} className={styles.block}>
                <Panel title={t('order.cycle')} sub={[c.result, c.reason].filter(Boolean).join(' · ')}>
                  <StageTimeline stages={c.stages ?? []} durationMs={c.duration_ms ?? null} />
                </Panel>
              </div>
            ))}
          </Col>
        )}
      </Row>
      {staff && others.length > 0 && (
        <div className={styles.block}>
          <Panel title={t('order.events')}>
            <DataTable rows={others} columns={[
              { key: 'time', title: t('order.col.time'), priority: 1, render: (e) => <DateTime value={e.ts} /> },
              { key: 'type', title: t('order.col.type'), priority: 2, render: (e) => <span className="mono">{e.event_type}</span> },
              { key: 'fields', title: t('order.col.fields'), priority: 2, render: eventDetails },
            ]} />
          </Panel>
        </div>
      )}
    </section>
  );
}
