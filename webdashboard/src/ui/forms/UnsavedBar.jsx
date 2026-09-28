// Unsaved changes (§4 pattern 13): a sticky bar "Unsaved changes · Discard · Save" while the form
// differs from what was loaded, and a confirm before leaving (in-app navigation via the router's
// blocker, closing or reloading the tab via beforeunload).
import { useEffect } from 'react';
import { useBlocker } from 'react-router';
import { App, Button } from 'antd';
import { RestartNote } from './RestartNote.jsx';
import { t } from '../../strings.js';
import styles from './forms.module.css';

export function useLeaveGuard(dirty) {
  const { modal } = App.useApp();
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    modal.confirm({
      title: t('unsaved.leave.title'),
      content: t('unsaved.leave.body'),
      okText: t('unsaved.leave.ok'),
      okButtonProps: { danger: true },
      cancelText: t('unsaved.leave.stay'),
      autoFocusButton: 'cancel',
      onOk: () => blocker.proceed(),
      onCancel: () => blocker.reset(),
    });
  }, [blocker, modal]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
}

export function UnsavedBar({ dirty, saving, onDiscard, onSave, note = 'restart' }) {
  useLeaveGuard(dirty);
  if (!dirty) return null;
  return (
    <div className={styles.unsaved} role="region" aria-label={t('unsaved.label')}>
      <span className={styles.unsavedText}>
        <b>{t('unsaved.label')}</b>
        {note && <RestartNote variant={note} />}
      </span>
      <span className={styles.unsavedActions}>
        <Button onClick={onDiscard} disabled={saving}>{t('unsaved.discard')}</Button>
        <Button type="primary" onClick={onSave} loading={saving}>{t('unsaved.save')}</Button>
      </span>
    </div>
  );
}
