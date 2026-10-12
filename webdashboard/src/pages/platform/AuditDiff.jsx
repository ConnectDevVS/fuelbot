// An audit entry's before / after, side by side per key (dashboard plan §5.17); changed keys are
// marked. Values are shown as JSON text, never as markup.
import { t } from '../../strings.js';
import styles from './platform.module.css';

const show = (v) => (v === undefined ? '—' : typeof v === 'string' ? v : JSON.stringify(v));

export function AuditDiff({ before, after }) {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  if (keys.length === 0) return <p className={styles.muted}>{t('audit.noValues')}</p>;
  return (
    <table className={styles.diff}>
      <thead>
        <tr>
          <th className="overline">{t('audit.field')}</th>
          <th className="overline">{t('audit.before')}</th>
          <th className="overline">{t('audit.after')}</th>
        </tr>
      </thead>
      <tbody>
        {keys.map((k) => {
          const a = before?.[k];
          const b = after?.[k];
          const changed = JSON.stringify(a) !== JSON.stringify(b);
          return (
            <tr key={k} className={changed ? styles.changed : undefined}>
              <th scope="row">{k}</th>
              <td>{show(a)}</td>
              <td>{show(b)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
