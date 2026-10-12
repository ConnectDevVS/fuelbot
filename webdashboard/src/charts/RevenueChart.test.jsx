import { afterEach, describe, expect, it } from 'vitest';
import { renderUi, setWidth } from '../test/render.jsx';
import { RevenueChart } from './RevenueChart.jsx';

// 5 IST days, 26–30 Sep 2026; the summary (like the server's) omits days without sales.
const FROM = '2026-09-25T18:30:00Z';
const TO = '2026-09-30T18:30:00Z';
const ITEMS = [
  { key: '2026-09-26', count: 18, revenue: 1705, not_dispensed: 1, not_dispensed_amount: 95 },
  { key: '2026-09-28', count: 6, revenue: 575, not_dispensed: 0, not_dispensed_amount: 0 },
  { key: '2026-09-30', count: 1, revenue: 90, not_dispensed: 1, not_dispensed_amount: 90 },
];

describe('RevenueChart', () => {
  let restore;
  afterEach(() => restore?.());
  const draw = () => {
    restore = setWidth(1440);
    return renderUi(<RevenueChart items={ITEMS} group="day" from={FROM} to={TO} tz="Asia/Kolkata" />);
  };

  it('fills gaps with zero bars', () => {
    const { container } = draw();
    const buckets = [...container.querySelectorAll('[data-bucket]')].map((el) => el.getAttribute('data-bucket'));
    expect(buckets).toEqual(['2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30']);
    expect(container.querySelector('[data-bucket="2026-09-27"]').getAttribute('aria-label')).toBe('27 Sep: ₹0, 0 orders');
  });

  it('stacks not-dispensed on top', () => {
    const { container } = draw();
    const parts = [...container.querySelectorAll('[data-part]')];
    expect(parts.map((p) => p.getAttribute('data-part'))).toEqual(['dispensed', 'not-dispensed', 'dispensed', 'not-dispensed']);
    // 26 Sep: the hatched part sits above the dispensed part (smaller y), with a gap between.
    const dispensed = parts[0];
    const hatchTop = Number(parts[1].getAttribute('d').match(/V([\d.]+)/)[1]);
    expect(hatchTop).toBeLessThan(Number(dispensed.getAttribute('y')));
    expect(parts[1].getAttribute('fill')).toMatch(/^url\(#hatch/);
    // 30 Sep is all not dispensed: one hatched part from the baseline, no dispensed part.
    expect(container.querySelectorAll('[data-bucket]')[4].getAttribute('aria-label')).toBe('30 Sep: ₹90, 1 order, 1 not dispensed (₹90)');
  });

  it('bar width ≤ 24', () => {
    const { container } = draw();
    for (const el of container.querySelectorAll('rect[data-part]')) expect(Number(el.getAttribute('width'))).toBeLessThanOrEqual(24);
    for (const el of container.querySelectorAll('path[data-part]')) {
      const xs = [...el.getAttribute('d').matchAll(/[MHQ ]([\d.]+),?/g)].map((m) => Number(m[1]));
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(24.001);
    }
  });

  it('every bar has an aria-label with ₹ values', () => {
    const { container } = draw();
    const labels = [...container.querySelectorAll('[data-bucket]')].map((el) => el.getAttribute('aria-label'));
    expect(labels).toHaveLength(5);
    expect(labels[0]).toBe('26 Sep: ₹1,705, 18 orders, 1 not dispensed (₹95)');
    for (const el of container.querySelectorAll('[data-bucket]')) expect(el.getAttribute('tabindex')).toBe('0');
  });

  it('no sales: a message instead of the plot', () => {
    restore = setWidth(390);
    const { container, getByText } = renderUi(<RevenueChart items={[]} group="week" from={FROM} to={TO} />);
    expect(getByText('No sales in this period')).toBeTruthy();
    expect(container.querySelector('svg[role="group"]')).toBeNull();
  });
});
