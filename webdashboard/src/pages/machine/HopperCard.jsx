// One hopper on the Stock tab (dashboard plan §5.6.3; mock-up design/stock-phone.png): the product
// and its StockChip, portions left (big) and ≈ days, a bar of what's left against the last level,
// the last refill with who did it (shown to every role: product owner, 2026-09-28), the low mark
// (editable with stock:write) and the portion size. Record refill / Adjust with stock:write only.
import { Link } from 'react-router';
import { Button, Card, Form, InputNumber } from 'antd';
import { api } from '../../api/client.js';
import { useDisplayTz } from '../../auth/session.js';
import { StockChip } from '../../ui/Chips.jsx';
import { FormError } from '../../ui/forms/FormError.jsx';
import { useVersionedSave } from '../../ui/forms/useVersionedSave.jsx';
import { formatCount } from '../../lib/money.js';
import { nameOf } from '../../lib/names.js';
import { formatDateTime } from '../../lib/time.js';
import { t, tn } from '../../strings.js';
import { machineKey, machinePath } from './machineQuery.js';
import styles from './stock.module.css';

const grams = (n) => t('stock.grams', { n: formatCount(n) });
const lowOf = (machine, pid) => machine?.menu?.find((i) => i.product_id === pid)?.low_portions ?? null;

/**
 * The menu item's low mark (null = the default). PATCH …/menu/:pid with If-Match: menu_version,
 * through useVersionedSave (Conflict dialog on 409). Dashboard-only: no restart note.
 */
function ThresholdEditor({ tid, mid, machine, item }) {
  const [form] = Form.useForm();
  const raw = lowOf(machine, item.product_id);
  const valuesOf = (m) => ({ low_portions: lowOf(m, item.product_id) });
  const path = machinePath(tid, mid);
  const saver = useVersionedSave({
    form, initial: { low_portions: raw }, version: machine.menu_version,
    fields: [{ name: 'low_portions', label: t('stock.lowBelow'), format: (v) => (v === null || v === undefined ? t('stock.lowDefault') : String(v)) }],
    fetchCurrent: () => api('GET', path).then((r) => r.machine),
    valuesOf, versionOf: (m) => m.menu_version,
    save: (values, version) => api('PATCH', `${path}/menu/${encodeURIComponent(item.product_id)}`,
      { body: { low_portions: values.low_portions ?? null }, ifMatch: version }).then((r) => r.machine),
    invalidate: [machineKey(tid, mid), ['stock']],
    success: t('stock.lowSaved'),
    onSaved: (m) => form.setFieldsValue(valuesOf(m)),
    onDiscard: (m) => form.setFieldsValue(valuesOf(m)),
  });
  const value = Form.useWatch('low_portions', form);
  const dirty = value !== undefined && (value ?? null) !== raw;
  return (
    <Form form={form} initialValues={{ low_portions: raw }} onFinish={saver.submit} className={styles.threshold}>
      <span>{t('stock.lowBelow')}</span>{' '}
      <Form.Item name="low_portions" noStyle>
        <InputNumber size="small" precision={0} min={0} max={1000} className={styles.lowInput}
          placeholder={String(item.low_portions)} aria-label={t('stock.lowLabel', { n: item.hopper })} />
      </Form.Item>{' '}
      <span>{t('stock.lowUnit')}</span>
      {dirty && <Button size="small" htmlType="submit" loading={saver.saving}>{t('stock.lowSave')}</Button>}
      {saver.problem && <div className={styles.full}><FormError problem={saver.problem} form={form} /></div>}
    </Form>
  );
}

function StateText({ item, flavorNames }) {
  if (item.state === 'refill_needed') {
    return (
      <p className={styles.hint}>
        {t('stock.text.refill_needed', { now: item.product_name ?? item.product_id,
          was: nameOf(flavorNames, item.last_refill?.product_id) })}
      </p>
    );
  }
  if (item.state === 'unknown' || item.state === 'not_estimated') return <p className={styles.hint}>{t(`stock.text.${item.state}`)}</p>;
  return null;
}

/**
 * item: a GET …/stock row. machine: the machine (menu, menu_version). write: stock:write.
 * onAction(mode): open Record refill ('refill') / Adjust ('adjust') for this hopper.
 */
export function HopperCard({ tid, mid, machine, item, write, flavorNames, onAction }) {
  const tz = useDisplayTz();
  const last = item.last_refill;
  const known = item.portions_left !== null && item.portions_left !== undefined;
  const pct = known && last?.level_g > 0 ? Math.min(100, (item.left_g / last.level_g) * 100) : null;
  return (
    <Card className={styles.hopperCard} role="region" aria-label={t('stock.hopperN', { n: item.hopper })}>
      <div className={styles.cardHead}>
        <div className={styles.cardName}>
          <div className="overline">{t('stock.hopperN', { n: item.hopper })}</div>
          <h3 className={styles.product}>{item.product_name ?? item.product_id}</h3>
        </div>
        <StockChip state={item.state} />
      </div>

      {/* Without an estimate (unknown, not estimated, refill needed) the state text says why instead. */}
      {known && <div className={styles.amount}>
        {/* Spaces between the parts: the flex gap looks right, but screen readers read the text. */}
        <span className={styles.big}>{formatCount(item.portions_left)}</span>{' '}
        <span className={styles.amountText}>
          {tn('stock.portionsLeft', item.portions_left)}
          {item.days_left !== null && item.days_left !== undefined && item.portions_left > 0 && ` · ${tn('stock.daysLeft', item.days_left)}`}
        </span>
      </div>}
      {pct !== null && (
        <div className={styles.bar} role="img" aria-label={t('stock.levelOf', { left: grams(item.left_g), level: grams(last.level_g) })}>
          {/* The width goes through the CSSOM (React's style prop), which the CSP allows. */}
          <span className={`${styles.barFill} ${styles[`bar_${item.state}`] ?? ''}`} style={{ width: `${Math.max(pct, 0)}%` }} />
        </div>
      )}
      {pct !== null && <div className={styles.line}>{t('stock.levelOf', { left: grams(item.left_g), level: grams(last.level_g) })}</div>}
      <StateText item={item} flavorNames={flavorNames} />
      {last && (
        <div className={styles.line}>
          {t(last.kind === 'adjust' ? 'stock.last.adjust' : 'stock.last.refill',
            { level: grams(last.level_g), when: formatDateTime(last.at, tz), who: last.by ?? t('stock.someone') })}
        </div>
      )}

      <div className={styles.facts}>
        {write ? <ThresholdEditor tid={tid} mid={mid} machine={machine} item={item} />
          : <span>{t('stock.lowBelow')} <b className="num">{item.low_portions}</b> {t('stock.lowUnit')}</span>}
        <span>
          {item.portion_g
            ? <Link to={`/t/${encodeURIComponent(tid)}/products`}>{t('stock.portion', { g: item.portion_g })}</Link>
            : <Link to={`/t/${encodeURIComponent(tid)}/products`}>{t('stock.portionNotSet')}</Link>}
        </span>
      </div>

      {write && (
        <div className={styles.actions}>
          <Button type="primary" size="large" onClick={() => onAction('refill')}>{t('stock.refill')}</Button>
          <Button size="large" onClick={() => onAction('adjust')}>{t('stock.adjust')}</Button>
        </div>
      )}
    </Card>
  );
}
