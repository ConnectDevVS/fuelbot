import { Link } from 'react-router';
import { Button, Result } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { t } from '../strings.js';

export default function NotAvailable() {
  return (
    <Result icon={<LockOutlined className="result-icon" />} title={t('notavailable.title')} subTitle={t('notavailable.body')}
      extra={<Link to="/"><Button type="primary">{t('notfound.home')}</Button></Link>} />
  );
}
