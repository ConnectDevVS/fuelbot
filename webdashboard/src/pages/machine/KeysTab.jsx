// The Keys tab (dashboard plan §5.6.7; keys:manage): the machine's keys (prefix, label, created, by,
// last used, status), Issue a new key → the provisioning card (the key shown once, held in this
// tab's state only), and Revoke after a confirm. created_by is a user id: named from the users list
// when the caller may list users, "—" otherwise.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Input, Space } from 'antd';
import { KeyOutlined } from '@ant-design/icons';
import { api } from '../../api/client.js';
import { messageFor } from '../../api/errors.js';
import { useCan } from '../../auth/session.js';
import { RefreshButton } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { DataTable } from '../../ui/DataTable.jsx';
import { DateTime, RelativeTime } from '../../ui/DateTime.jsx';
import { useConfirm, useToast } from '../../ui/dialogs.js';
import { EmptyState, ErrorPanel, PageSkeleton } from '../../ui/States.jsx';
import { issueKey } from '../../lib/issueKey.js';
import { machineName } from '../../lib/names.js';
import { ProvisioningCard } from '../machines/ProvisioningCard.jsx';
import { machinePath } from './machineQuery.js';
import { t } from '../../strings.js';
import styles from './machine.module.css';

function useUserEmails(enabled) {
  const users = useQuery({
    queryKey: ['users', 'names'],
    queryFn: ({ signal }) => api('GET', '/users?limit=200', { signal }).then((r) => r.items),
    enabled,
  });
  return useMemo(() => new Map((users.data ?? []).map((u) => [u.id, u.email])), [users.data]);
}

export default function KeysTab({ tid, mid, machine }) {
  const can = useCan();
  const confirm = useConfirm();
  const toast = useToast();
  const keys = useQuery({
    queryKey: ['keys', tid, mid],
    queryFn: ({ signal }) => api('GET', `${machinePath(tid, mid)}/keys`, { signal }).then((r) => r.items),
  });
  const emails = useUserEmails(can('users:manage'));
  const [issuing, setIssuing] = useState(false);   // the label form is open
  const [label, setLabel] = useState('');
  const [issued, setIssued] = useState(null);      // {key, machine_key}: this tab's state only
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);

  const issue = async () => {
    setBusy(true);
    setProblem(null);
    try {
      setIssued(await issueKey(tid, mid, label.trim() || machineName(machine)));
      setIssuing(false);
      keys.refetch();
    } catch (err) {
      setProblem(messageFor(err));
    } finally {
      setBusy(false);
    }
  };
  const revoke = async (k) => {
    if (!(await confirm('revokeKey', { prefix: k.prefix }))) return;
    try {
      await api('DELETE', `${machinePath(tid, mid)}/keys/${encodeURIComponent(k.id)}`);
      toast.success(t('keys.revokedToast', { prefix: k.prefix }));
    } catch (err) {
      setProblem(messageFor(err));
    }
    keys.refetch();
  };

  if (issued) {
    return (
      <ProvisioningCard tenantId={machine.tenant_id} machineId={machine.id} keyValue={issued.key}
        onDone={() => setIssued(null)} />
    );
  }

  const columns = [
    { key: 'prefix', title: t('keys.col.prefix'), priority: 1, render: (k) => <span className="mono">{k.prefix}…</span> },
    { key: 'label', title: t('keys.col.label'), priority: 2, render: (k) => k.label || '—' },
    { key: 'created', title: t('keys.col.created'), priority: 2, render: (k) => <DateTime value={k.created_at} /> },
    { key: 'by', title: t('keys.col.createdBy'), priority: 3, render: (k) => (k.created_by && emails.get(k.created_by)) || '—' },
    { key: 'used', title: t('keys.col.lastUsed'), priority: 2,
      render: (k) => (k.last_used_at ? <RelativeTime value={k.last_used_at} now={keys.dataUpdatedAt} /> : t('keys.never')) },
    { key: 'status', title: t('keys.col.status'), priority: 2, render: (k) => (k.revoked_at ? t('keys.revoked') : t('keys.active')) },
    { key: 'action', title: '', priority: 2, align: 'right', render: (k) => (k.revoked_at ? null
      : <Button size="small" danger onClick={() => revoke(k)}>{t('keys.revoke')}</Button>) },
  ];

  return (
    <>
      <div className={styles.intro}>
        <span>{t('keys.guidance')}</span>
        <span className={styles.introActions}>
          <RefreshButton queries={[keys]} />
          <Button type="primary" icon={<KeyOutlined />} onClick={() => { setLabel(machineName(machine)); setIssuing(true); }}>{t('keys.issue')}</Button>
        </span>
      </div>
      {problem && <Alert type="error" showIcon title={problem} className={styles.gap} />}
      {issuing && (
        <Panel title={t('keys.issue')}>
          <Space wrap>
            <Input aria-label={t('register.key.label')} value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)}
              onPressEnter={issue} className={styles.label} />
            <Button type="primary" loading={busy} onClick={issue}>{t('register.key.issue')}</Button>
            <Button onClick={() => setIssuing(false)}>{t('action.cancel')}</Button>
          </Space>
        </Panel>
      )}
      <div className={styles.history}>
        {keys.isPending && <PageSkeleton rows={3} />}
        {keys.error && <ErrorPanel error={keys.error} onRetry={keys.refetch} />}
        {keys.data && <DataTable rows={keys.data} columns={columns} empty={<EmptyState message={t('keys.none')} />} />}
      </div>
    </>
  );
}
