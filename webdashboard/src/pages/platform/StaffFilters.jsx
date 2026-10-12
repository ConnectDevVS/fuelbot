// The staff pages' shared filters (dashboard plan §5.15–5.18): tenant (then its machines), and a day
// range in the display zone. `value` / `onChange` hold {tenant, machine, from, to} (date keys);
// staffParams() turns them into API params (from / to as offset ISO bounds, `to` inclusive). A row on
// tablet and desktop, a "Filters (n)" sheet on phone (FilterBar).
import { useQuery } from '@tanstack/react-query';
import { DatePicker, Select } from 'antd';
import { api } from '../../api/client.js';
import dayjs from '../../lib/dayjs.js';
import { machineName, useMachines } from '../../lib/names.js';
import { addDaysKey, localMidnightIso } from '../../lib/time.js';
import { FilterBar } from '../../ui/FilterBar.jsx';
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

/** How many of the shared filters are set (the phone's "Filters (n)"). */
export const staffCount = (f) => ['tenant', 'machine', 'from', 'to'].filter((k) => f[k]).length;

/** The shared controls alone (tenant, then its machines; the day range unless dates is false). */
export function StaffFilterFields({ value, onChange, dates = true }) {
  const tenants = useTenantList();
  const machines = useMachines(value.tenant);
  const set = (patch) => onChange({ ...value, ...patch });
  const day = (k) => (d) => set({ [k]: d ? d.format('YYYY-MM-DD') : null });
  return (
    <>
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
    </>
  );
}

/**
 * The shared filters in a FilterBar (a sheet on phone). dates: false leaves the day range out;
 * children: the page's own controls, counted by `count` and cleared by onReset() with the rest.
 */
export function StaffFilters({ value, onChange, dates = true, count = 0, onReset, children }) {
  return (
    <FilterBar label={t('staff.filters')} count={staffCount(value) + count}
      onReset={() => { onChange(EMPTY_FILTERS); onReset?.(); }}>
      <StaffFilterFields value={value} onChange={onChange} dates={dates} />
      {children}
    </FilterBar>
  );
}
