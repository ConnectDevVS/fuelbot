// Sales (dashboard plan §5.7; SRV-39): Overview (filters, KPIs, revenue by day / week / month,
// flavor mix, breakdowns) and the Not dispensed tab (SRV-40). /t/:tid/sales for everyone who may
// read sales; /sales for staff across tenants (a Tenant filter, the breakdown by tenant, and no
// flavors until a tenant is picked: flavor ids repeat across tenants).
// The filters live in the URL (filters.js). The three summaries share them and follow them after
// 300 ms of quiet; nothing refetches by itself (§2.6).
import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Col, Row, Tabs } from 'antd';
import { api } from '../../api/client.js';
import { useCan, useDisplayTz } from '../../auth/session.js';
import { PageHeader, RefreshButton } from '../../ui/PageHeader.jsx';
import { Loaded, Panel } from '../../ui/Panel.jsx';
import { EmptyState, PageSkeleton, ErrorPanel } from '../../ui/States.jsx';
import { RevenueChart } from '../../charts/RevenueChart.jsx';
import { FlavorMixChart } from '../../charts/FlavorMixChart.jsx';
import { machineName, useMachines, useProducts } from '../../lib/names.js';
import { localDateKey } from '../../lib/time.js';
import { useDebounced } from '../../lib/useDebounced.js';
import { parseFilters, rangeOf, summaryQuery, toSearch } from './filters.js';
import { filterSummary, SalesFilters } from './SalesFilters.jsx';
import { SalesKpis } from './SalesKpis.jsx';
import { BreakdownTable } from './BreakdownTable.jsx';
import { t } from '../../strings.js';
import styles from './sales.module.css';

function useSummary(group, filters, range, opts, enabled = true) {
  const qs = summaryQuery(group, filters, range, opts);
  return useQuery({
    queryKey: ['summary', 'sales', qs],
    queryFn: ({ signal }) => api('GET', `/sales/summary?${qs}`, { signal }),
    enabled,
  });
}

/**
 * The URL's filters, minus the ones this page can't apply: Result for non-staff (the server refuses
 * it), Tenant on a tenant's own page (the path names it).
 */
function readFilters(qs, { staff, tid }) {
  const x = parseFilters(new URLSearchParams(qs));
  return { ...x, result: staff ? x.result : null, tenant: tid ? null : x.tenant };
}

const toMap = (items, key, name) => (items ? new Map(items.map((x) => [x[key], name(x)])) : null);

export default function SalesPage() {
  const { tid } = useParams();   // undefined on /sales (staff, all tenants)
  const tz = useDisplayTz();
  const staff = useCan()('telemetry:read');
  const [params, setParams] = useSearchParams();
  const search = params.toString();
  const f = useMemo(() => readFilters(search, { staff, tid }), [search, staff, tid]);
  const settled = useDebounced(search, 300);
  const q = useMemo(() => readFilters(settled, { staff, tid }), [settled, staff, tid]);
  // "Today" for the presets; Refresh moves it on when the day has changed (no timers).
  const [now, setNow] = useState(() => Date.now());
  const today = localDateKey(now, tz);
  const rangeFor = (x) => rangeOf(x, now, tz);

  // What's fetched follows the settled filters; the controls show the current ones.
  const range = rangeFor(q);
  const apiTenant = tid ?? q.tenant;
  const allTenants = !apiTenant;
  const opts = { tenant: apiTenant, staff };
  const series = useSummary(range.group, q, range, opts);
  const mix = useSummary('flavor', q, range, opts, !allTenants);
  const breakdown = useSummary(allTenants ? 'tenant' : 'machine', q, range, opts);

  // Names (and the Machine / Flavor / Tenant lists) for the tenant the controls show.
  const listTenant = tid ?? f.tenant;
  const products = useProducts(listTenant, { archived: true });
  const machines = useMachines(listTenant);
  const tenants = useQuery({
    queryKey: ['tenants'],
    queryFn: ({ signal }) => api('GET', '/tenants', { signal }).then((r) => r.items),
    enabled: staff && !tid,
  });
  const flavorNames = useMemo(() => toMap(listTenant && products.data, 'id', (p) => p.name), [listTenant, products.data]);
  const machineNames = useMemo(() => toMap(listTenant && machines.data, 'id', machineName), [listTenant, machines.data]);
  const tenantNames = useMemo(() => (staff && !tid ? toMap(tenants.data ?? [], 'id', (x) => x.name) : null), [staff, tid, tenants.data]);
  const names = { flavorNames, machineNames, tenantNames };

  const setFilters = (next) => setParams(toSearch(next));
  const queries = [series, breakdown, ...(allTenants ? [] : [mix]), ...(listTenant ? [products, machines] : []), ...(tenantNames ? [tenants] : [])];
  const refresh = () => {
    const at = Date.now();
    if (localDateKey(at, tz) !== today) {
      setNow(at);   // presets move to the new day: new keys, which load by themselves
      return Promise.all([products, machines, tenants].filter((x) => queries.includes(x)).map((x) => x.refetch()));
    }
    return Promise.all(queries.map((x) => x.refetch()));
  };

  const by = t(`sales.byGroup.${range.group}`);
  const overview = (
    <>
      <SalesFilters f={f} rangeFor={rangeFor} today={today} onChange={setFilters}
        lists={{ ...names, machineNames: listTenant ? (machineNames ?? new Map()) : null, flavorNames: listTenant ? (flavorNames ?? new Map()) : null, staff }}
        summary={filterSummary(f, rangeFor(f).group, names)} />

      {series.isPending && <PageSkeleton kind="kpis" />}
      {series.error && <ErrorPanel error={series.error} onRetry={series.refetch} />}
      {series.data && <SalesKpis totals={series.data.totals} />}

      <Row gutter={[16, 16]} className={styles.row}>
        <Col xs={24} xl={14}>
          <Panel title={t('sales.chart.revenue', { by })}>
            <Loaded query={series} rows={6}>
              {() => <RevenueChart items={series.data.items} group={range.group} from={range.from} to={range.to} tz={tz}
                title={t('sales.chart.revenue', { by })} emptyMessage={t('sales.noSales')} />}
            </Loaded>
          </Panel>
        </Col>
        <Col xs={24} xl={10}>
          <Panel title={t('sales.chart.flavorMix')} sub={t('sales.chart.mixSub')}>
            {allTenants ? <p className={styles.note}>{t('sales.pickTenant')}</p> : (
              <Loaded query={mix} rows={6}>
                {() => <FlavorMixChart items={mix.data.items} names={flavorNames} title={t('sales.chart.flavorMix')}
                  emptyMessage={t('sales.noSales')} />}
              </Loaded>
            )}
          </Panel>
        </Col>
      </Row>

      <Row gutter={[16, 16]} className={styles.row}>
        {!allTenants && (
          <Col xs={24} xl={12}>
            <Panel title={t('sales.by.flavor')}>
              <Loaded query={mix}>
                {() => <BreakdownTable items={mix.data.items} totals={mix.data.totals} names={flavorNames} keyTitle={t('sales.col.flavor')} />}
              </Loaded>
            </Panel>
          </Col>
        )}
        <Col xs={24} xl={allTenants ? 24 : 12}>
          <Panel title={t(allTenants ? 'sales.by.tenant' : 'sales.by.machine')}>
            <Loaded query={breakdown}>
              {() => <BreakdownTable items={breakdown.data.items} totals={breakdown.data.totals}
                names={allTenants ? tenantNames : machineNames} keyTitle={t(allTenants ? 'sales.col.tenant' : 'sales.col.machine')} />}
            </Loaded>
          </Panel>
        </Col>
      </Row>
    </>
  );

  return (
    <section>
      <PageHeader overline={filterSummary(f, rangeFor(f).group, names)} title={t(tid ? 'page.sales' : 'page.salesAll')}
        actions={<RefreshButton queries={queries} onRefresh={refresh} />} />
      <Tabs className={styles.tabs} activeKey={f.view} onChange={(view) => setFilters({ ...f, view })} aria-label={t('sales.tabs')}
        items={[
          { key: 'overview', label: t('sales.tab.overview'), children: overview },
          { key: 'not-dispensed', label: t('sales.tab.notDispensed'),
            children: <EmptyState message={t('placeholder.coming', { story: 'SRV-40' })} /> },
        ]} />
    </section>
  );
}
