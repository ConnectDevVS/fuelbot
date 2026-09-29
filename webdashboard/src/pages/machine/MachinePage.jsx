// The machine page (dashboard plan §5.6; SRV-41): a header (name, id, status for the caller's view,
// last seen, location) and a tab bar where each tab is a route. The bar lists the tabs this user may
// see (machineTabs.js); a tab they may not open is Not available (its data is never requested), an
// unknown one goes to the first tab. Outside the
// caller's scope the API says 404, and the page says Not found (never which).
import { lazy, Suspense } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { Result, Skeleton, Tabs } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { useCan } from '../../auth/session.js';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { StatusBadge } from '../../ui/Chips.jsx';
import { RelativeTime } from '../../ui/DateTime.jsx';
import { Id } from '../../ui/Id.jsx';
import { ErrorPanel, NotAvailableState, PageSkeleton } from '../../ui/States.jsx';
import { machineName } from '../../lib/names.js';
import { visibleTabs } from './machineTabs.js';
import { useMachine } from './machineQuery.js';
import { t } from '../../strings.js';
import styles from './machine.module.css';

// Built tabs, by id (lazy). SRV-42…47 add theirs here.
const TABS = {
  menu: lazy(() => import('./MenuTab.jsx')),
  config: lazy(() => import('./ConfigTab.jsx')),
  stock: lazy(() => import('./StockTab.jsx')),
  sales: lazy(() => import('./SalesTab.jsx')),
  settings: lazy(() => import('./SettingsTab.jsx')),
  bases: lazy(() => import('./BasesTab.jsx')),
  keys: lazy(() => import('./KeysTab.jsx')),
  maintenance: lazy(() => import('./MaintenanceTab.jsx')),
  telemetry: lazy(() => import('./TelemetryTab.jsx')),
  faults: lazy(() => import('./FaultsTab.jsx')),
};

export default function MachinePage() {
  const { tid, mid, tab } = useParams();
  const can = useCan();
  const navigate = useNavigate();
  const query = useMachine(tid, mid);
  const tabs = visibleTabs(can, new Set(Object.keys(TABS)));
  const base = `/t/${encodeURIComponent(tid)}/machines/${encodeURIComponent(mid)}`;

  // A tab this role may not open: Not available (as for pages). Unknown or not built yet: the first tab.
  if (TABS[tab] && !tabs.some((x) => x.id === tab)) return <NotAvailableState />;
  if (!tabs.some((x) => x.id === tab) && tabs.length) return <Navigate replace to={`${base}/${tabs[0].id}`} />;
  if (query.isPending) return <PageSkeleton rows={8} />;
  if (query.error?.status === 404) {
    return <Result icon={<QuestionCircleOutlined className="result-icon" />} title={t('notfound.title')} subTitle={t('machine.notFound')} />;
  }
  if (query.error) return <ErrorPanel error={query.error} onRetry={query.refetch} />;

  const m = query.data;
  const Tab = TABS[tab];
  const place = [m.location_label, m.site].filter(Boolean).join(' · ');
  return (
    <section>
      <PageHeader overline={t('machine.overline', { id: m.id })} title={machineName(m)} />
      <div className={styles.meta}>
        <StatusBadge machine={m} />
        <span className={styles.metaItem}>{t('machine.seen')} <RelativeTime value={m.last_seen_at} now={query.dataUpdatedAt} /></span>
        {place && <span className={styles.metaItem}>{place}</span>}
        <span className={styles.metaItem}><Id value={m.id} /></span>
      </div>
      <Tabs className={styles.tabs} activeKey={tab} aria-label={t('machine.tabs')}
        onChange={(next) => navigate(`${base}/${next}`)}
        items={tabs.map((x) => ({ key: x.id, label: t(`machine.tab.${x.id}`) }))} />
      <Suspense fallback={<Skeleton active />}>
        <Tab tid={tid} mid={mid} machine={m} machineQuery={query} />
      </Suspense>
    </section>
  );
}
