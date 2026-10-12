// A price (§4 pattern 11): an ₹ input in whole rupees for users with price:write; for everyone else
// the value read-only with a lock and why. The value is still part of the form, so whole-object
// saves send it unchanged (the server allows unchanged values).
import { InputNumber, Tooltip } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { formatMoney } from '../../lib/money.js';
import { t } from '../../strings.js';
import styles from './forms.module.css';

export function PriceField({ value, onChange, editable, id, placeholder, 'aria-label': ariaLabel }) {
  if (!editable) {
    return (
      <Tooltip title={t('price.locked')}>
        <span className={styles.lockedPrice} id={id} tabIndex={0} aria-label={`${ariaLabel ?? ''} ${formatMoney(value)}, ${t('price.locked')}`.trim()}>
          <span className="num">{value === null || value === undefined ? '—' : formatMoney(value)}</span>
          <LockOutlined aria-hidden="true" />
        </span>
      </Tooltip>
    );
  }
  return (
    <InputNumber id={id} value={value} onChange={onChange} prefix="₹" min={1} precision={0} step={1}
      inputMode="numeric" placeholder={placeholder} aria-label={ariaLabel} className={styles.price} />
  );
}

/** antd Form rules for a price: whole rupees > 0; optional unless required. */
export function priceRules({ required = false } = {}) {
  return [
    ...(required ? [{ required: true, message: t('price.required') }] : []),
    { validator: (_, v) => (v === null || v === undefined || v === '' || (Number.isInteger(v) && v > 0)
      ? Promise.resolve() : Promise.reject(new Error(t('price.whole')))) },
  ];
}
