// The Menu tab (dashboard plan §5.6.1; SRV-43; mock-up design/menu-desktop.png): the machine's drinks
// in kiosk order. menu:edit arranges them (drag or ↑/↓, add, remove, hopper, badge, sold out, on);
// price:write also overrides prices; viewers read only. One whole-menu Save (PUT …/menu with
// If-Match: menu_version, useVersionedSave): the Conflict dialog on 409, the machine's own
// verdict on 422 (InvalidConfigPanel, and each message on its product's row), "reaches the machine
// at its next restart". Client warnings (duplicate hopper, empty, hoppers 5–6) never block Save.
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Alert, Form } from 'antd';
import { api } from '../../api/client.js';
import { useCan } from '../../auth/session.js';
import { useVersionedSave } from '../../ui/forms/useVersionedSave.jsx';
import { useFormDirty } from '../../ui/forms/useFormDirty.js';
import { FormError } from '../../ui/forms/FormError.jsx';
import { InvalidConfigPanel } from '../../ui/forms/InvalidConfigPanel.jsx';
import { UnsavedBar } from '../../ui/forms/UnsavedBar.jsx';
import { EmptyState } from '../../ui/States.jsx';
import { machineName, useMachines, useProducts } from '../../lib/names.js';
import { MenuItemRow } from './MenuItemRow.jsx';
import { ProductPicker } from './ProductPicker.jsx';
import { CopyMenuDialog } from './CopyMenuDialog.jsx';
import { configErrorsByProduct, MAX_ITEMS, newRow, toPayload, toRows, warnings } from './menuModel.js';
import { machineKey, machinePath } from './machineQuery.js';
import { t, tn } from '../../strings.js';
import styles from './menu.module.css';

const valuesOf = (m) => ({ menu: toRows(m.menu) });
const summary = (menu) => (Array.isArray(menu) ? menu.map((r) => `${r.product_id}@${r.hopper}${r.enabled ? '' : ' (off)'}${r.sold_out ? ' (sold out)' : ''}`).join(', ') : '—');

export default function MenuTab({ tid, mid, machine }) {
  const can = useCan();
  const canEdit = can('menu:edit');
  const canPrice = can('price:write');
  const queryClient = useQueryClient();
  const products = useProducts(tid);
  const machines = useMachines(tid);
  const byId = useMemo(() => new Map((products.data ?? []).map((p) => [p.id, p])), [products.data]);
  const [form] = Form.useForm();
  const { dirty, onValuesChange, reset } = useFormDirty(form);
  const [loaded, setLoaded] = useState(machine);
  // product_id, override and low_portions have no Form.Item: only `preserve` (watching) and
  // getFieldsValue(true) (saving) see them; antd's own onFinish values would drop them.
  const rows = Form.useWatch('menu', { form, preserve: true }) ?? [];
  const name = machineName(machine);

  // The baseline for "unsaved": what the form was loaded with.
  useEffect(() => { reset(); }, [reset]);

  const invalidate = [machineKey(tid, mid), ['machines', tid], ['config', tid, mid], ['stock'], ['fleet'], ['products', tid]];
  const saver = useVersionedSave({
    form, initial: valuesOf(loaded), version: loaded.menu_version,
    fields: [{ name: 'menu', label: t('menu.field'), format: summary }],
    fetchCurrent: () => api('GET', machinePath(tid, mid)).then((r) => r.machine),
    valuesOf, versionOf: (m) => m.menu_version,
    save: (values, version) => api('PUT', `${machinePath(tid, mid)}/menu`, { body: { menu: toPayload(values.menu) }, ifMatch: version })
      .then((r) => r.machine),
    invalidate,
    success: t('menu.saved', { name }),
    onSaved: (m) => { setLoaded(m); reset(valuesOf(m)); },
    onDiscard: (m) => { setLoaded(m); reset(valuesOf(m)); },
  });

  const warn = warnings(rows);
  const rowErrors = configErrorsByProduct(saver.configError, mid);
  const productName = (id) => byId.get(id)?.name ?? id;
  const onMenu = new Set(rows.map((r) => r?.product_id));
  const available = (products.data ?? []).filter((p) => !p.archived && !onMenu.has(p.id));
  const sources = (machines.data ?? []).filter((m) => m.configured && m.id !== mid);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const copied = (m, from) => {
    setLoaded(m);
    reset(valuesOf(m));
    saver.clearProblem();
    return Promise.all(invalidate.map((queryKey) => queryClient.invalidateQueries({ queryKey })))
      .then(() => ({ from: machineName(from), to: name }));
  };

  return (
    <Form form={form} initialValues={valuesOf(machine)} onValuesChange={onValuesChange} onFinish={() => saver.submit(form.getFieldsValue(true))} disabled={!canEdit}>
      <Form.List name="menu">
        {(fields, { add, remove, move }) => {
          const changed = () => onValuesChange();
          const keys = fields.map((f) => f.key);
          return (
            <>
              <div className={styles.toolbar}>
                <span className={styles.muted}>
                  {canEdit ? tn('menu.intro', fields.length) : t('menu.intro.readonly', { n: fields.length })}
                </span>
                {canEdit && (
                  <span className={styles.toolbarActions}>
                    <CopyMenuDialog tid={tid} machine={loaded} sources={sources} onCopied={copied} />
                    <ProductPicker products={available} full={fields.length >= MAX_ITEMS}
                      onPick={(pid) => { add(newRow(pid, form.getFieldValue('menu') ?? [])); changed(); }} />
                  </span>
                )}
              </div>

              <FormError problem={saver.problem} form={form} />
              <InvalidConfigPanel error={saver.configError} machines={machines.data ?? []} />
              {warn.empty && fields.length === 0 && machine.menu.length > 0 && <Alert type="warning" showIcon title={t('menu.warn.empty')} className={styles.gap} />}
              {warn.wiring.length > 0 && <Alert type="info" showIcon title={t('menu.warn.wiring')} className={styles.gap} />}

              {fields.length === 0 ? (
                <EmptyState message={<>{t('menu.empty')}<br />{canEdit && t('menu.emptyHint')}</>} />
              ) : (
                <div className={styles.table} role="list" aria-label={t('menu.field')}>
                  <div className={`${styles.row} ${styles.head}`} aria-hidden="true">
                    <span />
                    {['product', 'hopper', 'price', 'badge', 'soldOut', 'on'].map((c) => <span key={c} className="overline">{t(`menu.col.${c}`)}</span>)}
                    <span />
                  </div>
                  <DndContext sensors={sensors} collisionDetection={closestCenter}
                    onDragEnd={({ active, over }) => {
                      if (!over || active.id === over.id) return;
                      move(keys.indexOf(active.id), keys.indexOf(over.id));
                      changed();
                    }}>
                    <SortableContext items={keys} strategy={verticalListSortingStrategy}>
                      {fields.map((field, index) => {
                        const row = rows[index];
                        const dup = warn.duplicates.get(index);
                        return (
                          <MenuItemRow key={field.key} field={field} index={index} count={fields.length} canEdit={canEdit} canPrice={canPrice}
                            product={byId.get(row?.product_id)}
                            warning={dup !== undefined ? t('menu.warn.duplicate', { hopper: row.hopper, other: productName(rows[dup]?.product_id) }) : null}
                            errors={rowErrors.get(row?.product_id) ?? []}
                            onMove={(from, to) => { move(from, to); changed(); }}
                            onRemove={(i) => { remove(i); changed(); }}
                            onChanged={changed} />
                        );
                      })}
                    </SortableContext>
                  </DndContext>
                </div>
              )}
            </>
          );
        }}
      </Form.List>
      {canEdit && (
        <UnsavedBar dirty={dirty} saving={saver.saving} onSave={() => form.submit()}
          onDiscard={() => { reset(valuesOf(loaded)); saver.clearProblem(); }} />
      )}
    </Form>
  );
}
