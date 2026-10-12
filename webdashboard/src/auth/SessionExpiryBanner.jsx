// Shown from 30 minutes before the fixed 48 h session ends (dashboard plan §2.5). One timeout to
// the threshold: no polling, no requests.
import { useEffect, useState } from 'react';
import { Alert } from 'antd';
import { useDisplayTz, useMe } from './session.js';
import { formatClock } from '../lib/time.js';
import { t } from '../strings.js';

export const WARN_BEFORE_MS = 30 * 60 * 1000;

export function SessionExpiryBanner() {
  const { data: me } = useMe();
  const tz = useDisplayTz();
  const expires = me?.session_expires_at ? Date.parse(me.session_expires_at) : null;
  // "now" as of mount, moved forward once by the timeout at the threshold.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!expires) return undefined;
    const wait = expires - WARN_BEFORE_MS - Date.now();
    if (wait <= 0) return undefined;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(wait, 2 ** 31 - 1));
    return () => clearTimeout(timer);
  }, [expires]);

  const shown = expires !== null && expires - WARN_BEFORE_MS <= now;
  if (!shown || !expires) return null;
  return <Alert className="no-print" type="warning" showIcon banner role="status" title={t('session.ends', { time: formatClock(expires, tz) })} />;
}
