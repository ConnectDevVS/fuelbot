// The summary above Save (§4 pattern 10): the message, links that scroll to each field in error,
// and the problems the form has no field for (the server's path is shown as is).
import { Alert, Button } from 'antd';
import styles from './forms.module.css';

export function FormError({ problem, form, labels = {} }) {
  if (!problem) return null;
  const labelOf = (name) => labels[[].concat(name).join('.')] ?? [].concat(name).join('.');
  const hasList = problem.fields.length > 0 || problem.unknown.length > 0;
  return (
    <Alert type="error" showIcon role="alert" className={styles.formError} title={problem.message}
      description={hasList ? (
        <ul className={styles.problems}>
          {problem.fields.map((f) => (
            <li key={JSON.stringify(f.name)}>
              <Button type="link" size="small" className={styles.fieldLink} onClick={() => form.scrollToField(f.name, { focus: true })}>
                {labelOf(f.name)}
              </Button>: {f.error}
            </li>
          ))}
          {problem.unknown.map((u) => <li key={`${u.field}:${u.error}`}><span className="mono">{u.field}</span>: {u.error}</li>)}
        </ul>
      ) : undefined}
    />
  );
}
