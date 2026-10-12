import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderUi } from '../test/render.jsx';
import { FlavorMixChart, flavorRows } from './FlavorMixChart.jsx';

const item = (key, revenue, count = 1) => ({ key, revenue, count });

describe('FlavorMixChart', () => {
  it('folds more than 8 flavors into Other', () => {
    const items = [100, 900, 800, 700, 600, 500, 400, 300, 200].map((r, i) => item(`f${i}`, r, i + 1));
    const rows = flavorRows(items, new Map());
    expect(rows).toHaveLength(8);
    expect(rows.map((r) => r.key)).toEqual(['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', '__other__']);
    expect(rows.at(-1)).toMatchObject({ name: 'Other (2 flavors)', revenue: 300, count: 10 });
    expect(flavorRows(items.slice(0, 8), new Map())).toHaveLength(8);   // exactly 8: no Other
  });

  it('uses names, falls back to ids', () => {
    const names = new Map([['guava', 'Prymor Guava'], ['electro', 'Prymor Electro']]);
    renderUi(<FlavorMixChart items={[item('guava', 2990, 40), item('electro', 3565, 102), item('retired-mango', 150, 2)]} names={names} />);
    const rows = screen.getAllByRole('listitem').map((el) => el.getAttribute('aria-label'));
    expect(rows).toEqual([
      'Prymor Electro: ₹3,565, 102 orders',
      'Prymor Guava: ₹2,990, 40 orders',
      'retired-mango: ₹150, 2 orders',
    ]);
    expect(screen.queryByText('Legend')).toBeNull();   // one series: no legend
  });
});
