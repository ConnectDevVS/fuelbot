// The account menu: who you are, Change password, Sign out.
import { useNavigate } from 'react-router';
import { Button, Dropdown } from 'antd';
import { useMe, useSignOut } from '../auth/session.js';
import { t } from '../strings.js';
import styles from './shell.module.css';

export function roleLabel(role) {
  return t(`role.${role}`);
}

export function useAccountActions() {
  const navigate = useNavigate();
  const signOut = useSignOut();
  return {
    changePassword: () => navigate('/change-password'),
    signOut: async () => { await signOut(); navigate('/sign-in', { replace: true }); },
  };
}

export function Avatar({ name }) {
  return <span className={styles.avatar} aria-hidden="true">{(name || '?').trim().charAt(0).toUpperCase()}</span>;
}

export function UserMenu({ compact }) {
  const { data: me } = useMe();
  const actions = useAccountActions();
  const items = [
    { key: 'who', disabled: true, label: <span className={styles.who}><b>{me.user.name || me.user.email}</b><span className="overline">{me.user.email}</span></span> },
    { type: 'divider' },
    { key: 'password', label: t('account.password'), onClick: actions.changePassword },
    { key: 'signout', label: t('account.signout'), onClick: actions.signOut },
  ];
  return (
    <Dropdown menu={{ items }} trigger={['click']} placement="bottomRight">
      <Button type="text" className={styles.account} aria-label={t('account.menu')}>
        <Avatar name={me.user.name || me.user.email} />
        {!compact && (
          <span className={styles.accountText}>
            <span>{me.user.name || me.user.email}</span>
            <span className="overline">{roleLabel(me.user.role)}</span>
          </span>
        )}
      </Button>
    </Dropdown>
  );
}
