// Telemetry across the fleet (dashboard plan §5.16; SRV-48; telemetry:read): the machine tab's list
// with tenant and machine, filtered by tenant, machine, type, days, or one order's events.
import { useState } from 'react';
import { Input } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useDisplayTz } from '../../auth/session.js';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { formatDayHeading } from '../../lib/time.js';
import { useDebounced } from '../../lib/useDebounced.js';
import { TelemetryList } from '../telemetry/TelemetryList.jsx';
import { EMPTY_FILTERS, StaffFilterFields, staffCount } from './StaffFilters.jsx';
import { t } from '../../strings.js';
import styles from './platform.module.css';

export default function TelemetryPage() {
  const [f, setF] = useState(EMPTY_FILTERS);
  const [order, setOrder] = useState('');
  const orderId = useDebounced(order.trim(), 300);
  const tz = useDisplayTz();
  const [openedAt] = useState(() => Date.now());
  return (
    <section>
      <PageHeader overline={formatDayHeading(openedAt, tz)} title={t('page.telemetry')} />
      {/* One filter group with the list's own (type, days): one "Filters" button on a phone. */}
      <TelemetryList base={{ tenant: f.tenant, machine: f.machine, order_id: orderId }} showMachine extra={{
        fields: (
          <>
            <StaffFilterFields value={f} onChange={setF} dates={false} />
            <Input allowClear prefix={<SearchOutlined />} placeholder={t('tel.orderSearch')} aria-label={t('tel.orderSearch')}
              value={order} onChange={(e) => setOrder(e.target.value)} className={styles.search} />
          </>
        ),
        count: staffCount(f) + (order.trim() ? 1 : 0),
        reset: () => { setF(EMPTY_FILTERS); setOrder(''); },
      }} />
    </section>
  );
}
