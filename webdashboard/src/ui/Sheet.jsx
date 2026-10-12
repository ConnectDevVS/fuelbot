// Drawer / sheet (§4): from the right (480 px) on tablet and desktop, from the bottom (92 %) on phone.
import { Drawer } from 'antd';
import { useLayoutSize } from '../lib/useMedia.js';

export function Sheet({ open, onClose, title, footer, children, destroyOnHidden = true }) {
  const phone = useLayoutSize() === 'phone';
  return (
    <Drawer open={open} onClose={onClose} title={title} footer={footer} destroyOnHidden={destroyOnHidden}
      placement={phone ? 'bottom' : 'right'} size={phone ? '92%' : 480}>
      {children}
    </Drawer>
  );
}
