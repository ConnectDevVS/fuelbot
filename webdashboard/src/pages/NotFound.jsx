import { Link } from 'react-router';
import { Button, Result } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { t } from '../strings.js';

/** Also what another tenant's data looks like: it never says which (dashboard plan §4.4). */
export default function NotFound() {
  return (
    <Result icon={<QuestionCircleOutlined className="result-icon" />} title={t('notfound.title')} subTitle={t('error.not_found')}
      extra={<Link to="/"><Button type="primary">{t('notfound.home')}</Button></Link>} />
  );
}
