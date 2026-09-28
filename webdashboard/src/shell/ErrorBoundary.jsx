// The router's error element: a render error anywhere below shows this instead of a blank page.
import { Button, Result } from 'antd';
import { t } from '../strings.js';

export default function ErrorBoundary() {
  return (
    <Result status="error" title={t('crash.title')}
      extra={<Button type="primary" onClick={() => window.location.reload()}>{t('crash.reload')}</Button>} />
  );
}
