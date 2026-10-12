// Sales KPIs (dashboard plan §5.7) from a summary's `totals`: Revenue, Orders, Average
// (round(revenue / orders), "—" at 0) and Not dispensed (count + ₹; the tenant wording always).
import { Col, Row } from 'antd';
import { KpiTile } from '../../ui/KpiTile.jsx';
import { formatCount, formatMoney } from '../../lib/money.js';
import { t } from '../../strings.js';

export function salesAverage(totals) {
  return totals?.count > 0 ? Math.round(totals.revenue / totals.count) : null;
}

export function SalesKpis({ totals }) {
  const tot = totals ?? { count: 0, revenue: 0, not_dispensed: 0, not_dispensed_amount: 0 };
  const avg = salesAverage(tot);
  return (
    <Row gutter={[16, 16]}>
      <Col xs={12} lg={6}><KpiTile label={t('sales.kpi.revenue')} value={formatMoney(tot.revenue)} /></Col>
      <Col xs={12} lg={6}><KpiTile label={t('sales.kpi.orders')} value={formatCount(tot.count)} sub={t('sales.kpi.ordersSub')} /></Col>
      <Col xs={12} lg={6}>
        <KpiTile label={t('sales.kpi.avg')} value={avg === null ? '—' : formatMoney(avg)} sub={t('sales.kpi.avgSub')} />
      </Col>
      <Col xs={12} lg={6}>
        <KpiTile label={t('sales.kpi.notDispensed')} value={formatCount(tot.not_dispensed)} warn={tot.not_dispensed > 0}
          sub={tot.not_dispensed > 0 ? formatMoney(tot.not_dispensed_amount) : t('sales.kpi.ndNone')} />
      </Col>
    </Row>
  );
}
