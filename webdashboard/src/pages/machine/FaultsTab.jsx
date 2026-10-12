// A machine's Faults tab (dashboard plan §5.6.10; SRV-47; platform only).
import { RefreshButton } from '../../ui/PageHeader.jsx';
import { FaultIntervals, useFaults } from '../faults/FaultIntervals.jsx';
import styles from '../telemetry/telemetry.module.css';

export default function FaultsTab({ mid }) {
  const query = useFaults({ machine: mid });
  return (
    <>
      <div className={styles.filters}><RefreshButton queries={[query]} /></div>
      <FaultIntervals query={query} />
    </>
  );
}
