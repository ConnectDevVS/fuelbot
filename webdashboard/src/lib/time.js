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

// --- Buckets (dashboard plan §2.10): the same keys the server's summary uses ------------------------
// day '%Y-%m-%d', ISO week '%G-W%V', month '%Y-%m', all in the display zone. Days are walked as
// calendar dates (never by adding 24 h), so a DST change can't skip or repeat one.

const MS_DAY = 86400000;
const pad = (n) => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'YYYY-MM-DD' → UTC ms of that calendar date (arithmetic only). */
const dateMs = (key) => Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));
const dateKeyOf = (ms) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

/** ISO 8601 week of a calendar date: {year, week} (Thursday rule). */
export function isoWeek(key) {
  const ms = dateMs(key);
  const dow = (new Date(ms).getUTCDay() + 6) % 7;          // Monday 0 … Sunday 6
  const thursday = ms + (3 - dow) * MS_DAY;
  const year = new Date(thursday).getUTCFullYear();
  const week = 1 + Math.floor((thursday - Date.UTC(year, 0, 1)) / (7 * MS_DAY));
  return { year, week };
}

export function bucketKeyOfDate(dayKey, group) {
  if (group === 'month') return dayKey.slice(0, 7);
  if (group === 'week') {
    const { year, week } = isoWeek(dayKey);
    return `${year}-W${pad(week)}`;
  }
  return dayKey;
}

/** The local calendar date of an instant in tz. */
export function localDateKey(value, tz) {
  return dayjs(value).tz(tz).format('YYYY-MM-DD');
}

/** The instant a local calendar date starts in tz. */
export function startOfLocalDate(dayKey, tz) {
  return dayjs.tz(`${dayKey}T00:00:00`, tz).valueOf();
}

/**
 * Every bucket key from `from` (inclusive) to `to` (exclusive), in order, like the server's keys.
 * group: 'day' | 'week' | 'month'.
 */
export function bucketKeys(group, from, to, tz) {
  const end = dayjs(to).valueOf();
  const keys = [];
  for (let ms = dateMs(localDateKey(from, tz)); ; ms += MS_DAY) {
    const day = dateKeyOf(ms);
    if (startOfLocalDate(day, tz) >= end) break;
    const key = bucketKeyOfDate(day, group);
    if (keys.at(-1) !== key) keys.push(key);
    if (keys.length > 5000) break;   // a runaway range: never hang the page
  }
  return keys;
}

/** Monday of an ISO week key ('2026-W39'), as 'YYYY-MM-DD'. */
function mondayOf(weekKey) {
  const year = Number(weekKey.slice(0, 4));
  const week = Number(weekKey.slice(6));
  const jan4 = Date.UTC(year, 0, 4);
  const jan4dow = (new Date(jan4).getUTCDay() + 6) % 7;
  return dateKeyOf(jan4 - jan4dow * MS_DAY + (week - 1) * 7 * MS_DAY);
}

const shortDate = (dayKey) => `${Number(dayKey.slice(8, 10))} ${MONTHS[Number(dayKey.slice(5, 7)) - 1]}`;

/** The full label: '28 Sep', 'Week 39 · 21–27 Sep', 'Sep 2026'. */
export function bucketLabel(key, group) {
  if (group === 'month') return `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
  if (group === 'week') {
    const monday = mondayOf(key);
    const sunday = dateKeyOf(dateMs(monday) + 6 * MS_DAY);
    const range = monday.slice(5, 7) === sunday.slice(5, 7)
      ? `${Number(monday.slice(8, 10))}–${shortDate(sunday)}` : `${shortDate(monday)} – ${shortDate(sunday)}`;
    return `Week ${Number(key.slice(6))} · ${range}`;
  }
  return shortDate(key);
}

/** The x-axis label: '28 Sep', 'W39', 'Sep'. */
export function bucketAxisLabel(key, group) {
  if (group === 'month') return MONTHS[Number(key.slice(5, 7)) - 1];
  if (group === 'week') return `W${Number(key.slice(6))}`;
  return shortDate(key);
}
