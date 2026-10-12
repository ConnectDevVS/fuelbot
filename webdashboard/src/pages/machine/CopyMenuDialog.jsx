// "Copy menu from…" (dashboard plan §5.6.1): pick another configured machine; a confirm names both
// and warns that price overrides are copied too; then POST …/menu/copy-from/:src with If-Match:
// menu_version. The server checks the result like any menu (422 → the machine would reject it).
import { useState } from 'react';
import { Alert, App, Select } from 'antd';
import { api } from '../../api/client.js';
import { messageFor } from '../../api/errors.js';
import { useToast } from '../../ui/dialogs.js';
import { machineName } from '../../lib/names.js';
import { machinePath } from './machineQuery.js';
import { t } from '../../strings.js';
import styles from './menu.module.css';

/** machine: the target (tenant_id, id, menu_version); sources: configured machines; onCopied(machine, source) → {from, to}. */
export function CopyMenuDialog({ tid, machine, sources, onCopied }) {
  const { modal } = App.useApp();
  const toast = useToast();
  const [problem, setProblem] = useState(null);
  const to = machineName(machine);

  const pick = (sourceId) => {
    const source = sources.find((m) => m.id === sourceId);
    const from = machineName(source);
    setProblem(null);
    modal.confirm({
      title: t('menu.copy.title', { from, to }),
      content: t('menu.copy.body', { from, to }),
      okText: t('menu.copy.ok'),
      cancelText: t('action.cancel'),
      autoFocusButton: 'cancel',
      onOk: async () => {
        try {
          const { machine: saved } = await api('POST', `${machinePath(tid, machine.id)}/menu/copy-from/${encodeURIComponent(sourceId)}`,
            { ifMatch: machine.menu_version ?? 0 });
          await onCopied(saved, source);
          toast.success(t('menu.copied', { from, to }));
        } catch (err) {
          setProblem(messageFor(err));
        }
      },
    });
  };

  return (
    <>
      <Select aria-label={t('menu.copyPick')} placeholder={t('menu.copy')} value={null} disabled={sources.length === 0}
        popupMatchSelectWidth={false} className={styles.picker} onChange={(v) => v && pick(v)}
        options={sources.map((m) => ({ value: m.id, label: `${machineName(m)} · ${m.id}` }))} />
      {problem && <Alert type="error" showIcon title={problem} className={styles.copyError} />}
    </>
  );
}
