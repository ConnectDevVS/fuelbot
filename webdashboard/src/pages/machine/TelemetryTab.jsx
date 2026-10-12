// A machine's Telemetry tab (dashboard plan §5.6.9; SRV-47; platform only).
import { TelemetryList } from '../telemetry/TelemetryList.jsx';

export default function TelemetryTab({ mid }) {
  return <TelemetryList base={{ machine: mid }} />;
}
