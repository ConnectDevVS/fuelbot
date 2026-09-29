// Sales filters (dashboard plan §5.7; mock-up design/sales-filters-phone.png). Tablet and desktop:
// one row that applies at once (the page debounces the requests). Phone: "Filters (n)" and a
// summary line; the bottom sheet edits a draft, applied with "Show results".
// The period is a Select of the presets (its name shows, as in the wireframe); "Custom…" adds two
// single-month date pickers (a two-month range picker is wider than a phone).
import { useState } from 'react';
import { Button, DatePicker, Segmented, Select } from 'antd';
import { FilterOutlined } from '@ant-design/icons';
import dayjs from '../../lib/dayjs.js';
import { bucketLabel } from '../../lib/time.js';
import { useLayoutSize } from '../../lib/useMedia.js';
import { Sheet } from '../../ui/Sheet.jsx';
import { activeCount, CUSTOM, GROUPS, PRESETS, resetFilters, RESULTS } from './filters.js';
import { t } from '../../strings.js';
import styles from './sales.module.css';

/** The period in words: 'Last 30 days', or '1 Sep – 15 Sep' for a custom range. */
export function periodLabel(f) {
  return f.period === CUSTOM
    ? t('sales.period.range', { from: bucketLabel(f.from, 'day'), to: bucketLabel(f.to, 'day') })
    : t(`sales.period.${f.period}`);
}

/** One line for the filters: 'Last 30 days · by week · Bay 02 · Not dispensed'. */
export function filterSummary(f, group, { machineNames, flavorNames, tenantNames }) {
  return [
    periodLabel(f),
    t(`sales.byGroup.${group}`),
    f.tenant && (tenantNames?.get(f.tenant) ?? f.tenant),
    f.machine && (machineNames?.get(f.machine) ?? f.machine),
    f.flavor && (flavorNames?.get(f.flavor) ?? f.flavor),
    f.dispensed && t(`sales.dispensed.${f.dispensed}`),
    f.result,
  ].filter(Boolean).join(' · ');
}

/** In the sheet, a field under its mono label; in the row, the control alone (it has an aria-label). */
function Field({ label, sheet, children }) {
  return sheet ? <div className={styles.sheetField}><div className="overline">{label}</div>{children}</div> : children;
}

const toOptions = (names, allLabel) => [{ value: '', label: allLabel },
  ...[...(names ?? new Map())].map(([value, label]) => ({ value, label }))];

/**
 * The fields, for a row or the sheet. f: filters; group: the effective group; today: the local date
 * key (no future days); onChange(next filters).
 * lists: {tenantNames (staff on /sales) | null, machineNames | null (hidden), flavorNames | null, staff,
 *   hideDispensed (the Not dispensed tab fixes it)}
 */
function Fields({ f, group, today, onChange, lists, sheet }) {
  const { tenantNames, machineNames, flavorNames, staff } = lists;
  const set = (patch) => onChange({ ...f, ...patch });
  const setPeriod = (period, first, last) => set(period === CUSTOM
    ? { period, from: f.from ?? first, to: f.to ?? last, group: null }
    : { period, from: null, to: null, group: null });
  const dateValue = (key) => (key ? dayjs(key) : null);
  const future = (d) => d.format('YYYY-MM-DD') > today;

  return (
    <>
      <Field sheet={sheet} label={t('sales.period')}>
        {sheet ? (
          <div className={styles.presets} role="group" aria-label={t('sales.period')}>
            {[...PRESETS, CUSTOM].map((p) => (
              <Button key={p} shape="round" aria-pressed={f.period === p} type={f.period === p ? 'primary' : 'default'}
                onClick={() => setPeriod(p, lists.first, lists.last)}>
                {t(`sales.period.${p}`)}
              </Button>
            ))}
          </div>
        ) : (
          <Select aria-label={t('sales.period')} className={styles.period} value={f.period}
            onChange={(p) => setPeriod(p, lists.first, lists.last)} popupMatchSelectWidth={false}
            options={[...PRESETS, CUSTOM].map((p) => ({ value: p, label: t(`sales.period.${p}`) }))} />
        )}
      </Field>
      {f.period === CUSTOM && (
        <div className={styles.dates}>
          <DatePicker aria-label={t('sales.from')} placeholder={t('sales.from')} allowClear={false} format="D MMM YYYY"
            value={dateValue(f.from)} disabledDate={future} inputReadOnly
            onChange={(d) => d && set({ from: d.format('YYYY-MM-DD') })} />
          <DatePicker aria-label={t('sales.to')} placeholder={t('sales.to')} allowClear={false} format="D MMM YYYY"
            value={dateValue(f.to)} disabledDate={future} inputReadOnly
            onChange={(d) => d && set({ to: d.format('YYYY-MM-DD') })} />
        </div>
      )}
      <Field sheet={sheet} label={t('sales.group')}>
        <Segmented aria-label={t('sales.group')} value={group} onChange={(g) => set({ group: g })}
          options={GROUPS.map((g) => ({ value: g, label: t(`period.${g}`) }))} />
      </Field>
      {tenantNames && (
        <Field sheet={sheet} label={t('sales.tenant')}>
          <Select aria-label={t('sales.tenant')} className={styles.select} value={f.tenant ?? ''} showSearch={{ optionFilterProp: 'label' }}
            onChange={(v) => set({ tenant: v || null, machine: null, flavor: null })} options={toOptions(tenantNames, t('sales.tenant.all'))} />
        </Field>
      )}
      {machineNames && (
        <Field sheet={sheet} label={t('sales.machine')}>
          <Select aria-label={t('sales.machine')} className={styles.select} value={f.machine ?? ''} showSearch={{ optionFilterProp: 'label' }}
            onChange={(v) => set({ machine: v || null })} options={toOptions(machineNames, t('sales.machine.all'))} />
        </Field>
      )}
      {flavorNames && (
        <Field sheet={sheet} label={t('sales.flavor')}>
          <Select aria-label={t('sales.flavor')} className={styles.select} value={f.flavor ?? ''} showSearch={{ optionFilterProp: 'label' }}
            onChange={(v) => set({ flavor: v || null })} options={toOptions(flavorNames, t('sales.flavor.all'))} />
        </Field>
      )}
      {!lists.hideDispensed && <Field sheet={sheet} label={t('sales.dispensed')}>
        <Segmented aria-label={t('sales.dispensed')} value={f.dispensed ?? 'all'} onChange={(v) => set({ dispensed: v === 'all' ? null : v })}
          options={['all', 'true', 'false'].map((v) => ({ value: v, label: t(`sales.dispensed.${v}`) }))} />
      </Field>}
      {staff && (
        <Field sheet={sheet} label={t('sales.result')}>
          <Select aria-label={t('sales.result')} className={styles.select} value={f.result ?? ''}
            onChange={(v) => set({ result: v || null })}
            options={[{ value: '', label: t('sales.result.all') }, ...RESULTS.map((r) => ({ value: r, label: r }))]} />
        </Field>
      )}
    </>
  );
}

/**
 * f: the applied filters; rangeFor(f) → {group, first, last}; today: local date key; onChange(next);
 * lists: see Fields; summary: the one-line description (phone).
 */
export function SalesFilters({ f, rangeFor, today, onChange, lists, summary }) {
  const phone = useLayoutSize() === 'phone';
  const [draft, setDraft] = useState(null);   // the sheet's filters while it's open
  const range = rangeFor(f);
  const row = { ...lists, first: range.first, last: range.last };

  if (!phone) {
    return (
      <div className={styles.filters} role="group" aria-label={t('sales.filters')}>
        <Fields f={f} group={range.group} today={today} onChange={onChange} lists={row} />
      </div>
    );
  }

  const n = activeCount(f);
  const draftRange = draft ? rangeFor(draft) : range;
  return (
    <div className={styles.phoneBar}>
      <Button icon={<FilterOutlined />} onClick={() => setDraft(f)}>
        {n ? t('sales.filters.count', { n }) : t('sales.filters')}
      </Button>
      <span className={styles.summary}>{summary}</span>
      <Sheet open={Boolean(draft)} onClose={() => setDraft(null)}
        title={(
          <div className={styles.sheetTitle}>
            <span>{t('sales.filters')}</span>
            <Button type="link" onClick={() => setDraft(resetFilters(draft))}>{t('sales.filters.reset')}</Button>
          </div>
        )}
        footer={(
          <div className={styles.sheetFooter}>
            <Button size="large" onClick={() => setDraft(null)}>{t('sales.filters.cancel')}</Button>
            <Button size="large" type="primary" onClick={() => { onChange(draft); setDraft(null); }}>{t('sales.filters.apply')}</Button>
          </div>
        )}>
        {draft && (
          <div className={styles.sheetBody}>
            <Fields f={draft} group={draftRange.group} today={today} onChange={setDraft} sheet
              lists={{ ...lists, first: draftRange.first, last: draftRange.last }} />
          </div>
        )}
      </Sheet>
    </div>
  );
}
