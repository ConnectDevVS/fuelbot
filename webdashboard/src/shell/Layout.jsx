// The signed-in shell (dashboard plan §2.9): sidebar ≥ 1100 px, icon rail 760–1099 px, top bar +
// bottom tab bar below. Pages load lazily inside (Suspense with a skeleton). The document title is
// "<Page> · <Tenant> · FuelBot".
import { Suspense, useEffect, useState } from 'react';
import { Outlet, useLocation, useMatches } from 'react-router';
import { Layout as AntLayout, Skeleton } from 'antd';
import { Sidebar } from './Sidebar.jsx';
import { TabBar } from './TabBar.jsx';
import { MoreSheet } from './MoreSheet.jsx';
import { TopBar } from './TopBar.jsx';
import { navFor } from './pages.js';
import { useCurrentTenant, useIsStaff } from './tenant.js';
import { useCan } from '../auth/session.js';
import { SessionExpiryBanner } from '../auth/SessionExpiryBanner.jsx';
import { useLayoutSize } from '../lib/useMedia.js';
import { t } from '../strings.js';
import styles from './shell.module.css';

export default function Layout() {
  const size = useLayoutSize();
  const can = useCan();
  const staff = useIsStaff();
  const { tid, tenant } = useCurrentTenant();
  const location = useLocation();
  const matches = useMatches();
  const page = [...matches].reverse().find((m) => m.handle?.page)?.handle.page ?? null;
  const nav = navFor({ can, tid: tid ?? (staff ? null : tenant?.id), staff });
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    document.title = [page ? t(page.title) : null, tenant?.name, t('brand.name')].filter(Boolean).join(' · ');
  }, [page, tenant?.name]);

  const activeId = page?.id === 'machine' || page?.id === 'machine-new' ? 'machines' : page?.id;
  const moreActive = nav.more.some((i) => i.page.id === activeId);
  const platformIds = new Set(nav.platform.map((i) => i.page.id));

  return (
    <AntLayout className={styles.root} data-layout={size}>
      <a href="#main" className="skip-link">{t('nav.skip')}</a>
      {size !== 'phone' && <Sidebar nav={nav} activeId={activeId} collapsed={size === 'tablet'} />}
      <AntLayout className={styles.column}>
        <TopBar tid={tid} tenant={tenant} size={size} />
        <SessionExpiryBanner />
        <AntLayout.Content id="main" className={styles.main} tabIndex={-1}>
          <Suspense fallback={<Skeleton active />}>
            <Outlet key={location.pathname} />
          </Suspense>
        </AntLayout.Content>
      </AntLayout>
      {size === 'phone' && (
        <>
          <TabBar tabs={nav.tabs} activeId={activeId} moreActive={moreActive} onMore={() => setMoreOpen(true)} />
          <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} items={nav.more} platformIds={platformIds} />
        </>
      )}
    </AntLayout>
  );
}
