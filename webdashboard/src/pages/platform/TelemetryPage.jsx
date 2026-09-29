// Telemetry across the fleet (dashboard plan §5.16; SRV-48; telemetry:read): the machine tab's list
// with tenant and machine, filtered by tenant, machine, type, days, or one order's events.
import { useState } from 'react';
import { Input } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { useDebounced } from '../../lib/useDebounced.js';
import { TelemetryList } from '../telemetry/TelemetryList.jsx';
import { EMPTY_FILTERS, StaffFilters } from './StaffFilters.jsx';
import { t } from '../../strings.js';
import styles from './platform.module.css';

export default function TelemetryPage() {
  const [f, setF] = useState(EMPTY_FILTERS);
  const [order, setOrder] = useState('');
  const orderId = useDebounced(order.trim(), 300);
  return (
    <section>
      <PageHeader title={t('page.telemetry')} />
      <StaffFilters value={f} onChange={setF} dates={false}>
        <Input allowClear prefix={<SearchOutlined />} placeholder={t('tel.orderSearch')} aria-label={t('tel.orderSearch')}
          value={order} onChange={(e) => setOrder(e.target.value)} className={styles.search} />
      </StaffFilters>
      <TelemetryList base={{ tenant: f.tenant, machine: f.machine, order_id: orderId }} showMachine />
    </section>
  );
}
