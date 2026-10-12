// Phone "More": the nav items that aren't tabs, then the account actions, in a bottom sheet.
import { NavLink } from 'react-router';
import { Drawer } from 'antd';
import { ICONS } from './icons.js';
import { useAccountActions } from './UserMenu.jsx';
import { useMe } from '../auth/session.js';
import { t } from '../strings.js';
import styles from './shell.module.css';

export function MoreSheet({ open, onClose, items, platformIds }) {
  const { data: me } = useMe();
  const actions = useAccountActions();
  const main = items.filter((i) => !platformIds.has(i.page.id));
  const platform = items.filter((i) => platformIds.has(i.page.id));
  const link = ({ page, href }) => {
    const Icon = ICONS[page.nav.icon];
    return (
      <NavLink key={page.id} to={href} className={styles.sheetItem} onClick={onClose}>
        <Icon /> <span>{t(page.title)}</span>
      </NavLink>
    );
  };
  return (
    <Drawer open={open} onClose={onClose} placement="bottom" size="auto" title={t('nav.more')} className={styles.sheet}>
      <nav aria-label={t('nav.more')} className={styles.sheetList}>
        {main.map(link)}
        {platform.length > 0 && <div className={`overline ${styles.sheetGroup}`}>{t('nav.platform')}</div>}
        {platform.map(link)}
        <div className={`overline ${styles.sheetGroup}`}>{t('nav.account')}</div>
        <span className={styles.sheetWho}>{me.user.email}</span>
        <button type="button" className={styles.sheetItem} onClick={() => { onClose(); actions.changePassword(); }}>
          {t('account.password')}
        </button>
        <button type="button" className={styles.sheetItem} onClick={() => { onClose(); actions.signOut(); }}>
          {t('account.signout')}
        </button>
      </nav>
    </Drawer>
  );
}
