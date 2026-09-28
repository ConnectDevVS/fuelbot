// The gallery's charts (SRV-37): fixed sample summaries shaped like GET /sales/summary.
import { Card, Col, Row, Segmented } from 'antd';
import { useState } from 'react';
import { RevenueChart } from '../charts/RevenueChart.jsx';
import { FlavorMixChart } from '../charts/FlavorMixChart.jsx';

// 14 IST days ending Mon 28 Sep 2026: gaps on 17 and 23 Sep; some not dispensed.
const DAY_FROM = '2026-09-14T18:30:00Z';
const DAY_TO = '2026-09-28T18:30:00Z';
const DAYS = [
  ['2026-09-15', 1180, 0], ['2026-09-16', 1320, 95], ['2026-09-18', 1560, 0], ['2026-09-19', 1820, 180],
  ['2026-09-20', 1400, 0], ['2026-09-21', 690, 0], ['2026-09-22', 1640, 75], ['2026-09-24', 1705, 0],
  ['2026-09-25', 1180, 0], ['2026-09-26', 2140, 160], ['2026-09-27', 980, 0], ['2026-09-28', 2280, 95],
].map(([key, revenue, nd]) => ({ key, revenue, count: Math.round(revenue / 95), not_dispensed: nd ? 1 : 0, not_dispensed_amount: nd }));
const WEEK_FROM = '2026-07-05T18:30:00Z';
const WEEKS = ['2026-W28', '2026-W29', '2026-W30', '2026-W31', '2026-W32', '2026-W33', '2026-W34', '2026-W35', '2026-W36',
  '2026-W37', '2026-W38', '2026-W39'].map((key, i) => ({ key, revenue: 7000 + ((i * 1370) % 5200), count: 80 + i * 3,
  not_dispensed: i % 3 === 0 ? 2 : 0, not_dispensed_amount: i % 3 === 0 ? 190 : 0 }));
const MONTHS = ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07',
  '2026-08', '2026-09'].map((key, i) => ({ key, revenue: 28000 + i * 2100 + (i % 4) * 1800, count: 300 + i * 20,
  not_dispensed: 3, not_dispensed_amount: 280 }));
const FLAVORS = [
  { key: 'electro', revenue: 3565, count: 102 }, { key: 'coffee', revenue: 3450, count: 18 }, { key: 'chocolate', revenue: 3105, count: 17 },
  { key: 'guava', revenue: 2990, count: 40 }, { key: 'cookie', revenue: 2415, count: 15 }, { key: 'vanilla', revenue: 1860, count: 13 },
  { key: 'mango', revenue: 900, count: 10 }, { key: 'berry', revenue: 450, count: 5 }, { key: 'retired-kiwi', revenue: 120, count: 1 },
];
const NAMES = new Map([['electro', 'Prymor Electrolyte'], ['coffee', 'Beast Coffee'], ['chocolate', 'MMN Chocolate'],
  ['guava', 'Prymor Guava'], ['cookie', 'Cookies & Cream'], ['vanilla', 'ON Vanilla'], ['mango', 'Alphonso Mango'], ['berry', 'Mixed Berry']]);

const SETS = {
  day: { items: DAYS, from: DAY_FROM, to: DAY_TO },
  week: { items: WEEKS, from: WEEK_FROM, to: '2026-09-27T18:30:00Z' },   // W28–W39 (Mon 28 Sep starts W40)
  month: { items: MONTHS, from: '2025-09-30T18:30:00Z', to: DAY_TO },
};

export function GalleryCharts() {
  const [group, setGroup] = useState('day');
  const set = SETS[group];
  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} xl={14}>
        <Card size="small" title="Revenue" extra={(
          <Segmented size="small" value={group} onChange={setGroup}
            options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />
        )}>
          <RevenueChart items={set.items} group={group} from={set.from} to={set.to} tz="Asia/Kolkata" title="Revenue (sample)" />
        </Card>
      </Col>
      <Col xs={24} xl={10}>
        <Card size="small" title="Flavor mix" extra={<span className="overline">Revenue</span>}>
          <FlavorMixChart items={FLAVORS} names={NAMES} title="Flavor mix (sample)" />
        </Card>
      </Col>
      <Col xs={24} lg={12}>
        <Card size="small" title="No sales"><RevenueChart items={[]} group="day" from={DAY_FROM} to={DAY_TO} title="Revenue (empty)" /></Card>
      </Col>
    </Row>
  );
}
