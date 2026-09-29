// The staff pages' shared filters (dashboard plan §5.15–5.18): tenant (then its machines), and a day
// range in the display zone. `value` / `onChange` hold {tenant, machine, from, to} (date keys);
// staffParams() turns them into API params (from / to as offset ISO bounds, `to` inclusive).
import { useQuery } from '@tanstack/react-query';
import { DatePicker, Select } from 'antd';
import { api } from '../../api/client.js';
import dayjs from '../../lib/dayjs.js';
import { machineName, useMachines } from '../../lib/names.js';
import { addDaysKey, localMidnightIso } from '../../lib/time.js';
import { t } from '../../strings.js';
import styles from './platform.module.css';

export const EMPTY_FILTERS = { tenant: null, machine: null, from: null, to: null };

export function staffParams(f, tz) {
  return {
    tenant: f.tenant, machine: f.machine,
    from: f.from ? localMidnightIso(f.from, tz) : null,
    to: f.to ? localMidnightIso(addDaysKey(f.to, 1), tz) : null,
  };
}

export function useTenantList() {
  return useQuery({ queryKey: ['tenants'], queryFn: ({ signal }) => api('GET', '/tenants', { signal }).then((r) => r.items) });
}

/** dates: false leaves the date range out (the page has its own). children: more controls. */
export function StaffFilters({ value, onChange, dates = true, children }) {
  const tenants = useTenantList();
  const machines = useMachines(value.tenant);
  const set = (patch) => onChange({ ...value, ...patch });
  const day = (k) => (d) => set({ [k]: d ? d.format('YYYY-MM-DD') : null });
  return (
    <div className={styles.filters} role="group" aria-label={t('staff.filters')}>
      <Select aria-label={t('staff.tenant')} value={value.tenant ?? ''} className={styles.select} showSearch={{ optionFilterProp: 'label' }}
        onChange={(v) => set({ tenant: v || null, machine: null })}
        options={[{ value: '', label: t('staff.tenant.all') }, ...(tenants.data ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
      <Select aria-label={t('staff.machine')} value={value.machine ?? ''} className={styles.select} disabled={!value.tenant}
        showSearch={{ optionFilterProp: 'label' }} onChange={(v) => set({ machine: v || null })}
        options={[{ value: '', label: t('staff.machine.all') }, ...(machines.data ?? []).map((m) => ({ value: m.id, label: `${machineName(m)} · ${m.id}` }))]} />
      {dates && (
        <>
          <DatePicker aria-label={t('staff.from')} placeholder={t('staff.from')} format="D MMM YYYY" value={value.from ? dayjs(value.from) : null} onChange={day('from')} />
          <DatePicker aria-label={t('staff.to')} placeholder={t('staff.to')} format="D MMM YYYY" value={value.to ? dayjs(value.to) : null} onChange={day('to')} />
        </>
      )}
      {children}
    </div>
  );
}
