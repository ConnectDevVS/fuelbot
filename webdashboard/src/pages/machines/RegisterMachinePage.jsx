// Register a machine (dashboard plan §5.5; SRV-42; mock-up design/provisioning-desktop.png), in three
// steps: 1 details (the server generates the id), 2 menu (copy another machine's, build it after,
// or later), 3 key (issued once, shown on the provisioning card). The key is held in this page's
// state only and dropped on Done or when the page goes away.
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Form, Input, Radio, Select, Steps } from 'antd';
import { api } from '../../api/client.js';
import { messageFor } from '../../api/errors.js';
import { useCan } from '../../auth/session.js';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { FormError } from '../../ui/forms/FormError.jsx';
import { applyServerError } from '../../ui/forms/applyServerError.js';
import { useToast } from '../../ui/dialogs.js';
import { issueKey } from '../../lib/issueKey.js';
import { machineName, useMachines } from '../../lib/names.js';
import { useLayoutSize } from '../../lib/useMedia.js';
import { ProvisioningCard } from './ProvisioningCard.jsx';
import { t } from '../../strings.js';
import styles from './machines.module.css';

const machinesPath = (tid) => `/tenants/${encodeURIComponent(tid)}/machines`;

function DetailsStep({ tid, onCreated }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState(null);
  const submit = async (values) => {
    setSaving(true);
    setProblem(null);
    const body = { name: values.name.trim() };
    for (const k of ['location_label', 'site']) if (values[k]?.trim()) body[k] = values[k].trim();
    try {
      onCreated((await api('POST', machinesPath(tid), { body })).machine);
    } catch (err) {
      setProblem(applyServerError(err, form));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Form form={form} layout="vertical" onFinish={submit} className={styles.form} requiredMark={false}>
      <FormError problem={problem} form={form} />
      <Form.Item name="name" label={t('register.name')} extra={t('register.name.help')}
        rules={[{ required: true, whitespace: true, message: t('register.name.required') }, { max: 80 }]}>
        <Input maxLength={80} autoFocus />
      </Form.Item>
      <Form.Item name="location_label" label={t('register.location')} extra={t('register.location.help')} rules={[{ max: 60 }]}>
        <Input maxLength={60} />
      </Form.Item>
      <Form.Item name="site" label={t('register.site')} rules={[{ max: 80 }]}>
        <Input maxLength={80} />
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={saving}>{t('register.create')}</Button>
    </Form>
  );
}

/** onDone({kind: 'copied'|'build'|'later', from?}) */
function MenuStep({ tid, machine, onDone }) {
  const machines = useMachines(tid);
  const sources = (machines.data ?? []).filter((m) => m.configured && m.id !== machine.id);
  const [choice, setChoice] = useState(null);
  const [source, setSource] = useState(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState(null);
  const next = async () => {
    if (choice !== 'copy') return onDone({ kind: choice });
    setSaving(true);
    setProblem(null);
    try {
      // A new machine's menu_version is 0.
      await api('POST', `${machinesPath(tid)}/${encodeURIComponent(machine.id)}/menu/copy-from/${encodeURIComponent(source)}`,
        { ifMatch: machine.menu_version ?? 0 });
      onDone({ kind: 'copied', from: machineName(sources.find((m) => m.id === source)) });
    } catch (err) {
      setProblem({ message: messageFor(err) });
    } finally {
      setSaving(false);
    }
    return undefined;
  };
  return (
    <div className={styles.step}>
      <p className={styles.lead}>{t('register.menu.lead', { name: machineName(machine) })}</p>
      {problem && <Alert type="error" showIcon title={problem.message} className={styles.lead} />}
      <Radio.Group value={choice} onChange={(e) => setChoice(e.target.value)} className={styles.choices}>
        <Radio value="copy" disabled={sources.length === 0}>{t('register.menu.copy')}</Radio>
        {choice === 'copy' && (
          <Select aria-label={t('register.menu.copySource')} placeholder={t('register.menu.copySource')} value={source}
            onChange={setSource} className={styles.search}
            options={sources.map((m) => ({ value: m.id, label: `${machineName(m)} · ${m.id}` }))} />
        )}
        {sources.length === 0 && !machines.isPending && <span className={styles.note}>{t('register.menu.copyNone')}</span>}
        <Radio value="build">{t('register.menu.build')}</Radio>
        <Radio value="later">{t('register.menu.later')}</Radio>
      </Radio.Group>
      {choice === 'later' && <p className={styles.note}>{t('register.menu.laterNote')}</p>}
      <div className={styles.actions}>
        <Button type="primary" onClick={next} loading={saving} disabled={!choice || (choice === 'copy' && !source)}>
          {t('register.menu.next')}
        </Button>
      </div>
    </div>
  );
}

function KeyStep({ tid, machine, onIssued }) {
  const [label, setLabel] = useState(machine.name ?? '');
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState(null);
  const issue = async () => {
    setSaving(true);
    setProblem(null);
    try {
      onIssued(await issueKey(tid, machine.id, label.trim()));
    } catch (err) {
      setProblem({ message: messageFor(err) });
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className={styles.form}>
      <p className={styles.lead}>{t('register.key.lead')}</p>
      {problem && <Alert type="error" showIcon title={problem.message} className={styles.lead} />}
      <Form layout="vertical" onFinish={issue}>
        <Form.Item label={t('register.key.label')} htmlFor="register-key-label">
          <Input id="register-key-label" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={saving}>{t('register.key.issue')}</Button>
      </Form>
    </div>
  );
}

export default function RegisterMachinePage() {
  const { tid } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const canKeys = useCan()('keys:manage');
  const phone = useLayoutSize() === 'phone';
  const [machine, setMachine] = useState(null);
  const [menu, setMenu] = useState(null);       // {kind, from?}
  const [issued, setIssued] = useState(null);   // {key, machine_key}: this page's state only
  const step = !machine ? 0 : !menu ? 1 : 2;
  const machineHref = machine ? `/t/${encodeURIComponent(tid)}/machines/${encodeURIComponent(machine.id)}` : null;

  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: ['fleet'] }),
    queryClient.invalidateQueries({ queryKey: ['machines', tid] })]);
  const finish = () => {
    setIssued(null);
    navigate(menu?.kind === 'build' ? `${machineHref}/menu` : machineHref);
  };
  const menuNote = menu && t(menu.kind === 'copied' ? 'register.menu.copied' : menu.kind === 'build' ? 'register.menu.building' : 'register.menu.skipped',
    { name: menu.from });

  return (
    <section>
      <div className="no-print">
        <PageHeader overline={t('register.overline')} title={machine ? machineName(machine) : t('page.machineNew')} />
        <Steps className={styles.steps} current={step} size={phone ? 'small' : undefined} items={[
          { title: t('register.step.details'), description: machine?.id },
          { title: t('register.step.menu'), description: menuNote },
          { title: t('register.step.key') },
        ]} />
      </div>
      {step === 0 && <DetailsStep tid={tid} onCreated={(m) => { setMachine(m); refresh(); toast.success(t('register.created', { id: m.id })); }} />}
      {step === 1 && <MenuStep tid={tid} machine={machine} onDone={(result) => { setMenu(result); refresh(); }} />}
      {step === 2 && !canKeys && <Alert type="info" showIcon title={t('register.notAllowedKeys')} />}
      {step === 2 && canKeys && !issued && <KeyStep tid={tid} machine={machine} onIssued={setIssued} />}
      {step === 2 && issued && (
        <ProvisioningCard tenantId={machine.tenant_id} machineId={machine.id} keyValue={issued.key} onDone={finish} />
      )}
    </section>
  );
}
