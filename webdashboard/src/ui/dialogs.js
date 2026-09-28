// Confirm dialogs and toasts (§4 patterns 9 and 14) through App.useApp(), which carries the theme
// and the CSP nonce. A destructive confirm names the consequence; its red button repeats the verb.
import { App } from 'antd';
import { t } from '../strings.js';

export const CONFIRMS = ['revokeKey', 'disableUser', 'disableMachine', 'disableTenant', 'maintenanceOn', 'archiveProduct'];

export function useConfirm() {
  const { modal } = App.useApp();
  /** Resolves true when confirmed. params fill the texts ({prefix}, {name}). */
  return (action, params = {}) => new Promise((resolve) => {
    modal.confirm({
      title: t(`confirm.${action}.title`, params),
      content: t(`confirm.${action}.body`, params),
      okText: t(`confirm.${action}.ok`, params),
      okButtonProps: { danger: true, type: 'primary' },
      cancelText: t('action.cancel'),
      autoFocusButton: 'cancel',
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
}

/** Short confirmations only; errors are never toast-only (§4 pattern 14). */
export function useToast() {
  return App.useApp().message;
}
