// Faults across the fleet (dashboard plan §5.15; SRV-48; faults:read): open intervals first
// ("ongoing since …"), then cleared ones with their duration; filter by tenant, machine and days.
import { useState } from 'react';
import { useDisplayTz } from '../../auth/session.js';
import { PageHeader, RefreshButton } from '../../ui/PageHeader.jsx';
import { formatDayHeading } from '../../lib/time.js';
import { FaultIntervals, useFaults } from '../faults/FaultIntervals.jsx';
import { EMPTY_FILTERS, StaffFilters, staffParams } from './StaffFilters.jsx';
import { t } from '../../strings.js';

export default function FaultsPage() {
  const tz = useDisplayTz();
  const [f, setF] = useState(EMPTY_FILTERS);
  const query = useFaults(staffParams(f, tz));
  return (
    <section>
      <PageHeader overline={formatDayHeading(query.dataUpdatedAt || undefined, tz)} title={t('page.faults')} actions={<RefreshButton queries={[query]} />} />
      <StaffFilters value={f} onChange={setF} />
      <FaultIntervals query={query} showMachine />
    </section>
  );
}
