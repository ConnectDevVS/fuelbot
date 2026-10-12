// The Bases tab (dashboard plan §5.6.6; SRV-44): the liquids the machine mixes with, each an id
// (slug), a name, the bridge's base code (B<digit>) and on/off; at most 6. PUT …/bases with
// If-Match: menu_version. Checked here before sending (at least one on, ids unique: the server's
// rules too); a bad code is the server's field error on its row. Read-only without machines:manage.
// On a phone each base takes two lines and its fields carry their own labels (no header row).
import { useState } from 'react';
import { Button, Form, Input, Switch } from 'antd';
import { CloseOutlined, PlusOutlined } from '@ant-design/icons';
import { api } from '../../api/client.js';
import { useCan } from '../../auth/session.js';
import { useVersionedSave } from '../../ui/forms/useVersionedSave.jsx';
import { useFormDirty } from '../../ui/forms/useFormDirty.js';
import { FormError } from '../../ui/forms/FormError.jsx';
import { UnsavedBar } from '../../ui/forms/UnsavedBar.jsx';
import { machineName } from '../../lib/names.js';
import { useLayoutSize } from '../../lib/useMedia.js';
import { machineKey, machinePath } from './machineQuery.js';
import { t } from '../../strings.js';
import styles from './settings.module.css';

export const MAX_BASES = 6;
const valuesOf = (m) => ({ bases: (m.bases ?? []).map((b) => ({ id: b.id, name: b.name, code: b.code, enabled: Boolean(b.enabled) })) });
const summary = (bases) => (Array.isArray(bases) ? bases.map((b) => `${b.id} ${b.code}${b.enabled ? '' : ' (off)'}`).join(', ') : '—');

/** The client checks (the server's rules): at least one enabled; ids unique. → an error text or null. */
export function basesProblem(bases = []) {
  if (!bases.some((b) => b?.enabled)) return t('bases.oneEnabled');
  const ids = bases.map((b) => (b?.id ?? '').trim()).filter(Boolean);
  if (new Set(ids).size !== ids.length) return t('bases.unique');
  return null;
}

/** The summary's names for row fields: 'bases.1.code' → 'Code · Milk'. */
function rowLabels(bases = []) {
  return Object.fromEntries((bases ?? []).flatMap((b, i) => ['id', 'name', 'code', 'enabled'].map((k) => [
    `bases.${i}.${k}`, `${t(`bases.col.${k === 'enabled' ? 'on' : k}`)} · ${b?.name || b?.id || t('bases.new')}`])));
}

export default function BasesTab({ tid, mid, machine }) {
  const manage = useCan()('machines:manage');
  const phone = useLayoutSize() === 'phone';
  const fieldLabel = (k) => (phone ? t(`bases.col.${k}`) : undefined);
  const [form] = Form.useForm();
  const { dirty, onValuesChange, reset } = useFormDirty(form);
  const [loaded, setLoaded] = useState(machine);
  const saver = useVersionedSave({
    form, initial: valuesOf(loaded), version: machine.menu_version,
    fields: [{ name: 'bases', label: t('machine.tab.bases'), format: summary }],
    fetchCurrent: () => api('GET', machinePath(tid, mid)).then((r) => r.machine),
    valuesOf, versionOf: (m) => m.menu_version,
    save: (values, version) => api('PUT', `${machinePath(tid, mid)}/bases`, {
      body: { bases: values.bases.map((b) => ({ id: b.id?.trim(), name: b.name?.trim(), code: b.code?.trim().toUpperCase(), enabled: Boolean(b.enabled) })) },
      ifMatch: version }).then((r) => r.machine),
    invalidate: [machineKey(tid, mid), ['config', tid, mid]],
    success: t('bases.saved', { name: machineName(machine) }),
    onSaved: (m) => { setLoaded(m); reset(valuesOf(m)); },
    onDiscard: (m) => { setLoaded(m); reset(valuesOf(m)); },
  });

  return (
    <Form form={form} initialValues={valuesOf(machine)} onValuesChange={onValuesChange} disabled={!manage} layout={phone ? 'vertical' : undefined}
      onFinish={() => saver.submit(form.getFieldsValue(true))} className={styles.basesForm}>
      <p className={styles.lead}>{t('bases.lead')}</p>
      <FormError problem={saver.problem} form={form} labels={rowLabels(form.getFieldValue('bases'))} />
      <Form.List name="bases" rules={[{ validator: async (_, bases) => { const p = basesProblem(bases); if (p) throw new Error(p); } }]}>
        {(fields, { add, remove }, { errors }) => (
          <div className={styles.bases} role="list" aria-label={t('machine.tab.bases')}>
            <div className={`${styles.baseRow} ${styles.baseHead}`} aria-hidden="true">
              {['id', 'name', 'code', 'on'].map((c) => <span key={c} className="overline">{t(`bases.col.${c}`)}</span>)}
              <span />
            </div>
            {fields.map((field) => {
              const label = form.getFieldValue(['bases', field.name, 'name']) || form.getFieldValue(['bases', field.name, 'id']) || t('bases.new');
              return (
                <div key={field.key} className={styles.baseRow} role="listitem" aria-label={label}>
                  <Form.Item name={[field.name, 'id']} label={fieldLabel('id')} className={styles.baseId} rules={[{ required: true, message: t('bases.idRequired') },
                    { pattern: /^[a-z0-9][a-z0-9_-]*$/, message: t('bases.idRule') }]}>
                    <Input aria-label={t('bases.idOf', { name: label })} maxLength={40} />
                  </Form.Item>
                  <Form.Item name={[field.name, 'name']} label={fieldLabel('name')} className={styles.baseName} rules={[{ required: true, whitespace: true, message: t('bases.nameRequired') }, { max: 40 }]}>
                    <Input aria-label={t('bases.nameOf', { name: label })} maxLength={40} />
                  </Form.Item>
                  <Form.Item name={[field.name, 'code']} label={fieldLabel('code')} className={styles.baseCode} extra={t('bases.codeHelp')}>
                    <Input aria-label={t('bases.codeOf', { name: label })} maxLength={2} className={styles.code} />
                  </Form.Item>
                  <Form.Item name={[field.name, 'enabled']} label={fieldLabel('on')} className={styles.baseOn} valuePropName="checked">
                    <Switch aria-label={t('bases.enabledOf', { name: label })} />
                  </Form.Item>
                  <div className={styles.baseRemove}>
                    {manage && <Button type="text" icon={<CloseOutlined />} aria-label={t('bases.remove', { name: label })}
                      onClick={() => { remove(field.name); onValuesChange(); }} />}
                  </div>
                </div>
              );
            })}
            <Form.ErrorList errors={errors} />
            {manage && (
              <Button icon={<PlusOutlined />} disabled={fields.length >= MAX_BASES} className={styles.addBase}
                onClick={() => { add({ id: '', name: '', code: '', enabled: true }); onValuesChange(); }}>{t('bases.add')}</Button>
            )}
          </div>
        )}
      </Form.List>
      {manage && <UnsavedBar dirty={dirty} saving={saver.saving} onSave={() => form.submit()}
        onDiscard={() => { reset(valuesOf(loaded)); saver.clearProblem(); }} />}
    </Form>
  );
}
