// Ids (§4 patterns 7–8). Id: mono text with antd's copy button. CopyField: a big grouped value for
// typing by hand (machine ids, keys) with its own Copy button: the canonical value goes to the
// clipboard (never storage or logs), "Copied" shows for 2 s, and if the clipboard is refused the
// value is selected instead so it can be copied by hand.
import { useEffect, useRef, useState } from 'react';
import { Button, Typography } from 'antd';
import { CheckOutlined, CopyOutlined } from '@ant-design/icons';
import { t } from '../strings.js';
import styles from './ui.module.css';

export function Id({ value, copy = true }) {
  if (!value) return <span>—</span>;
  return (
    <Typography.Text className={styles.mono} copyable={copy ? { text: value, tooltips: [t('copy.copy'), t('copy.copied')] } : false}>
      {value}
    </Typography.Text>
  );
}

/**
 * Copy `value` (the canonical text) to the clipboard: `copied` is true for 2 s after. If the
 * clipboard is refused, the text in `ref` is selected so it can be copied by hand.
 */
export function useCopy(value) {
  const ref = useRef(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      const range = document.createRange();
      range.selectNodeContents(ref.current);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }
  return { ref, copied, copy };
}

export function CopyField({ value, display, label }) {
  const { ref, copied, copy } = useCopy(value);

  return (
    <span className={styles.copyField}>
      <span ref={ref} className={styles.copyValue} aria-label={label ? `${label}: ${value}` : value}>{display ?? value}</span>
      <Button size="small" icon={copied ? <CheckOutlined /> : <CopyOutlined />} onClick={copy}
        aria-label={label ? t('copy.copyLabel', { label }) : t('copy.copy')}>
        {copied ? t('copy.copied') : t('copy.copy')}
      </Button>
    </span>
  );
}
