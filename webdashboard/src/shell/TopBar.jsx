// Top bar (dashboard plan §2.7): the tenant badge (logo text in a lime square + name) or, for
// staff, the tenant switcher; the account menu on the right.
import { useIsStaff } from './tenant.js';
import { TenantSwitcher } from './TenantSwitcher.jsx';
import { UserMenu } from './UserMenu.jsx';
import { t } from '../strings.js';
import styles from './shell.module.css';

export function TenantBadge({ tenant }) {
  if (!tenant) return null;
  return (
    <span className={styles.badge}>
      <span className={styles.mark} aria-hidden="true">{tenant.logo_text || tenant.name.slice(0, 2).toUpperCase()}</span>
      <span className={styles.badgeText}>
        <span className={styles.tenantName}>{tenant.name}</span>
        <span className="overline">{t('topbar.tenant', { id: tenant.id })}</span>
      </span>
    </span>
  );
}

export function TopBar({ tid, tenant, size }) {
  const staff = useIsStaff();
  return (
    <header className={`${styles.topbar} no-print`}>
      <div className={styles.topLeft}>
        {staff ? <TenantSwitcher tid={tid} /> : <TenantBadge tenant={tenant} />}
      </div>
      <UserMenu compact={size === 'phone'} />
    </header>
  );
}
