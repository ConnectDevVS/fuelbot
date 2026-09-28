// Next to every Save that changes what a machine shows (§4 pattern 12).
import { InfoCircleOutlined } from '@ant-design/icons';
import { t } from '../../strings.js';
import styles from './forms.module.css';

export function RestartNote({ variant = 'restart' }) {
  return (
    <span className={styles.note}>
      <InfoCircleOutlined aria-hidden="true" /> {t(variant === 'maintenance' ? 'note.maintenance' : 'note.restart')}
    </span>
  );
}
