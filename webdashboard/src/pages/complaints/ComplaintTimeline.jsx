// A complaint's thread (dashboard plan §5.20; SRV-53): the description first, then every comment and
// status change, oldest first. Plain text (React escapes it; newlines kept by CSS). A FuelBot author
// carries the "FuelBot support" tag; tenant users get no staff email (the server leaves it out).
import { Tag } from 'antd';
import { ArrowRightOutlined } from '@ant-design/icons';
import { DateTime } from '../../ui/DateTime.jsx';
import { ComplaintStatusChip } from '../../ui/Chips.jsx';
import { t } from '../../strings.js';
import styles from './complaint.module.css';

/** "FuelBot support · Ops" / "Desk", plus the email when the view carries one (staff). */
export function Author({ author }) {
  return (
    <span className={styles.author}>
      {author.fuelbot && <Tag className={styles.fuelbot}>{t('complaint.fuelbot')}</Tag>}
      <b>{author.name || (author.fuelbot ? '' : '—')}</b>
      {author.email && <span className={styles.email}>{author.email}</span>}
    </span>
  );
}

function Entry({ author, at, children, kind }) {
  return (
    <li className={`${styles.entry} ${kind === 'status' ? styles.statusEntry : ''}`} data-entry={kind}>
      <div className={styles.meta}>
        <Author author={author} />
        <DateTime value={at} />
      </div>
      {children}
    </li>
  );
}

export function ComplaintTimeline({ complaint }) {
  const opener = { name: complaint.created_by.name, email: complaint.created_by.email, fuelbot: false };
  return (
    <ol className={styles.timeline} aria-label={t('complaint.thread')}>
      <Entry author={opener} at={complaint.created_at} kind="description">
        <p className={styles.text}>{complaint.description}</p>
      </Entry>
      {complaint.events.map((e) => (
        <Entry key={e.id} author={e.author} at={e.at} kind={e.kind}>
          {e.kind === 'status' && (
            <div className={styles.change}>
              <span>{t('complaint.changed')}</span>
              <ComplaintStatusChip status={e.from} />
              <ArrowRightOutlined aria-label={t('complaint.to')} />
              <ComplaintStatusChip status={e.to} />
            </div>
          )}
          <p className={styles.text}>{e.text}</p>
        </Entry>
      ))}
    </ol>
  );
}
