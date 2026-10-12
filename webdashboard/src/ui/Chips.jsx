// Status, stock and dispensed chips (dashboard plan §4 pattern 6): antd Tag + icon + text, never
// colour alone. They render only what the object contains: a tenant view has no `status`,
// `faults` or `dispensing_result`, so a platform status can't appear on a tenant screen.
import { Tag } from 'antd';
import {
  CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined, ExclamationCircleOutlined, MinusCircleOutlined,
  PauseCircleOutlined, QuestionCircleOutlined, StopOutlined, SwapOutlined, ToolOutlined, WarningOutlined,
} from '@ant-design/icons';
import { useDisplayTz } from '../auth/session.js';
import { formatClock } from '../lib/time.js';
import { t } from '../strings.js';
import styles from './ui.module.css';

function Chip({ color, icon, children }) {
  return <Tag color={color} icon={icon} className={styles.chip}>{children}</Tag>;
}

const PLATFORM = {
  ok: { color: 'success', icon: <CheckCircleOutlined /> },
  maintenance: { color: 'warning', icon: <ToolOutlined /> },
  fault: { color: 'error', icon: <WarningOutlined /> },
  offline: { color: 'default', icon: <MinusCircleOutlined /> },
};

/**
 * A machine's status. With `status` in the object (the platform view): OK / MAINTENANCE / FAULT /
 * OFFLINE and each fault code with its start. Without (the tenant view): Online/Offline and
 * In/Out of service. `extras` adds Disabled / Not configured, which both views carry.
 */
export function StatusBadge({ machine, extras = true }) {
  const tz = useDisplayTz();
  const chips = [];
  if ('status' in machine) {
    const s = PLATFORM[machine.status] ?? PLATFORM.offline;
    chips.push(<Chip key="s" {...s}>{t(`status.${machine.status}`)}</Chip>);
  } else {
    chips.push(machine.online
      ? <Chip key="o" color="success" icon={<CheckCircleOutlined />}>{t('status.online')}</Chip>
      : <Chip key="o" color="default" icon={<MinusCircleOutlined />}>{t('status.offline_tenant')}</Chip>);
    chips.push(machine.in_service
      ? <Chip key="i" color="default" icon={<CheckCircleOutlined />}>{t('status.in_service')}</Chip>
      : <Chip key="i" color="error" icon={<StopOutlined />}>{t('status.out_of_service')}</Chip>);
  }
  if (extras && machine.disabled) chips.push(<Chip key="d" color="default" icon={<PauseCircleOutlined />}>{t('status.disabled')}</Chip>);
  if (extras && machine.configured === false) chips.push(<Chip key="c" color="warning" icon={<ExclamationCircleOutlined />}>{t('status.not_configured')}</Chip>);
  const faults = Array.isArray(machine.faults) ? machine.faults : [];
  return (
    <span>
      <span className={styles.chips}>{chips}</span>
      {faults.length > 0 && (
        <span className={styles.faults}>
          {faults.map((f) => (
            <span key={f.code} className={`${styles.mono} overline`}>
              {t('status.fault_since', { code: f.code, time: f.since ? formatClock(f.since, tz) : '—' })}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

const STOCK = {
  empty: { color: 'error', icon: <CloseCircleOutlined /> },
  low: { color: 'warning', icon: <WarningOutlined /> },
  refill_needed: { color: 'warning', icon: <SwapOutlined /> },
  unknown: { color: 'default', icon: <QuestionCircleOutlined /> },
  not_estimated: { color: 'default', icon: <ClockCircleOutlined /> },
  ok: { color: 'success', icon: <CheckCircleOutlined /> },
};

export function StockChip({ state }) {
  const s = STOCK[state] ?? STOCK.unknown;
  return <Chip {...s}><span className={styles.mono}>{t(`stock.${STOCK[state] ? state : 'unknown'}`)}</span></Chip>;
}

/**
 * A sale's outcome. Tenant view: `dispensed` → "Dispensed" / "Not dispensed". Platform view (it has
 * `dispensing_result`): the same, plus the result code and reason.
 */
export function DispensedChip({ sale }) {
  const platform = 'dispensing_result' in sale;
  const dispensed = platform ? sale.dispensing_result === 'success' : Boolean(sale.dispensed);
  const detail = platform && !dispensed
    ? [sale.dispensing_result, sale.dispensing_reason].filter(Boolean).join(' · ') : '';
  return (
    <span className={styles.chips}>
      {dispensed
        ? <Chip color="success" icon={<CheckCircleOutlined />}>{t('sale.dispensed')}</Chip>
        : <Chip color="error" icon={<CloseCircleOutlined />}>{t('sale.not_dispensed')}</Chip>}
      {detail && <span className={`${styles.mono} overline`}>{detail}</span>}
    </span>
  );
}
