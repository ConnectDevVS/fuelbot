// Issuing a machine key (dashboard plan §5.5, §5.6.7): a plain API call, deliberately not React
// Query (its cache would keep the key). The caller keeps `key` in component state only, shows it
// once on the provisioning card and drops it on Done, on leaving and on unmount. Never log it, put it
// in a URL or store it.
import { api } from '../api/client.js';

/** → {key: 'XXXX-XXXX-XXXX-XXXX-XXXX', machine_key: {id, prefix, label, …}} */
export function issueKey(tid, mid, label) {
  return api('POST', `/tenants/${encodeURIComponent(tid)}/machines/${encodeURIComponent(mid)}/keys`,
    { body: label ? { label } : {} });
}
