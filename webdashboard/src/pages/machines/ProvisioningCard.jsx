// The provisioning card (dashboard plan §5.5; mock-up design/provisioning-desktop.png): the three
// values a technician types into a new machine, big and grouped for reading, each with a Copy that
// puts the canonical value on the clipboard (machine id without spaces, key with its dashes). The key
// is shown once: the caller holds it in component state and drops it on Done / leave / unmount.
// Done unlocks with the acknowledgement; leaving before it asks. Print prints the card only.
import { useState } from 'react';
import { Alert, Button, Checkbox } from 'antd';
import { CheckOutlined, CopyOutlined, PrinterOutlined } from '@ant-design/icons';
import { useCopy } from '../../ui/Id.jsx';
import { useLeaveGuard } from '../../ui/forms/UnsavedBar.jsx';
import { t } from '../../strings.js';
import styles from './machines.module.css';

// Stable (the leave guard's effect depends on it).
const LEAVE = { title: t('card.leave.title'), body: t('card.leave.body'), ok: t('card.leave.ok'), stay: t('card.leave.stay') };

function Row({ file, value, children }) {
  const { ref, copied, copy } = useCopy(value);
  return (
    <div className={styles.cardRow}>
      <span className={styles.cardFile}>{file}</span>
      <span ref={ref} className={styles.cardValue} aria-label={`${file}: ${value}`}>{children}</span>
      <Button className={`${styles.cardCopy} ${copied ? styles.copied : ''} no-print`} icon={copied ? <CheckOutlined /> : <CopyOutlined />}
        onClick={copy} aria-label={t('copy.copyLabel', { label: file })}>
        {copied ? t('copy.copied') : t('copy.copy')}
      </Button>
    </div>
  );
}

/** tenantId, machineId, keyValue ('7KQM-2XPA-…'), onDone(). */
export function ProvisioningCard({ tenantId, machineId, keyValue, onDone }) {
  const [ack, setAck] = useState(false);
  useLeaveGuard(!ack, LEAVE);
  const groups = keyValue.split('-');
  return (
    <section className={`${styles.card} print-card`} aria-label={t('card.overline')}>
      <div className={styles.cardHead}>
        <div>
          <div className="overline">{t('card.overline')}</div>
          <h2 className={styles.cardTitle}>{t('card.title')}</h2>
        </div>
        <Button icon={<PrinterOutlined />} onClick={() => window.print()} className="no-print">{t('card.print')}</Button>
      </div>
      <Alert type="warning" showIcon className={styles.once}
        title={<><b>{t('card.once')}</b> {t('card.onceBody')}</>} />

      <Row file={t('card.tenant')} value={tenantId}><span className={styles.big}>{tenantId}</span></Row>
      <Row file={t('card.machine')} value={machineId}>
        <span className={`${styles.big} ${styles.spaced}`}>{machineId.split('').join(' ')}</span>
      </Row>
      <Row file={t('card.key')} value={keyValue}>
        <span className={styles.keyGroups}>
          {groups.map((g, i) => (
            <span key={`${i}-${g}`} className={styles.keyGroupWrap}>
              {i > 0 && <span className={styles.keyDash} aria-hidden="true">–</span>}
              <span className={styles.keyGroup}>{g}</span>
            </span>
          ))}
        </span>
      </Row>

      <ul className={styles.tips}>
        {/* The two glyphs in the card's own mono font, where the zero's dot shows. */}
        <li>{t('card.tip.ids')} <b className={styles.glyph}>0</b>{t('card.tip.idsLetter')} <b className={styles.glyph}>O</b>.</li>
        <li>{t('card.tip.keys')}</li>
      </ul>
      <div className={`${styles.cardFoot} no-print`}>
        <Checkbox checked={ack} onChange={(e) => setAck(e.target.checked)}>{t('card.ack')}</Checkbox>
        <Button type="primary" size="large" disabled={!ack} onClick={onDone}>{t('card.done')}</Button>
      </div>
    </section>
  );
}
