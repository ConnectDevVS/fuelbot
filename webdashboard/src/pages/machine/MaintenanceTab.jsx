// The Maintenance tab (dashboard plan §5.6.8; SRV-47; platform only: maintenance:read, edits with
// maintenance:write). The flag with who switched it and when, the kiosk's message and the faults it
// shows; switching on asks first (DP §4.9), off doesn't. PUT …/maintenance has no If-Match (a
// switch, and urgent). Separately, the machine-reported faults, which clear by themselves. It reaches
// the machine within one config poll: about 2 minutes.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, Form, Input } from 'antd';
import { CloseOutlined, PlusOutlined } from '@ant-design/icons';
import { api } from '../../api/client.js';
import { useCan, useDisplayTz } from '../../auth/session.js';
import { useConfirm, useToast } from '../../ui/dialogs.js';
import { FormError } from '../../ui/forms/FormError.jsx';
import { RestartNote } from '../../ui/forms/RestartNote.jsx';
import { applyServerError } from '../../ui/forms/applyServerError.js';
import { machineName } from '../../lib/names.js';
import { formatClock, formatDateTime } from '../../lib/time.js';
import { machineKey, machinePath } from './machineQuery.js';
import { t } from '../../strings.js';
import styles from './maintenance.module.css';

const MAX_FAULTS = 10;

export default function MaintenanceTab({ tid, mid, machine }) {
  const can = useCan();
  const write = can('maintenance:write');
  const tz = useDisplayTz();
  const confirm = useConfirm();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const m = machine.maintenance ?? { enabled: false, message: '', faults: [] };
  const name = machineName(machine);

  const put = async (enabled, toastKey) => {
    const v = form.getFieldsValue(true);
    const faults = (v.faults ?? []).map((f) => ({ code: (f?.code ?? '').trim(), description: (f?.description ?? '').trim() }))
      .filter((f) => f.code);
    setBusy(true);
    setProblem(null);
    try {
      await api('PUT', `${machinePath(tid, mid)}/maintenance`, { body: { enabled, message: (v.message ?? '').trim(), faults } });
      await Promise.all([machineKey(tid, mid), ['fleet'], ['config', tid, mid], ['machines', tid]]
        .map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      toast.success(t(toastKey, { name }));
    } catch (err) {
      setProblem(applyServerError(err, form));
    } finally {
      setBusy(false);
    }
  };
  const switchOn = async () => {
    try {
      await form.validateFields();
    } catch {
      return;
    }
    if (await confirm('maintenanceOn', { name })) await put(true, 'maint.onToast');
  };

  return (
    <div className={styles.layout}>
      <Card className={styles.card} role="region" aria-label={t('maint.state')}>
        <div className={styles.stateRow}>
          <span className={m.enabled ? styles.on : styles.off}>{t(m.enabled ? 'maint.on' : 'maint.off')}</span>
          {m.enabled && m.flagged_by && (
            <span className={styles.muted}>{t('maint.flagged', { who: m.flagged_by, time: m.flagged_at ? formatDateTime(m.flagged_at, tz) : '—' })}</span>
          )}
        </div>
        <Form form={form} layout="vertical" requiredMark={false} disabled={!write}
          initialValues={{ message: m.message ?? '', faults: (m.faults ?? []).map((f) => ({ code: f.code ?? '', description: f.description ?? '' })) }}>
          <FormError problem={problem} form={form} />
          <Form.Item name="message" label={t('maint.message')} extra={t('maint.message.help')} rules={[{ max: 300 }]}>
            <Input.TextArea rows={3} maxLength={300} />
          </Form.Item>
          <div className="overline">{t('maint.faults')}</div>
          <Form.List name="faults">
            {(fields, { add, remove }) => (
              <div className={styles.faults}>
                {fields.map((field, i) => (
                  <div key={field.key} className={styles.faultRow}>
                    <Form.Item name={[field.name, 'code']} rules={[{ required: true, message: t('maint.fault.code') }, { max: 20 }]}>
                      <Input placeholder={t('maint.fault.code')} aria-label={t('maint.fault.codeOf', { n: i + 1 })} maxLength={20} className="mono" />
                    </Form.Item>
                    <Form.Item name={[field.name, 'description']} rules={[{ max: 200 }]}>
                      <Input placeholder={t('maint.fault.description')} aria-label={t('maint.fault.descriptionOf', { n: i + 1 })} maxLength={200} />
                    </Form.Item>
                    {write && <Button type="text" icon={<CloseOutlined />} aria-label={t('maint.fault.remove', { n: i + 1 })} onClick={() => remove(field.name)} />}
                  </div>
                ))}
                {write && fields.length < MAX_FAULTS && (
                  <Button icon={<PlusOutlined />} onClick={() => add({ code: '', description: '' })} className={styles.add}>{t('maint.fault.add')}</Button>
                )}
              </div>
            )}
          </Form.List>
        </Form>
        {write && (
          <div className={styles.actions}>
            <RestartNote variant="maintenance" />
            <span className={styles.buttons}>
              {m.enabled ? (
                <>
                  <Button loading={busy} onClick={() => put(true, 'maint.updated')}>{t('maint.update')}</Button>
                  <Button type="primary" loading={busy} onClick={() => put(false, 'maint.offToast')}>{t('maint.switchOff')}</Button>
                </>
              ) : <Button danger type="primary" loading={busy} onClick={switchOn}>{t('maint.switchOn')}</Button>}
            </span>
          </div>
        )}
      </Card>

      <Card className={styles.card} role="region" aria-label={t('maint.reported')}>
        <h2 className={styles.title}>{t('maint.reported')}</h2>
        {(machine.faults ?? []).length === 0 ? <p className={styles.muted}>{t('maint.reportedNone')}</p> : (
          <ul className={styles.reported}>
            {machine.faults.map((f) => (
              <li key={f.code}>{t('status.fault_since', { code: f.code, time: f.since ? formatClock(f.since, tz) : '—' })}</li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
