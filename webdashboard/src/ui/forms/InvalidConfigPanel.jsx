// 422 invalid_config (§4 pattern 10): nothing was saved because a machine's app would reject the
// result. One block per machine: its name and the app's own error strings.
import { Alert } from 'antd';
import { machineName } from '../../lib/names.js';
import { t } from '../../strings.js';
import styles from './forms.module.css';

/** machines: the tenant's machines (for names); unknown ids show as themselves. */
export function InvalidConfigPanel({ error, machines = [] }) {
  if (error?.code !== 'invalid_config' || !Array.isArray(error.details)) return null;
  const byId = new Map(machines.map((m) => [m.id, m]));
  return (
    <Alert type="error" showIcon role="alert" className={styles.formError} title={t('config.reject')}
      description={(
        <div className={styles.machines}>
          {error.details.map((d) => (
            <div key={d.machine_id}>
              <b>{machineName(byId.get(d.machine_id) ?? { id: d.machine_id })}</b>
              <span className="overline"> · {d.machine_id}</span>
              <ul className={styles.problems}>{(d.errors ?? []).map((e) => <li key={e}>{e}</li>)}</ul>
            </div>
          ))}
          <div>{t('config.nothingSaved')}</div>
        </div>
      )}
    />
  );
}
