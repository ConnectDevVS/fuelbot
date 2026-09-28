// Desktop sidebar (≥ 1100 px, labels) and tablet icon rail (760–1099 px, tooltips): antd
// Layout.Sider + Menu. Links are NavLinks, so the active one carries aria-current="page".
import { NavLink } from 'react-router';
import { Layout, Menu } from 'antd';
import { ICONS } from './icons.js';
import { t } from '../strings.js';
import styles from './shell.module.css';

function menuItem({ page, href }) {
  const Icon = ICONS[page.nav.icon];
  return { key: page.id, icon: <Icon />, label: <NavLink to={href}>{t(page.title)}</NavLink> };
}

export function Sidebar({ nav, activeId, collapsed }) {
  const items = [
    ...nav.main.map(menuItem),
    ...(nav.platform.length
      ? [{ type: 'group', key: 'platform', label: collapsed ? null : t('nav.platform'), children: nav.platform.map(menuItem) }]
      : []),
  ];
  return (
    <Layout.Sider className={styles.sider} width={232} collapsedWidth={72} collapsed={collapsed} trigger={null} theme="light">
      <nav aria-label={t('nav.label')} className={styles.siderInner}>
        <div className={styles.siderBrand}>
          <span className={styles.brandMark} aria-hidden="true">{t('brand.mark')}</span>
          {!collapsed && <span className={styles.brandName}>{t('brand.name')}</span>}
        </div>
        <Menu mode="inline" items={items} selectedKeys={activeId ? [activeId] : []} className={styles.menu} />
        {!collapsed && <div className={`overline ${styles.siderFooter}`}>{t('nav.footer')}</div>}
      </nav>
    </Layout.Sider>
  );
}
