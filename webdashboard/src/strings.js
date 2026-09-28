// Every user-facing string (dashboard plan §2.10): English, in one place, so it can be translated
// later. t('key', {name}) fills {name} placeholders; a missing key renders as [key].
const STRINGS = {
  'app.name': 'FuelBot dashboard',
  'placeholder.overline': 'FuelBot · Dashboard',
  'placeholder.body': 'The dashboard is being built. This page checks the theme and the fonts.',
  'placeholder.primary': 'Refresh',
  'period.day': 'Day',
  'period.week': 'Week',
  'period.month': 'Month',
  'placeholder.col.machine': 'Machine',
  'placeholder.col.revenue': 'Revenue',
};

export function t(key, params = {}) {
  const text = STRINGS[key];
  if (text === undefined) return `[${key}]`;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}
