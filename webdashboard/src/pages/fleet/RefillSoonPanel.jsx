// Fleet's "Refill soon": collapsed by default, and GET /stock only when opened (dashboard plan
// §2.6: /stock costs queries per machine and hopper).
import { useQuery } from '@tanstack/react-query';
import { Collapse } from 'antd';
import { api } from '../../api/client.js';
import { EmptyState, ErrorPanel, PageSkeleton } from '../../ui/States.jsx';
import { RefillSoonList } from '../stock/RefillSoonList.jsx';
import { t } from '../../strings.js';

const STATES = 'empty,low,refill_needed';

function RefillSoon({ tenantNames }) {
  const query = useQuery({
    queryKey: ['stock', 'fleet', STATES],
    queryFn: ({ signal }) => api('GET', `/stock?state=${STATES}`, { signal }).then((r) => r.items),
  });
  if (query.isPending) return <PageSkeleton rows={3} />;
  if (query.error) return <ErrorPanel error={query.error} onRetry={query.refetch} />;
  return <RefillSoonList rows={query.data} tenantNames={tenantNames} empty={<EmptyState message={t('fleet.refill.none')} />} />;
}

export function RefillSoonPanel({ tenantNames }) {
  // antd Collapse renders a panel's children only once it's opened (no forceRender): the query
  // above isn't even mounted until then.
  return (
    <Collapse items={[{ key: 'refill', label: <b>{t('fleet.refill.title')}</b>, children: <RefillSoon tenantNames={tenantNames} /> }]} />
  );
}
