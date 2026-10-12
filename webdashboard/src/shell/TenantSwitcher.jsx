// Staff: "All tenants" → Fleet, a tenant → its Home (dashboard plan §2.7). GET /tenants.
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Select } from 'antd';
import { api } from '../api/client.js';
import { t } from '../strings.js';
import styles from './shell.module.css';

const ALL = '__all__';

export function TenantSwitcher({ tid }) {
  const navigate = useNavigate();
  const { data, isPending } = useQuery({
    queryKey: ['tenants'],
    queryFn: ({ signal }) => api('GET', '/tenants', { signal }).then((r) => r.items),
  });
  const options = [
    { value: ALL, label: t('switcher.all') },
    ...(data ?? []).map((tenant) => ({ value: tenant.id, label: tenant.name })),
  ];
  // Until the list loads, the current tenant's id stands in for its name.
  if (tid && !(data ?? []).some((x) => x.id === tid)) options.push({ value: tid, label: tid });
  return (
    <Select
      className={styles.switcher}
      aria-label={t('switcher.label')}
      value={tid ?? ALL}
      loading={isPending}
      options={options}
      showSearch={{ optionFilterProp: 'label' }}
      popupMatchSelectWidth={false}
      onChange={(value) => navigate(value === ALL ? '/fleet' : `/t/${encodeURIComponent(value)}/home`)}
    />
  );
}
