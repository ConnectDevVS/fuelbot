// A temporary password (dashboard plan §5.12): typed, or Generate (14 look-alike-free characters),
// shown in mono so it can be read out, with Copy and the note. It lives in the dialog's form only
// (the dialog is destroyed on close) and is never stored, logged or cached.
import { Button, Input } from 'antd';
import { CheckOutlined, CopyOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useCopy } from '../../ui/Id.jsx';
import { tempPassword } from '../../lib/tempPassword.js';
import { t } from '../../strings.js';
import styles from './users.module.css';

/** An antd form control: value / onChange come from Form.Item. */
export function TempPasswordField({ value, onChange, id }) {
  const { ref, copied, copy } = useCopy(value ?? '');
  return (
    <div className={styles.temp}>
      <div className={styles.tempRow}>
        <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} className={styles.tempInput}
          autoComplete="new-password" spellCheck={false} aria-describedby={`${id}-note`} />
        <Button icon={<ThunderboltOutlined />} onClick={() => onChange(tempPassword())}>{t('temp.generate')}</Button>
        <Button icon={copied ? <CheckOutlined /> : <CopyOutlined />} disabled={!value} onClick={copy}>
          {copied ? t('copy.copied') : t('copy.copy')}
        </Button>
      </div>
      <span ref={ref} className={styles.hidden}>{value}</span>
      <p id={`${id}-note`} className={styles.note}>{t('temp.note')}</p>
    </div>
  );
}
