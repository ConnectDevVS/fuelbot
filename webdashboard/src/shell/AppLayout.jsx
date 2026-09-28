// The signed-in frame. SRV-32: a minimal top bar (brand, account actions) and the session banner;
// SRV-33 replaces it with the full shell (sidebar / rail / tab bar, tenant switcher).
import { Link, Outlet, useNavigate } from 'react-router';
import { Button, Space } from 'antd';
import { SessionExpiryBanner } from '../auth/SessionExpiryBanner.jsx';
import { useMe, useSignOut } from '../auth/session.js';
import { t } from '../strings.js';
import styles from './shell.module.css';

export default function AppLayout() {
  const { data: me } = useMe();
  const signOut = useSignOut();
  const navigate = useNavigate();
  return (
    <div className={styles.frame}>
      <header className={styles.topbar}>
        <span className={styles.brand}>{t('brand.name')}</span>
        <Space wrap>
          <span className="overline">{me.user.email}</span>
          <Link to="/change-password">{t('account.password')}</Link>
          <Button onClick={async () => { await signOut(); navigate('/sign-in', { replace: true }); }}>
            {t('account.signout')}
          </Button>
        </Space>
      </header>
      <SessionExpiryBanner />
      <main id="main" className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
