// Loading, empty, error, not found, not available (dashboard plan §4 patterns 2–4).
import { Link } from 'react-router';
import { Alert, Button, Card, Col, Empty, Result, Row, Skeleton } from 'antd';
import { LockOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { messageFor } from '../api/errors.js';
import { t } from '../strings.js';
import styles from './ui.module.css';

/** Skeletons shaped like the content: 'table' | 'cards' | 'kpis'. No spinners for page loads. */
export function PageSkeleton({ kind = 'table', rows = 5 }) {
  if (kind === 'kpis') {
    return (
      <Row gutter={[16, 16]} aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <Col key={i} xs={12} lg={6}><Card><Skeleton active paragraph={{ rows: 1 }} /></Card></Col>
        ))}
      </Row>
    );
  }
  if (kind === 'cards') {
    return (
      <div className={styles.cards} aria-busy="true">
        {Array.from({ length: rows }, (_, i) => <Card key={i}><Skeleton active paragraph={{ rows: 2 }} /></Card>)}
      </div>
    );
  }
  return <Card aria-busy="true"><Skeleton active title={false} paragraph={{ rows }} /></Card>;
}

export function EmptyState({ message, action }) {
  return (
    <Empty className={styles.empty} image={Empty.PRESENTED_IMAGE_SIMPLE} description={message}>
      {action}
    </Empty>
  );
}

/** A failed load: the message and Retry; the rest of the page stays usable. */
export function ErrorPanel({ error, onRetry }) {
  return (
    <Alert type="error" showIcon title={messageFor(error)} role="alert"
      action={onRetry ? <Button size="small" onClick={() => onRetry()}>{t('action.retry')}</Button> : undefined} />
  );
}

const home = <Link to="/"><Button type="primary">{t('notfound.home')}</Button></Link>;

/** Also what another tenant's data looks like: it never says which (§4 pattern 4). */
export function NotFoundState() {
  return <Result icon={<QuestionCircleOutlined className="result-icon" />} title={t('notfound.title')} subTitle={t('error.not_found')} extra={home} />;
}

export function NotAvailableState() {
  return <Result icon={<LockOutlined className="result-icon" />} title={t('notavailable.title')} subTitle={t('notavailable.body')} extra={home} />;
}
