// The one palette (dashboard plan §2.8), light theme only. tokens.css holds the same values as CSS
// custom properties (a unit test keeps them identical). Colours exist nowhere else in src/.
export const palette = {
  bg: '#F4F5F2',
  surface: '#FFFFFF',
  raised: '#FAFAF8',
  border: '#E1E3E6',
  text: '#111215',
  muted: '#4B5159',
  dim: '#6B717A',
  // Lime: a fill with on-accent text only, never text on white.
  accent: '#C8FF3E',
  accentHover: '#B6F02B',
  accentActive: '#A6DC24',
  onAccent: '#111215',
  // antd's colorPrimary: links, focus rings, checkboxes (readable on white; the lime isn't).
  primary: '#4D7C0F',
  link: '#3F6A0B',
  selected: '#EEF0EA',
  ok: '#15803D',
  warn: '#A16207',
  warnSurface: '#FEF7E6',
  warnBorder: '#F2D58A',
  bad: '#B91C1C',
  badSurface: '#FDECEC',
  // Chart marks (validated with the dataviz checker, spike F); never the lime.
  chartDispensed: '#4D7C0F',
  chartNotDispensed: '#9D3FD6',
};

export const fonts = {
  sans: 'Archivo, system-ui, sans-serif',
  // JetBrains Mono has no ₹: Archivo is its fallback, as on the kiosk.
  mono: '"JetBrains Mono", Archivo, ui-monospace, monospace',
};
