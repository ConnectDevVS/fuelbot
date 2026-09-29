// Phone navigation (< 760 px): four pages + More, fixed at the bottom (antd has no tab bar).
import { NavLink } from 'react-router';
import { ICONS } from './icons.js';
import { t } from '../strings.js';
import styles from './shell.module.css';

export function TabBar({ tabs, activeId, onMore, moreActive }) {
  const More = ICONS.more;
  return (
    <nav className={`${styles.tabbar} no-print`} aria-label={t('nav.label')}>
      {tabs.map(({ page, href }) => {
        const Icon = ICONS[page.nav.icon];
        return (
          <NavLink key={page.id} to={href} className={styles.tab} data-active={page.id === activeId || undefined}
            aria-current={page.id === activeId ? 'page' : undefined}>
            <span className={styles.tabIcon}><Icon /></span>
            <span className={styles.tabLabel}>{t(page.title)}</span>
          </NavLink>
        );
      })}
      <button type="button" className={styles.tab} data-active={moreActive || undefined} onClick={onMore}>
        <span className={styles.tabIcon}><More /></span>
        <span className={styles.tabLabel}>{t('nav.more')}</span>
      </button>
    </nav>
  );
}
