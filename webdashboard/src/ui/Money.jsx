// ₹ in whole rupees (§2.10). `was`: the list price, struck through, when an offer applies.
import { formatMoney } from '../lib/money.js';
import styles from './ui.module.css';

export function Money({ value, was }) {
  const struck = was !== null && was !== undefined && was !== value;
  return (
    <span className="num">
      {formatMoney(value)}
      {struck && <del className={styles.was}>{formatMoney(was)}</del>}
    </span>
  );
}
