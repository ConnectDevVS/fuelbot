// The Config preview tab (dashboard plan §5.6.2; SRV-43): exactly what the machine gets at its next
// restart (GET …/machines/:mid/config), and the kiosk app's own verdict on it. Tenant users' config
// has no maintenance block (the server leaves it out); staff see a Maintenance line.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button } from 'antd';
import { CheckOutlined, CodeOutlined, CopyOutlined } from '@ant-design/icons';
import { api } from '../../api/client.js';
import { useIsStaff } from '../../shell/tenant.js';
import { RefreshButton } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { useCopy } from '../../ui/Id.jsx';
import { EmptyState, ErrorPanel, PageSkeleton } from '../../ui/States.jsx';
import { KioskPreview } from './KioskPreview.jsx';
import { machinePath } from './machineQuery.js';
import { t } from '../../strings.js';
import styles from './config.module.css';

function RawJson({ config }) {
  const text = JSON.stringify(config, null, 2);
  const { ref, copied, copy } = useCopy(text);
  return (
    <div className={styles.raw}>
      <Button size="small" icon={copied ? <CheckOutlined /> : <CopyOutlined />} onClick={copy} className={styles.rawCopy}>
        {copied ? t('copy.copied') : t('config.copyJson')}
      </Button>
      <pre ref={ref} className={styles.pre}>{text}</pre>
    </div>
  );
}

export default function ConfigTab({ tid, mid }) {
  const staff = useIsStaff();
  const query = useQuery({
    queryKey: ['config', tid, mid],
    queryFn: ({ signal }) => api('GET', `${machinePath(tid, mid)}/config`, { signal }),
  });
  const [raw, setRaw] = useState(false);

  if (query.isPending) return <PageSkeleton rows={6} />;
  if (query.error) return <ErrorPanel error={query.error} onRetry={query.refetch} />;
  const { configured, config, errors = [] } = query.data;
  const maintenance = config?.maintenance;

  return (
    <>
      <div className={styles.intro}>
        <span>{t('config.intro')}</span>
        <RefreshButton queries={[query]} />
      </div>
      {!configured && <EmptyState message={t('config.notConfigured')} />}
      {errors.length > 0 && (
        <Alert type="error" showIcon role="alert" className={styles.gap} title={t('config.errors')}
          description={<ul className={styles.errors}>{errors.map((e) => <li key={e}>{e}</li>)}</ul>} />
      )}
      {configured && config && (
        <Panel title={t('config.preview')} sub={t('config.version', { v: config.version ?? '—' })}
          extra={<Button icon={<CodeOutlined />} onClick={() => setRaw((v) => !v)}>{raw ? t('config.rawHide') : t('config.raw')}</Button>}>
          {staff && maintenance && (
            <p className={styles.maintenance}>
              {t('config.maintenance', { state: t(maintenance.enabled ? 'config.maintenance.on' : 'config.maintenance.off') })}
              {maintenance.enabled && maintenance.message ? ` · ${maintenance.message}` : ''}
            </p>
          )}
          <KioskPreview config={config} />
          <div className={styles.bases}>
            <span className="overline">{t('config.bases')}</span>
            {(config.bases ?? []).map((b) => (
              <span key={b.id} className={b.enabled ? undefined : styles.baseOff}>
                {b.name} <span className="mono">{b.code}</span>{b.enabled ? '' : ` (${t('config.baseOff')})`}
              </span>
            ))}
          </div>
          {raw && <RawJson config={config} />}
        </Panel>
      )}
    </>
  );
}
