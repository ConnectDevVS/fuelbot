// The machine page's Sales tab (dashboard plan §5.6.4; SRV-44): the Sales page with this machine
// fixed and the machine filter hidden (summary, table, CSV, Not dispensed, print).
import SalesPage from '../sales/SalesPage.jsx';

export default function SalesTab({ mid }) {
  return <SalesPage machineId={mid} />;
}
