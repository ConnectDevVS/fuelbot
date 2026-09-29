// "Add product" on the Menu tab (dashboard plan §5.6.1): a searchable list of the tenant's
// non-archived products that aren't on the menu yet. Disabled at the server's limit of 12.
import { Select, Tooltip } from 'antd';
import { t } from '../../strings.js';
import styles from './menu.module.css';

/** products: the ones that may be added; full: the menu has 12; onPick(productId). */
export function ProductPicker({ products, full, onPick }) {
  const picker = (
    <Select aria-label={t('menu.addPick')} placeholder={`+ ${t('menu.add')}`} value={null} disabled={full}
      showSearch={{ optionFilterProp: 'label' }} popupMatchSelectWidth={false} className={styles.picker}
      notFoundContent={t('menu.addNone')} onChange={(pid) => pid && onPick(pid)}
      options={products.map((p) => ({ value: p.id, label: p.name }))} />
  );
  return full ? <Tooltip title={t('menu.full')}>{picker}</Tooltip> : picker;
}
