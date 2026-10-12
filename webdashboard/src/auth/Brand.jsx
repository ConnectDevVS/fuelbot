import styles from './auth.module.css';
import { t } from '../strings.js';

export function Brand() {
  return (
    <div className={styles.brand}>
      <span className={styles.mark} aria-hidden="true">{t('brand.mark')}</span>
      <span>{t('brand.name')}</span>
    </div>
  );
}
