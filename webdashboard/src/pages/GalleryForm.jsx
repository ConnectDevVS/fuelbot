// The gallery's form section (SRV-35): the write patterns against an in-page stub "server" (no
// requests): pick what the next save answers (OK, 400, 409, 422) and watch the form react.
import { useRef, useState } from 'react';
import { Card, Form, Input, InputNumber, Radio, Select } from 'antd';
import { ApiError } from '../api/client.js';
import { useCan } from '../auth/session.js';
import { useVersionedSave } from '../ui/forms/useVersionedSave.jsx';
import { useFormDirty } from '../ui/forms/useFormDirty.js';
import { FormError } from '../ui/forms/FormError.jsx';
import { PriceField, priceRules } from '../ui/forms/PriceField.jsx';
import { InvalidConfigPanel } from '../ui/forms/InvalidConfigPanel.jsx';
import { UnsavedBar } from '../ui/forms/UnsavedBar.jsx';
import styles from './gallery.module.css';

const START = { name: 'Prymor Guava', description: 'Guava, whey isolate', actual_price: 90, offer_price: 75, portion_g: 32.5,
  ingredients: ['whey isolate', 'guava'], nutrition: { kcal: 120 } };
const valuesOf = ({ rev: _rev, ...values }) => values;
const MACHINES = [{ id: 'DEV00001', name: 'Bay 02' }, { id: 'E2E00002', name: 'Bay 3' }];
const FIELDS = [
  { name: 'name', label: 'Name' }, { name: 'description', label: 'Description' },
  { name: 'actual_price', label: 'Price' }, { name: 'offer_price', label: 'Offer' },
  { name: 'portion_g', label: 'Portion (g)' }, { name: 'ingredients', label: 'Ingredients' },
  { name: ['nutrition', 'kcal'], label: 'kcal' },
];

export function GalleryForm() {
  const [form] = Form.useForm();
  const canPrice = useCan()('price:write');
  // The stub server's record: a ref (the save and fetch closures must see the latest), mirrored to
  // state for display.
  const serverRef = useRef({ ...START, rev: 3 });
  const [serverRev, setServerRev] = useState(3);
  const setServer = (record) => { serverRef.current = record; setServerRev(record.rev); };
  const conflicted = useRef(false);   // "409" answers once: the re-save after Keep mine goes through
  const [loaded, setLoaded] = useState({ ...START, rev: 3 });
  const [next, setNext] = useState('ok');
  const { dirty, onValuesChange, reset } = useFormDirty(form);

  const saver = useVersionedSave({
    form, initial: valuesOf(loaded), version: loaded.rev, fields: FIELDS,
    fetchCurrent: async () => serverRef.current, valuesOf, versionOf: (r) => r.rev,
    success: 'Product saved. Reaches Bay 02 and Bay 3 at their next restart',
    save: async (values, version) => {
      const server = serverRef.current;
      if (next === '400') {
        throw new ApiError(400, 'invalid_body', [
          { field: 'colour', error: 'unknown field' },
          { field: 'name', error: 'a non-empty string ≤ 80' },
          { field: 'actual_price', error: 'whole rupees > 0' },
        ]);
      }
      if (next === '422') {
        throw new ApiError(422, 'invalid_config', [
          { machine_id: 'DEV00001', errors: ['chocolate: hopper 1 already used by guava'] },
          { machine_id: 'E2E00002', errors: ['chocolate: hopper 1 already used by guava'] },
        ]);
      }
      if (next === '409' && !conflicted.current) {
        conflicted.current = true;
        // A colleague saved first: the server moves on, this save is stale.
        setServer({ ...server, name: 'Guava (their edit)', rev: server.rev + 1 });
        throw new ApiError(409, 'version_conflict', { current: server.rev + 1 });
      }
      if (version !== server.rev) throw new ApiError(409, 'version_conflict', { current: server.rev });
      const saved = { ...values, rev: version + 1 };
      setServer(saved);
      return saved;
    },
    onSaved: (saved) => { setLoaded(saved); reset(valuesOf(saved)); setNext('ok'); },
    onDiscard: (current) => { setLoaded(current); reset(valuesOf(current)); },
  });

  return (
    <Card size="small" className={styles.formCard}>
      <div className={styles.row}>
        <span className="overline">Next save answers</span>
        <Radio.Group optionType="button" value={next} onChange={(e) => { conflicted.current = false; setNext(e.target.value); }}
          options={[{ value: 'ok', label: 'OK' }, { value: '400', label: '400' }, { value: '409', label: '409' }, { value: '422', label: '422' }]} />
        <span className="overline">Saved version {serverRev}</span>
      </div>
      <Form form={form} layout="vertical" initialValues={START} onValuesChange={onValuesChange} onFinish={saver.submit}
        requiredMark={false} className={styles.form}>
        <FormError problem={saver.problem} form={form} labels={{ name: 'Name', actual_price: 'Price' }} />
        <InvalidConfigPanel error={saver.configError} machines={MACHINES} />
        <Form.Item name="name" label="Name"><Input /></Form.Item>
        <Form.Item name="description" label="Description"><Input.TextArea rows={3} /></Form.Item>
        <div className={styles.row}>
          <Form.Item name="actual_price" label="Price" rules={priceRules({ required: true })}><PriceField editable={canPrice} /></Form.Item>
          <Form.Item name="offer_price" label="Offer (locked view)" rules={priceRules()}><PriceField editable={false} /></Form.Item>
          <Form.Item name="portion_g" label="Portion (g)">
            <InputNumber min={0.1} max={500} step={0.5} inputMode="decimal" />
          </Form.Item>
          <Form.Item name={['nutrition', 'kcal']} label="kcal"><InputNumber min={0} precision={0} inputMode="numeric" /></Form.Item>
        </div>
        <Form.Item name="ingredients" label="Ingredients"><Select mode="tags" open={false} suffixIcon={null} /></Form.Item>
      </Form>
      <UnsavedBar dirty={dirty} saving={saver.saving} onDiscard={() => { reset(valuesOf(loaded)); saver.clearProblem(); }}
        onSave={() => form.submit()} />
    </Card>
  );
}
