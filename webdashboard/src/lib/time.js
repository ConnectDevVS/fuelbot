// Times in the display zone (dashboard plan §2.10). "IST" is appended for Asia/Kolkata.
import dayjs from './dayjs.js';

export function zoneLabel(tz) {
  return tz === 'Asia/Kolkata' ? ' IST' : '';
}

/** '14:05 IST' */
export function formatClock(date, tz) {
  return `${dayjs(date).tz(tz).format('HH:mm')}${zoneLabel(tz)}`;
}
