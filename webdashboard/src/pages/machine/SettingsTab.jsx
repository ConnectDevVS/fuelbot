// The Settings tab (dashboard plan §5.6.5; SRV-44): name, the kiosk header's location label, site,
// support phone (empty = the company's) and the idle video URL, saved with PATCH …/machines/:mid and
// If-Match: menu_version (useVersionedSave), plus a danger zone to disable / enable the machine.
// Editable with machines:manage; read-only otherwise. Changes reach the machine at its next restart.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Form, Input } from 'antd';
import { api } from '../../api/client.js';
import { messageFor } from '../../api/errors.js';
import { useCan } from '../../auth/session.js';
import { useConfirm, useToast } from '../../ui/dialogs.js';
import { useVersionedSave } from '../../ui/forms/useVersionedSave.jsx';
import { useFormDirty } from '../../ui/forms/useFormDirty.js';
import { FormError } from '../../ui/forms/FormError.jsx';
import { UnsavedBar } from '../../ui/forms/UnsavedBar.jsx';
import { machineName } from '../../lib/names.js';
import { machineKey, machinePath } from './machineQuery.js';
import { t } from '../../strings.js';
import styles from './settings.module.css';

const FIELDS = ['name', 'location_label', 'site', 'support_phone', 'idle_video_url'];
const valuesOf = (m) => Object.fromEntries(FIELDS.map((k) => [k, m[k] ?? '']));
/** Empty optional fields are sent as null (clears them); the name is always sent. */
export const settingsBody = (v) => Object.fromEntries(FIELDS.map((k) => {
  const value = typeof v[k] === 'string' ? v[k].trim() : v[k];
  return [k, k === 'name' ? value : value || null];
}));

function DangerZone({ tid, mid, machine, onChanged }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const name = machineName(machine);
  const set = async (disabled) => {
    if (disabled && !(await confirm('disableMachine', { name }))) return;
    setBusy(true);
    setProblem(null);
    try {
      await api('PATCH', machinePath(tid, mid), { body: { disabled }, ifMatch: machine.menu_version });
      await onChanged();
      toast.success(t(disabled ? 'settings.disabled' : 'settings.enabled', { name }));
    } catch (err) {
      setProblem(messageFor(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className={styles.danger} role="region" aria-label={t('settings.danger')}>
      <h2 className={styles.title}>{t('settings.danger')}</h2>
      {problem && <Alert type="error" showIcon title={problem} className={styles.gap} />}
      <div className={styles.dangerRow}>
        <span>{t(machine.disabled ? 'settings.disabledNow' : 'settings.disableLead')}</span>
        {machine.disabled
          ? <Button loading={busy} onClick={() => set(false)}>{t('settings.enable')}</Button>
          : <Button danger loading={busy} onClick={() => set(true)}>{t('confirm.disableMachine.ok')}</Button>}
      </div>
    </Card>
  );
}

export default function SettingsTab({ tid, mid, machine }) {
  const manage = useCan()('machines:manage');
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const { dirty, onValuesChange, reset } = useFormDirty(form);
  const [loaded, setLoaded] = useState(machine);
  const invalidate = [machineKey(tid, mid), ['machines', tid], ['config', tid, mid], ['fleet']];
  const saver = useVersionedSave({
    form, initial: valuesOf(loaded), version: machine.menu_version,
    fields: FIELDS.map((k) => ({ name: k, label: t(`settings.${k}`) })),
    fetchCurrent: () => api('GET', machinePath(tid, mid)).then((r) => r.machine),
    valuesOf, versionOf: (m) => m.menu_version,
    save: (values, version) => api('PATCH', machinePath(tid, mid), { body: settingsBody(values), ifMatch: version }).then((r) => r.machine),
    invalidate,
    success: t('settings.saved', { name: machineName(machine) }),
    onSaved: (m) => { setLoaded(m); reset(valuesOf(m)); },
    onDiscard: (m) => { setLoaded(m); reset(valuesOf(m)); },
  });
  const refresh = () => Promise.all(invalidate.map((queryKey) => queryClient.invalidateQueries({ queryKey })));

  return (
    <div className={styles.layout}>
      <Form form={form} layout="vertical" initialValues={valuesOf(machine)} onValuesChange={onValuesChange}
        onFinish={() => saver.submit(form.getFieldsValue(true))} disabled={!manage} className={styles.form} requiredMark={false}>
        <FormError problem={saver.problem} form={form} />
        <Form.Item name="name" label={t('settings.name')} rules={[{ required: true, whitespace: true, message: t('register.name.required') }, { max: 80 }]}>
          <Input maxLength={80} />
        </Form.Item>
        <Form.Item name="location_label" label={t('settings.location_label')} extra={t('settings.location_label.help')} rules={[{ max: 60 }]}>
          <Input maxLength={60} />
        </Form.Item>
        <Form.Item name="site" label={t('settings.site')} rules={[{ max: 80 }]}>
          <Input maxLength={80} />
        </Form.Item>
        <Form.Item name="support_phone" label={t('settings.support_phone')} extra={t('settings.support_phone.help')} rules={[{ max: 30 }]}>
          <Input maxLength={30} inputMode="tel" />
        </Form.Item>
        <Form.Item name="idle_video_url" label={t('settings.idle_video_url')} extra={t('settings.idle_video_url.help')}
          rules={[{ type: 'url', message: t('settings.https') }, { pattern: /^https:\/\//, message: t('settings.https') }]}>
          <Input placeholder={t('settings.urlPlaceholder')} />
        </Form.Item>
        {manage && <UnsavedBar dirty={dirty} saving={saver.saving} onSave={() => form.submit()}
          onDiscard={() => { reset(valuesOf(loaded)); saver.clearProblem(); }} />}
      </Form>
      {manage && <DangerZone tid={tid} mid={mid} machine={machine} onChanged={refresh} />}
    </div>
  );
}
