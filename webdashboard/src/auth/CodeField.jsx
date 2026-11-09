// The emailed code (server plan §4.16): 6 letters and digits, upper-cased and trimmed as typed,
// in mono. Shared by the forced password change and the reset page. It lives in the form only.
import { useEffect, useState } from 'react';
import { Input } from 'antd';
import styles from './auth.module.css';

export const CODE_LENGTH = 6;

/** "abc 23-4" → "ABC234" (at most 6). */
export const cleanCode = (value) => String(value ?? '').replace(/[^0-9a-z]/gi, '').toUpperCase().slice(0, CODE_LENGTH);

/** An antd form control: value / onChange come from Form.Item. */
export function CodeInput({ value, onChange, id, ...rest }) {
  return (
    <Input id={id} value={value} size="large" className={styles.code} autoComplete="one-time-code"
      autoCapitalize="characters" spellCheck={false} onChange={(e) => onChange?.(cleanCode(e.target.value))} {...rest} />
  );
}

/** A resend button's wait: {left (seconds), start()}. */
export function useCooldown(seconds = 60) {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until <= now) return undefined;
    const id = setTimeout(() => setNow(Date.now()), Math.min(1000, until - now));
    return () => clearTimeout(id);
  }, [until, now]);
  return {
    left: Math.max(0, Math.ceil((until - now) / 1000)),
    start() {
      const at = Date.now();
      setNow(at);
      setUntil(at + seconds * 1000);
    },
  };
}
