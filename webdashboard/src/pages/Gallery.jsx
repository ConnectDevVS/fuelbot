// /dashboard/_gallery (SRV-34): every shared component in every state, with sample data shaped like
// the captured API responses (dashboard plan §9). Dev builds, or ?gallery for signed-in staff.
import { StageTimeline } from '../ui/StageTimeline.jsx';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Button, Card, Col, Row, Select, Space } from 'antd';
import { useCan } from '../auth/session.js';
import { ApiError } from '../api/client.js';
import { PageHeader, RefreshButton } from '../ui/PageHeader.jsx';
import { DataTable, LoadMore } from '../ui/DataTable.jsx';
import { EmptyState, ErrorPanel, NotAvailableState, NotFoundState, PageSkeleton } from '../ui/States.jsx';
import { DispensedChip, StatusBadge, StockChip } from '../ui/Chips.jsx';
import { KpiTile } from '../ui/KpiTile.jsx';
import { Money } from '../ui/Money.jsx';
import { DateTime, RelativeTime } from '../ui/DateTime.jsx';
import { CopyField, Id } from '../ui/Id.jsx';
import { CONFIRMS, useConfirm, useToast } from '../ui/dialogs.js';
import { Sheet } from '../ui/Sheet.jsx';
import { machineName } from '../lib/names.js';
import { formatMoney } from '../lib/money.js';
import { GalleryForm } from './GalleryForm.jsx';
import { GalleryCharts } from './GalleryCharts.jsx';
import styles from './gallery.module.css';

const NOW = Date.parse('2026-09-28T07:12:00Z');
const at = (minutesAgo) => new Date(NOW - minutesAgo * 60000).toISOString();

const TENANT_MACHINES = [
  { id: 'DEV00001', name: 'Bay 02', location_label: 'FUELBOT · BAY 02', site: 'Ground floor', disabled: false, configured: true,
    last_seen_at: at(0.2), online: true, in_service: false, today: { count: 18, revenue: 1705 } },
  { id: 'SHC816DJ', name: 'Bay 3 by the lockers', location_label: 'FUELBOT · BAY 03', site: 'Ground floor', disabled: false,
    configured: true, last_seen_at: at(1), online: true, in_service: true, today: { count: 6, revenue: 575 } },
  { id: 'K7Q2M9XA', name: '', location_label: 'FUELBOT · BAY 04', site: null, disabled: false, configured: false,
    last_seen_at: null, online: false, in_service: true, today: { count: 0, revenue: 0 } },
];
const PLATFORM = (m, extra) => ({ ...m, faults: [], maintenance: { enabled: false }, last_seen_ip: null, ...extra });
const PLATFORM_MACHINES = [
  PLATFORM(TENANT_MACHINES[0], { status: 'fault', faults: [{ code: 'HOMING_TIMEOUT', since: at(210) }] }),
  PLATFORM(TENANT_MACHINES[1], { status: 'ok' }),
  PLATFORM(TENANT_MACHINES[1], { id: 'MAINT001', status: 'maintenance' }),
  PLATFORM(TENANT_MACHINES[2], { status: 'offline' }),
];

const fakeQuery = { dataUpdatedAt: NOW, isFetching: false, refetch: () => Promise.resolve() };

function Section({ title, children }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.h2}>{title}</h2>
      {children}
    </section>
  );
}

function GalleryBody() {
  const confirm = useConfirm();
  const toast = useToast();
  const [sheet, setSheet] = useState(false);
  const [action, setAction] = useState('revokeKey');
  const [confirmed, setConfirmed] = useState(null);
  const columns = [
    { key: 'name', title: 'Machine', priority: 1, render: (m) => <span>{machineName(m)} · <span className="mono">{m.id}</span></span> },
    { key: 'status', title: 'Status', priority: 2, render: (m) => <StatusBadge machine={m} /> },
    { key: 'seen', title: 'Last seen', priority: 3, render: (m) => <RelativeTime value={m.last_seen_at} now={NOW} /> },
    { key: 'today', title: 'Today', priority: 2, align: 'right', render: (m) => `${formatMoney(m.today.revenue)} · ${m.today.count}` },
  ];
  return (
    <div className={styles.gallery}>
      <PageHeader overline="Sunday 28 Sep 2026" title="Gallery" actions={<RefreshButton queries={[fakeQuery]} />} />

      <Section title="KPI tiles">
        <Row gutter={[16, 16]}>
          <Col xs={12} lg={6}><KpiTile label="Revenue today" value={<Money value={2280} />} sub="24 orders · ₹95 avg" /></Col>
          <Col xs={12} lg={6}><KpiTile label="Orders" value="24" sub="last at 12:31" /></Col>
          <Col xs={12} lg={6}><KpiTile warn label="Not dispensed" value="1" sub="₹95 · see list →" /></Col>
          <Col xs={12} lg={6}><KpiTile label="Machines" value="2/2" sub="online · 1 out of service" /></Col>
        </Row>
      </Section>

      <Section title="Machine status (platform view)">
        <div className={styles.row}>{PLATFORM_MACHINES.map((m) => <StatusBadge key={m.id} machine={m} />)}</div>
      </Section>
      <Section title="Machine status (tenant view)">
        <div className={styles.row}>{TENANT_MACHINES.map((m) => <StatusBadge key={m.id} machine={m} />)}</div>
      </Section>
      <Section title="Stock and sales">
        <div className={styles.row}>
          {['empty', 'low', 'refill_needed', 'unknown', 'not_estimated', 'ok'].map((s) => <StockChip key={s} state={s} />)}
        </div>
        <div className={styles.row}>
          <DispensedChip sale={{ dispensed: true }} />
          <DispensedChip sale={{ dispensed: false }} />
          <DispensedChip sale={{ dispensed: false, dispensing_result: 'timeout', dispensing_reason: 'deadline' }} />
        </div>
      </Section>

      <Section title="Money, time, ids">
        <dl className={styles.facts}>
          <dt className="overline">Grouping</dt><dd><Money value={123456} /></dd>
          <dt className="overline">Offer</dt><dd><Money value={75} was={90} /></dd>
          <dt className="overline">Missing</dt><dd><Money value={null} /></dd>
          <dt className="overline">Date time</dt><dd><DateTime value="2026-09-28T07:12:02Z" /></dd>
          <dt className="overline">Relative</dt><dd><RelativeTime value={at(4)} now={NOW} /> · <RelativeTime value={at(190)} now={NOW} /> · <RelativeTime value={at(2000)} now={NOW} /> · <RelativeTime value={null} /></dd>
          <dt className="overline">Id</dt><dd><Id value="DEV00001" /></dd>
        </dl>
        <Card size="small" className={styles.copyCard}>
          <div className="overline">machine_id.txt</div>
          <CopyField value="SHC816DJ" display="S H C 8 1 6 D J" label="machine_id.txt" />
          <div className="overline">machine_key.txt</div>
          <CopyField value="7KQM2XPA9TRD4WZCHN3B" display="7KQM - 2XPA - 9TRD - 4WZC - HN3B" label="machine_key.txt" />
        </Card>
      </Section>

      <Section title="Table (cards below 760 px)">
        <DataTable columns={columns} rows={TENANT_MACHINES} rowHref={(m) => `/t/powerfuel/machines/${m.id}`}
          footer={<LoadMore hasMore loading={false} onClick={() => toast.info('Would load 50 more')} />} />
      </Section>

      <Section title="States">
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}><PageSkeleton kind="table" rows={3} /></Col>
          <Col xs={24} lg={12}><PageSkeleton kind="cards" rows={1} /></Col>
          <Col xs={24}><PageSkeleton kind="kpis" /></Col>
          <Col xs={24} lg={12}><Card size="small"><EmptyState message="No machines yet. Register your first machine" action={<Button type="primary">Register a machine</Button>} /></Card></Col>
          <Col xs={24} lg={12}><ErrorPanel error={new ApiError(0, 'network_error')} onRetry={() => toast.info('Retrying')} /></Col>
          <Col xs={24} lg={12}><Card size="small"><NotFoundState /></Card></Col>
          <Col xs={24} lg={12}><Card size="small"><NotAvailableState /></Card></Col>
        </Row>
      </Section>

      <Section title="Stage timeline (staff, order page)">
        <StageTimeline durationMs={71200} stages={[{ stage: 'HOMING_DONE', t_offset_ms: 1800 },
          { stage: 'PROTEIN_DISPENSED', t_offset_ms: 7600 }, { stage: 'BASE_DISPENSED', t_offset_ms: 21400 },
          { stage: 'MIXING_DONE', t_offset_ms: 62000 }, { stage: 'DONE', t_offset_ms: 70000 }]} />
      </Section>

      <Section title="Charts">
        <GalleryCharts />
      </Section>

      <Section title="Forms (a stub server: no requests)">
        <GalleryForm />
      </Section>

      <Section title="Dialogs, toasts, sheet">
        <Space wrap>
          <Select aria-label="Confirm action" value={action} onChange={setAction} options={CONFIRMS.map((c) => ({ value: c, label: c }))} />
          <Button danger onClick={async () => setConfirmed(await confirm(action, { prefix: 'SU8B', name: 'Bay 02' }))}>Open confirm</Button>
          <Button onClick={() => toast.success('Menu saved. Reaches Bay 02 at its next restart')}>Show toast</Button>
          <Button onClick={() => setSheet(true)}>Open sheet</Button>
          {confirmed !== null && <span className="overline">Confirmed: {String(confirmed)}</span>}
        </Space>
        <Sheet open={sheet} onClose={() => setSheet(false)} title="Record refill"
          footer={<Button type="primary" block onClick={() => setSheet(false)}>Save</Button>}>
          <p>A sheet: from the right on tablet and desktop, from the bottom on phone.</p>
        </Sheet>
      </Section>
    </div>
  );
}

export default function Gallery() {
  const [params] = useSearchParams();
  const staff = useCan()('telemetry:read');
  if (!import.meta.env.DEV && !(params.has('gallery') && staff)) return <NotFoundState />;
  return <GalleryBody />;
}
