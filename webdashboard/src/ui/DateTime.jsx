// Times in the display zone (§2.10). RelativeTime shows "4 min ago" with the full time in a tooltip;
// pages pass `now` = their query's dataUpdatedAt, so "4 min ago" is as of the data (no timers,
// §2.6); without it, "now" is when the component mounted.
import { useState } from 'react';
import { Tooltip } from 'antd';
import { useDisplayTz } from '../auth/session.js';
import { formatDate, formatDateTime, relativeTime } from '../lib/time.js';

export function DateTime({ value, dateOnly = false }) {
  const tz = useDisplayTz();
  const text = dateOnly ? formatDate(value, tz) : formatDateTime(value, tz);
  return <time dateTime={value ? new Date(value).toISOString() : undefined} className="num">{text}</time>;
}

export function RelativeTime({ value, now }) {
  const tz = useDisplayTz();
  const [shownAt] = useState(() => Date.now());
  const text = relativeTime(value, now ?? shownAt, tz);
  if (!value) return <span>{text}</span>;
  return (
    <Tooltip title={formatDateTime(value, tz)}>
      <time dateTime={new Date(value).toISOString()} tabIndex={0}>{text}</time>
    </Tooltip>
  );
}
