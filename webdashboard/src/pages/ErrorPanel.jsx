// A failed load (dashboard plan §4.4): the message and Retry; the rest of the page stays usable.
import { Alert, Button } from 'antd';
import { messageFor } from '../api/errors.js';
import { t } from '../strings.js';

export function ErrorPanel({ error, onRetry }) {
  return (
    <Alert type="error" showIcon title={messageFor(error)}
      action={onRetry ? <Button size="small" onClick={onRetry}>{t('action.retry')}</Button> : undefined} />
  );
}
