// Times in the display zone (dashboard plan §2.10). "IST" is appended for Asia/Kolkata.
import dayjs from './dayjs.js';

export function zoneLabel(tz) {
  return tz === 'Asia/Kolkata' ? ' IST' : '';
}

const valid = (value) => value !== null && value !== undefined && value !== '' && dayjs(value).isValid();

/** '14:05 IST' */
export function formatClock(date, tz) {
  return `${dayjs(date).tz(tz).format('HH:mm')}${zoneLabel(tz)}`;
}

/** '28 Sep 2026' */
export function formatDate(value, tz) {
  return valid(value) ? dayjs(value).tz(tz).format('D MMM YYYY') : '—';
}

/** '28 Sep 2026, 12:42 IST' */
export function formatDateTime(value, tz) {
  return valid(value) ? `${dayjs(value).tz(tz).format('D MMM YYYY, HH:mm')}${zoneLabel(tz)}` : '—';
}

/**
 * Last seen and similar: "just now" (< 60 s), "4 min ago" (< 60 min), "3 h ago" (< 24 h), then
 * "28 Sep, 12:42". null → "never".
 */
export function relativeTime(value, now = Date.now(), tz = 'Asia/Kolkata') {
  if (!valid(value)) return 'never';
  const secs = Math.max(0, Math.floor((now - dayjs(value).valueOf()) / 1000));
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} h ago`;
  return dayjs(value).tz(tz).format('D MMM, HH:mm');
}

/** 'Sunday 28 Sep 2026' (page overlines). */
export function formatDayHeading(value, tz) {
  return valid(value) ? dayjs(value).tz(tz).format('dddd D MMM YYYY') : '—';
}
