// A product in the drawer (dashboard plan §5.11; SRV-45): view, edit (?p=<id>) or create (?new=1).
// Rights by permission: text with products:edit (never a limited operator: products are shared by
// every machine), prices with price:write, the portion size with stock:write, create with
// products:create. Saves with If-Match: rev (useVersionedSave): 409 → the Conflict dialog, 422 →
// each affected machine's errors, forbidden_field → the fields marked. Archive / Unarchive too.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Form, Input, InputNumber, Select } from 'antd';
import { api } from '../../api/client.js';
import { messageFor } from '../../api/errors.js';
import { useCan } from '../../auth/session.js';
import { Sheet } from '../../ui/Sheet.jsx';
import { ErrorPanel, PageSkeleton } from '../../ui/States.jsx';
import { useToast } from '../../ui/dialogs.js';
import { useVersionedSave } from '../../ui/forms/useVersionedSave.jsx';
import { useFormDirty } from '../../ui/forms/useFormDirty.js';
import { FormError } from '../../ui/forms/FormError.jsx';
import { InvalidConfigPanel } from '../../ui/forms/InvalidConfigPanel.jsx';
import { PriceField, priceRules } from '../../ui/forms/PriceField.jsx';
import { applyServerError } from '../../ui/forms/applyServerError.js';
import { RestartNote } from '../../ui/forms/RestartNote.jsx';
import { useLeaveGuard } from '../../ui/forms/UnsavedBar.jsx';
import { useMachines } from '../../lib/names.js';
import { bundledName, NUTRITION, toBody, toForm } from './productForm.js';
import { t } from '../../strings.js';
import styles from './products.module.css';

const productsPath = (tid) => `/tenants/${encodeURIComponent(tid)}/products`;
export const productKey = (tid, pid) => ['products', tid, 'one', pid];
const CONFLICT_FIELDS = ['name', 'description', 'volume_ml', 'image', 'actual_price', 'offer_price', 'portion_g']
  .map((k) => ({ name: k, label: t(k === 'volume_ml' ? 'products.volume' : k === 'actual_price' ? 'products.actual'
    : k === 'offer_price' ? 'products.offer' : k === 'portion_g' ? 'products.portion' : `products.${k}`) }))
  .concat([{ name: 'ingredients', label: t('products.ingredients') }, { name: 'allergens', label: t('products.allergens') }]);

function ImageBlock({ product, canEdit }) {
  const [broken, setBroken] = useState(false);
  const file = bundledName(product?.image);
  return (
    <div className={styles.image}>
      {product?.image_url && !broken
        ? <img src={product.image_url} alt={t('products.image.alt', { name: product.name })} className={styles.preview} onError={() => setBroken(true)} />
        : <span className={styles.previewPlaceholder} aria-hidden="true">IMG</span>}
      <div className={styles.imageText}>
        {!product?.image_url && <p>{file ? t('products.image.bundled', { file }) : t('products.image.none')}</p>}
        <Form.Item name="image" label={t('products.image.path')} extra={t('products.image.path.help')}
          rules={[{ validator: (_, v) => (!v || String(v).startsWith('res://') ? Promise.resolve() : Promise.reject(new Error(t('products.image.path.help')))) }]}>
          <Input disabled={!canEdit} placeholder={t('products.image.placeholder')} />
        </Form.Item>
        <p className={styles.muted}>{t('products.image.upload')}</p>
      </div>
    </div>
  );
}

/** The fields; `create` adds the id. */
function Fields({ create, canEdit, canPrice, canStock }) {
  const tags = (name, label, help) => (
    <Form.Item name={name} label={label} extra={help}
      rules={[{ type: 'array', max: 50 }, { validator: (_, v) => ((v ?? []).every((s) => String(s).length <= 200) ? Promise.resolve() : Promise.reject(new Error('≤ 200'))) }]}>
      <Select mode="tags" open={false} disabled={!canEdit} placeholder={t('products.tags')} tokenSeparators={[',']} aria-label={label} />
    </Form.Item>
  );
  return (
    <>
      {create && (
        <Form.Item name="product_id" label={t('products.id')} extra={t('products.id.help')}
          rules={[{ required: true, message: t('products.idRequired') }, { pattern: /^[a-z0-9][a-z0-9_-]{0,39}$/, message: t('products.id.help') }]}>
          <Input maxLength={40} className="mono" />
        </Form.Item>
      )}
      <Form.Item name="name" label={t('products.name')} rules={[{ required: true, whitespace: true, message: t('products.nameRequired') }, { max: 80 }]}>
        <Input maxLength={80} disabled={!canEdit} />
      </Form.Item>
      <Form.Item name="description" label={t('products.description')} rules={[{ max: 500 }]}>
        <Input.TextArea rows={3} maxLength={500} disabled={!canEdit} />
      </Form.Item>
      <div className={styles.numbers}>
        <Form.Item name="volume_ml" label={t('products.volume')}>
          <InputNumber min={0} max={5000} precision={0} disabled={!canEdit} className={styles.full} />
        </Form.Item>
        {NUTRITION.map((k) => (
          <Form.Item key={k} name={['nutrition', k]} label={t(`products.${k}`)}>
            <InputNumber min={0} disabled={!canEdit} className={styles.full} />
          </Form.Item>
        ))}
      </div>
      {tags('ingredients', t('products.ingredients'))}
      {tags('allergens', t('products.allergens'), t('products.allergens.help'))}
      <div className={styles.prices} role="group" aria-label={t('products.prices')}>
        <div className={`overline ${styles.pricesTitle}`}>{t('products.prices')}</div>
        <Form.Item name="actual_price" label={t('products.actual')} rules={priceRules({ required: true })}>
          <PriceField editable={canPrice} aria-label={t('products.actual')} />
        </Form.Item>
        <Form.Item name="offer_price" label={t('products.offer')} extra={t('products.offer.help')} rules={priceRules()}>
          <PriceField editable={canPrice} aria-label={t('products.offer')} />
        </Form.Item>
      </div>
      <Form.Item name="portion_g" label={t('products.portion')}
        extra={canStock ? t('products.portion.help') : `${t('products.portion.help')} ${t('products.portion.locked')}`}>
        <InputNumber min={0.1} max={500} step={0.5} disabled={!canStock} className={styles.portion} />
      </Form.Item>
    </>
  );
}

/** tid; pid: the product (edit/view) or null (create); onClose(). */
export function ProductDrawer({ tid, pid, onClose }) {
  const can = useCan();
  const create = !pid;
  const canEdit = create ? can('products:create') : can('products:edit');
  const canPrice = canEdit && can('price:write');
  const canStock = canEdit && can('stock:write');
  const queryClient = useQueryClient();
  const toast = useToast();
  const machines = useMachines(tid);
  const machineNames = new Map((machines.data ?? []).map((m) => [m.id, m.name || m.id]));
  const query = useQuery({
    queryKey: productKey(tid, pid),
    queryFn: ({ signal }) => api('GET', `${productsPath(tid)}/${encodeURIComponent(pid)}`, { signal }).then((r) => r.product),
    enabled: !create,
    staleTime: 0,   // a fresh rev every time the drawer opens
  });
  const product = query.data;
  const [form] = Form.useForm();
  const { dirty, onValuesChange, reset } = useFormDirty(form);
  useLeaveGuard(dirty);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const invalidate = [['products', tid], ['config'], ['machines', tid]];
  const refresh = () => Promise.all(invalidate.map((queryKey) => queryClient.invalidateQueries({ queryKey })));

  const saver = useVersionedSave({
    form, initial: toForm(product), version: product?.rev ?? 0, fields: CONFLICT_FIELDS,
    fetchCurrent: () => api('GET', `${productsPath(tid)}/${encodeURIComponent(pid)}`).then((r) => r.product),
    valuesOf: toForm, versionOf: (p) => p.rev,
    save: (values, version) => api('PATCH', `${productsPath(tid)}/${encodeURIComponent(pid)}`, { body: toBody(values), ifMatch: version })
      .then((r) => r.product),
    invalidate, success: t('products.saved'),
    onSaved: (p) => { queryClient.setQueryData(productKey(tid, pid), p); reset(toForm(p)); },
    onDiscard: (p) => reset(toForm(p)),
  });

  const createProduct = async (values) => {
    setBusy(true);
    setProblem(null);
    try {
      const { product: made } = await api('POST', productsPath(tid), { body: toBody(values, { create: true }) });
      reset(toForm(made));
      await refresh();
      toast.success(t('products.created', { name: made.name }));
      onClose(made.id);
    } catch (err) {
      setProblem(applyServerError(err, form));
    } finally {
      setBusy(false);
    }
  };

  const setArchived = async (archived) => {
    setBusy(true);
    setProblem(null);
    try {
      const { product: saved } = await api('PATCH', `${productsPath(tid)}/${encodeURIComponent(pid)}`, { body: { archived }, ifMatch: product.rev });
      queryClient.setQueryData(productKey(tid, pid), saved);
      await refresh();
      toast.success(t(archived ? 'products.archivedToast' : 'products.unarchivedToast', { name: saved.name }));
    } catch (err) {
      const names = (product.machines ?? []).map((id) => machineNames.get(id) ?? id).join(', ');
      setProblem({ message: err?.code === 'product_in_use' ? t('products.inUse', { names: names || '—' }) : messageFor(err), fields: [], unknown: [] });
    } finally {
      setBusy(false);
    }
  };

  // Closing keeps the page (only ?p goes), so the route guard doesn't see it: ask here.
  const { modal } = App.useApp();
  const close = () => {
    if (!dirty) return onClose();
    return modal.confirm({
      title: t('unsaved.leave.title'), content: t('unsaved.leave.body'), okText: t('unsaved.leave.ok'),
      okButtonProps: { danger: true }, cancelText: t('unsaved.leave.stay'), autoFocusButton: 'cancel', onOk: () => onClose(),
    });
  };

  const loading = !create && query.isPending;
  const title = create ? t('products.newTitle') : product ? `${product.name} · ${product.id}` : '';
  const onMenu = (product?.machines ?? []).map((id) => machineNames.get(id) ?? id);
  // Operators limited to machines can't edit shared products: say why (viewers just read).
  const sharedNote = !create && !canEdit && can('menu:edit');

  return (
    <Sheet open onClose={close} title={title} destroyOnHidden
      footer={canEdit && !loading && !query.error ? (
        <div className={styles.footer}>
          <RestartNote variant="shared" />
          <span className={styles.footerActions}>
            {!create && (
              <Button disabled={busy || dirty} onClick={() => setArchived(!product.archived)}>
                {t(product.archived ? 'products.unarchive' : 'products.archive')}
              </Button>
            )}
            <Button type="primary" loading={busy || saver.saving} disabled={!create && !dirty} onClick={() => form.submit()}>
              {t(create ? 'products.create' : 'products.save')}
            </Button>
          </span>
        </div>
      ) : null}>
      {loading && <PageSkeleton kind="plain" rows={10} />}
      {query.error && <ErrorPanel error={query.error} onRetry={query.refetch} />}
      {(create || product) && (
        <Form form={form} layout="vertical" requiredMark={false} initialValues={toForm(product)}
          onValuesChange={onValuesChange} disabled={!canEdit}
          onFinish={() => (create ? createProduct(form.getFieldsValue(true)) : saver.submit(form.getFieldsValue(true)))}>
          {sharedNote && <Alert type="info" showIcon title={t('products.shared')} className={styles.gap} />}
          <FormError problem={problem ?? saver.problem} form={form} />
          <InvalidConfigPanel error={saver.configError} machines={machines.data ?? []} />
          <Fields create={create} canEdit={canEdit} canPrice={canPrice} canStock={canStock} />
          <ImageBlock product={product} canEdit={canEdit} />
          {!create && (
            <div className={styles.onMachines}>
              <span className="overline">{t('products.onMachines')}</span>
              <span>{onMenu.length ? onMenu.join(', ') : t('products.onNone')}</span>
            </div>
          )}
        </Form>
      )}
    </Sheet>
  );
}
