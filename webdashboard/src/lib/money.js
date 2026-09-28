// Money (dashboard plan §2.10): ₹ in whole rupees, Indian grouping (₹1,23,456). Missing → —.
const FORMAT = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

export const DASH = '—';

export function formatMoney(rupees) {
  if (rupees === null || rupees === undefined || Number.isNaN(Number(rupees))) return DASH;
  return `₹${FORMAT.format(Math.round(Number(rupees)))}`;
}

/** 1,234 (counts: orders, portions). */
export function formatCount(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return DASH;
  return FORMAT.format(Number(n));
}
