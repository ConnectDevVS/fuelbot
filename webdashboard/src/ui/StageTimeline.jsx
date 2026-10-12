// A dispense cycle's stages (dashboard plan §5.9; SRV-40, reused by SRV-47): a track with a marker
// at each stage's offset from the start, then the stages in order with "+1.8 s", and the total
// (duration_ms, or the last offset when the bridge didn't send one). Positions are set through
// React's style prop (the CSSOM), which the CSP allows.
import { t } from '../strings.js';
import styles from './ui.module.css';

const seconds = (ms) => (Math.round(ms / 100) / 10).toFixed(1);

/** stages: [{stage, t_offset_ms}], durationMs: number | null. */
export function StageTimeline({ stages = [], durationMs }) {
  const sorted = [...stages].sort((a, b) => (a.t_offset_ms ?? 0) - (b.t_offset_ms ?? 0));
  const total = durationMs ?? Math.max(0, ...sorted.map((s) => s.t_offset_ms ?? 0));
  const at = (ms) => (total > 0 ? Math.min(100, Math.max(0, ((ms ?? 0) / total) * 100)) : 0);
  return (
    <figure className={styles.timeline} aria-label={t('timeline.label')}>
      <div className={styles.track} aria-hidden="true">
        {sorted.map((s) => <span key={`${s.stage}-${s.t_offset_ms}`} className={styles.marker} style={{ left: `${at(s.t_offset_ms)}%` }} />)}
      </div>
      <ol className={styles.stages}>
        {sorted.map((s) => (
          <li key={`${s.stage}-${s.t_offset_ms}`}>
            <span className={styles.mono}>{s.stage}</span>
            <span className="num">{t('timeline.offset', { s: seconds(s.t_offset_ms ?? 0) })}</span>
          </li>
        ))}
      </ol>
      <figcaption className={`overline ${styles.total}`}>{t('timeline.total', { s: seconds(total) })}</figcaption>
    </figure>
  );
}
