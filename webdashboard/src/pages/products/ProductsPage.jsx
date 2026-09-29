// Products (dashboard plan §5.11; SRV-45): the tenant's library. Search, "Show archived", New product
// (products:create); a row opens the drawer (?p=<id>, ?new=1 for create), so a product has a link.
import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { Button, Checkbox, Input, Tag, Tooltip } from 'antd';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useCan, useDisplayTz } from '../../auth/session.js';
import { PageHeader, RefreshButton } from '../../ui/PageHeader.jsx';
import { DataTable } from '../../ui/DataTable.jsx';
import { Money } from '../../ui/Money.jsx';
import { EmptyState, ErrorPanel, PageSkeleton } from '../../ui/States.jsx';
import { useMachines, useProducts } from '../../lib/names.js';
import { formatDayHeading } from '../../lib/time.js';
import { ProductDrawer } from './ProductDrawer.jsx';
import { t } from '../../strings.js';
import styles from './products.module.css';

const matches = (p, q) => !q || [p.name, p.id].some((v) => (v ?? '').toLowerCase().includes(q.trim().toLowerCase()));

export default function ProductsPage() {
  const { tid } = useParams();
  const tz = useDisplayTz();
  const can = useCan();
  const [params, setParams] = useSearchParams();
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState('');
  const query = useProducts(tid, { archived: showArchived });
  const machines = useMachines(tid);
  const machineNames = useMemo(() => new Map((machines.data ?? []).map((m) => [m.id, m.name || m.id])), [machines.data]);
  const rows = useMemo(() => (query.data ?? []).filter((p) => matches(p, search)), [query.data, search]);
  const pid = params.get('p');
  const creating = params.get('new') === '1';
  const open = (id) => setParams(id ? { p: id } : {});

  const columns = [
    { key: 'name', title: t('products.col.name'), priority: 1, render: (p) => (
      <span className={styles.nameCell}>
        {p.image_url ? <img src={p.image_url} alt="" className={styles.thumb} /> : <span className={styles.thumb} aria-hidden="true">IMG</span>}
        <span className={styles.nameText}><b>{p.name}</b><span className="mono">{p.id}</span></span>
      </span>
    ) },
    { key: 'price', title: t('products.col.price'), priority: 2, align: 'right',
      render: (p) => <Money value={p.offer_price ?? p.actual_price} was={p.offer_price !== null && p.offer_price !== undefined ? p.actual_price : undefined} /> },
    { key: 'portion', title: t('products.col.portion'), priority: 2, align: 'right',
      render: (p) => (p.portion_g ? `${p.portion_g} g` : <span className={styles.muted}>{t('products.portionNotSet')}</span>) },
    { key: 'machines', title: t('products.col.machines'), priority: 2, align: 'right', render: (p) => {
      const names = (p.machines ?? []).map((id) => machineNames.get(id) ?? id);
      return names.length ? <Tooltip title={names.join(', ')}><span className="num" tabIndex={0}>{names.length}</span></Tooltip> : <span className="num">0</span>;
    } },
    { key: 'status', title: t('products.col.status'), priority: 2, render: (p) => (p.archived ? <Tag>{t('products.archived')}</Tag> : null) },
  ];

  return (
    <section>
      <PageHeader overline={formatDayHeading(query.dataUpdatedAt || undefined, tz)} title={t('page.products')}
        actions={(
          <>
            <RefreshButton queries={[query]} />
            {can('products:create') && <Button type="primary" icon={<PlusOutlined />} onClick={() => setParams({ new: '1' })}>{t('products.new')}</Button>}
          </>
        )} />
      <div className={styles.toolbar}>
        <Input allowClear prefix={<SearchOutlined />} placeholder={t('products.search')} aria-label={t('products.search')}
          value={search} onChange={(e) => setSearch(e.target.value)} className={styles.search} />
        <Checkbox checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)}>{t('products.showArchived')}</Checkbox>
      </div>
      {query.isPending && <PageSkeleton rows={6} />}
      {query.error && <ErrorPanel error={query.error} onRetry={query.refetch} />}
      {query.data && (
        <DataTable columns={columns} rows={rows} rowHref={(p) => `?p=${encodeURIComponent(p.id)}`}
          empty={<EmptyState message={t(query.data.length ? 'products.noMatch' : 'products.empty')} />} />
      )}
      {(pid || creating) && <ProductDrawer key={pid ?? 'new'} tid={tid} pid={pid} onClose={(made) => open(made ?? null)} />}
    </section>
  );
}
