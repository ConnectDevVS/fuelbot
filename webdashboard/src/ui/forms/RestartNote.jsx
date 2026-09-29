// Next to every Save that changes what a machine shows (§4 pattern 12).
import { InfoCircleOutlined } from '@ant-design/icons';
import { t } from '../../strings.js';
import styles from './forms.module.css';

const TEXT = { restart: 'note.restart', shared: 'note.shared', maintenance: 'note.maintenance' };

/** variant: 'restart' (one machine), 'shared' (a product: every machine using it), 'maintenance'. */
export function RestartNote({ variant = 'restart' }) {
  return (
    <span className={styles.note}>
      <InfoCircleOutlined aria-hidden="true" /> {t(TEXT[variant] ?? TEXT.restart)}
    </span>
  );
}
