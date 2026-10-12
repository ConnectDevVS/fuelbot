// One menu item on the Menu tab (dashboard plan §5.6.1; mock-up design/menu-desktop.png): drag handle
// and ↑/↓ (keyboard), product, hopper, price (the product's, or an override for price:write), badge,
// sold out, on, remove. A Form.List row, so server errors map by index (menu[2].hopper). The drag
// transform goes through React's style prop (the CSSOM), which the CSP allows. Below 1100 px the
// header row is hidden and each control shows its own label: two lines per item on a tablet, a card
// with the fields stacked on a phone (plan §5.6.1; menu.module.css).
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AutoComplete, Button, Form, Select, Switch, Tooltip } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, CloseOutlined, HolderOutlined, LockOutlined } from '@ant-design/icons';
import { Money } from '../../ui/Money.jsx';
import { PriceField, priceRules } from '../../ui/forms/PriceField.jsx';
import { BADGES, HOPPERS } from './menuModel.js';
import { t } from '../../strings.js';
import styles from './menu.module.css';

/** The product's own price: "₹75 ~~₹90~~ · product price". */
function ProductPrice({ product, locked }) {
  if (!product) return <span>—</span>;
  const offer = product.offer_price ?? null;
  return (
    <span className={styles.productPrice}>
      <Money value={offer ?? product.actual_price} was={offer !== null ? product.actual_price : undefined} />
      <span className={styles.muted}> · {t('menu.productPrice')}</span>
      {locked && <Tooltip title={t('price.locked')}><LockOutlined className={styles.lock} aria-label={t('price.locked')} /></Tooltip>}
    </span>
  );
}

/** A control with the label it shows below 1100 px (the header row names it on desktop). */
function Cell({ className, label, children }) {
  return (
    <div className={`${styles.cell} ${className}`}>
      <span className={`overline ${styles.cellLabel}`} aria-hidden="true">{label}</span>
      {children}
    </div>
  );
}

/**
 * field: the Form.List field ({key, name}); index/count: its place; product: the product (or
 * undefined); canEdit: menu:edit; canPrice: price:write; warning / errors: texts for this row.
 * onChanged(): after a change made in code (setFieldValue doesn't fire the form's onValuesChange).
 */
export function MenuItemRow({ field, index, count, product, canEdit, canPrice, warning, errors = [], onMove, onRemove, onChanged }) {
  const form = Form.useFormInstance();
  // No layout animation after a reorder: rows jump to their places, so a click right after ↑/↓ or a
  // drop lands on the row it was aimed at, not on the neighbour sliding into its spot.
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable(
    { id: field.key, disabled: !canEdit, animateLayoutChanges: () => false });
  const name = product?.name ?? form.getFieldValue(['menu', field.name, 'product_id']);
  const at = (k) => [field.name, k];
  const flagged = Boolean(warning) || errors.length > 0;

  return (
    <div ref={setNodeRef} className={`${styles.row} ${flagged ? styles.rowWarn : ''} ${isDragging ? styles.dragging : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }} role="listitem" aria-label={name}>
      <div className={styles.handleCell}>
        {canEdit && (
          <>
            <button type="button" ref={setActivatorNodeRef} className={styles.handle} aria-label={t('menu.drag', { name })}
              {...attributes} {...listeners}>
              <HolderOutlined />
            </button>
            <span className={styles.arrows}>
              <Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={index === 0}
                aria-label={t('menu.up', { name })} onClick={() => onMove(index, index - 1)} />
              <Button size="small" type="text" icon={<ArrowDownOutlined />} disabled={index === count - 1}
                aria-label={t('menu.down', { name })} onClick={() => onMove(index, index + 1)} />
            </span>
          </>
        )}
      </div>

      <div className={styles.product}>
        {product?.image_url
          ? <img className={styles.thumb} src={product.image_url} alt="" />
          : <span className={styles.thumb} aria-hidden="true">IMG</span>}
        <span className={styles.productText}>
          <b>{name}</b>
          <span className="mono">{form.getFieldValue(['menu', field.name, 'product_id'])}</span>
        </span>
      </div>

      <Cell className={styles.hopperCell} label={t('menu.col.hopper')}>
        <Form.Item name={at('hopper')} noStyle>
          <Select aria-label={t('menu.hopperOf', { name })} disabled={!canEdit} className={styles.hopper}
            options={HOPPERS.map((h) => ({ value: h, label: String(h) }))} />
        </Form.Item>
      </Cell>

      <Cell className={styles.price} label={t('menu.col.price')}>
        <Form.Item noStyle shouldUpdate={(a, b) => a.menu?.[field.name]?.override !== b.menu?.[field.name]?.override}>
          {() => {
            const override = form.getFieldValue(['menu', field.name, 'override']);
            if (!override) {
              return (
                <>
                  <ProductPrice product={product} locked={!canPrice} />
                  {canEdit && canPrice && (
                    <Button type="link" size="small" className={styles.linkBtn} onClick={() => {
                      form.setFieldValue(['menu', field.name, 'override'], true);
                      form.setFieldValue(['menu', field.name, 'actual_price'], product?.actual_price ?? null);
                      form.setFieldValue(['menu', field.name, 'offer_price'], product?.offer_price ?? null);
                      onChanged();
                    }}>{t('menu.override')}</Button>
                  )}
                </>
              );
            }
            const editable = canEdit && canPrice;
            return (
              <>
                <span className={styles.priceInputs}>
                  <Form.Item name={at('actual_price')} noStyle rules={priceRules({ required: true })}>
                    <PriceField editable={editable} aria-label={t('menu.actual', { name })} />
                  </Form.Item>
                  <Form.Item name={at('offer_price')} noStyle rules={priceRules()}>
                    <PriceField editable={editable} aria-label={t('menu.offer', { name })} placeholder={t('menu.offerPlaceholder')} />
                  </Form.Item>
                </span>
                {editable && (
                  <Button type="link" size="small" className={styles.linkBtn}
                    onClick={() => { form.setFieldValue(['menu', field.name, 'override'], false); onChanged(); }}>
                    {t('menu.useProduct', { price: product ? `₹${product.offer_price ?? product.actual_price}` : '—' })}
                  </Button>
                )}
              </>
            );
          }}
        </Form.Item>
      </Cell>

      <Cell className={styles.badgeCell} label={t('menu.col.badge')}>
        <Form.Item name={at('badge')} noStyle>
          <AutoComplete aria-label={t('menu.badgeOf', { name })} disabled={!canEdit} placeholder={t('menu.noBadge')} maxLength={20}
            allowClear options={BADGES.map((b) => ({ value: b }))} className={styles.badge} />
        </Form.Item>
      </Cell>
      <Cell className={styles.soldCell} label={t('menu.col.soldOut')}>
        <Form.Item name={at('sold_out')} valuePropName="checked" noStyle>
          <Switch aria-label={t('menu.soldOutOf', { name })} disabled={!canEdit} />
        </Form.Item>
      </Cell>
      <Cell className={styles.onCell} label={t('menu.col.on')}>
        <Form.Item name={at('enabled')} valuePropName="checked" noStyle>
          <Switch aria-label={t('menu.enabledOf', { name })} disabled={!canEdit} />
        </Form.Item>
      </Cell>
      <div className={styles.removeCell}>
        {canEdit && <Button type="text" icon={<CloseOutlined />} aria-label={t('menu.remove', { name })} onClick={() => onRemove(index)} />}
      </div>

      {(warning || errors.length > 0) && (
        <div className={styles.rowNote} role="alert">
          {warning && <div>⚠ {warning}</div>}
          {errors.map((e) => <div key={e}>{e}</div>)}
        </div>
      )}
    </div>
  );
}
