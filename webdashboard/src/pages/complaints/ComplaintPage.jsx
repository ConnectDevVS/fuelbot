// One complaint (dashboard plan §5.20; SRV-53): /t/:tid/complaints/:number. The header (number, title,
// status, who raised it and when), the thread, and the comment box (ComplaintReply). Outside the
// caller's scope the server says 404 (an operator opening a colleague's number), and so does the page.
import { useLocation, useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { api } from '../../api/client.js';
import { useDisplayTz } from '../../auth/session.js';
import { useIsStaff } from '../../shell/tenant.js';
import { PageHeader, RefreshButton } from '../../ui/PageHeader.jsx';
import { ComplaintStatusChip } from '../../ui/Chips.jsx';
import { ErrorPanel, NotFoundState, PageSkeleton } from '../../ui/States.jsx';
import { formatDateTime } from '../../lib/time.js';
import { ComplaintTimeline } from './ComplaintTimeline.jsx';
import { ComplaintReply } from './ComplaintReply.jsx';
import { t } from '../../strings.js';
import styles from './complaint.module.css';

export default function ComplaintPage() {
  const { tid, number } = useParams();
  const tz = useDisplayTz();
  const staff = useIsStaff();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const key = ['complaints', 'one', tid, number];
  const path = `/tenants/${encodeURIComponent(tid)}/complaints/${encodeURIComponent(number)}`;
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => api('GET', path, { signal }).then((r) => r.complaint),
    retry: false,
  });
  // Back to the list the user came from (history keeps its filter), else the tenant's list.
  const back = () => (location.key !== 'default' ? navigate(-1) : navigate(`/t/${encodeURIComponent(tid)}/complaints`));

  if (query.isPending) return <PageSkeleton rows={8} />;
  if (query.error?.status === 404) return <NotFoundState />;
  if (query.error) return <ErrorPanel error={query.error} onRetry={query.refetch} />;
  const c = query.data;

  return (
    <section>
      <Button type="link" icon={<ArrowLeftOutlined />} onClick={back} className={styles.back}>{t('complaint.back')}</Button>
      <PageHeader overline={t('complaints.number', { n: c.number })} title={c.title} actions={<RefreshButton queries={[query]} />} />
      <div className={styles.summary}>
        <ComplaintStatusChip status={c.status} />
        <span>{t('complaint.raisedBy', { name: c.created_by.name, when: formatDateTime(c.created_at, tz) })}</span>
        {staff && c.created_by.email && <span className={styles.email}>{c.created_by.email}</span>}
        {staff && c.tenant_name && <span className={styles.email}>{c.tenant_name}</span>}
      </div>
      <ComplaintTimeline complaint={c} />
      <ComplaintReply complaint={c} path={path} onSaved={(saved) => queryClient.setQueryData(key, saved)} onReload={() => query.refetch()} />
    </section>
  );
}
