// Dev data: the mock's default catalog as tenant "powerfuel", machine "DEV00001"
// (stories/kiosk-api decision 5). Image URLs are removed: the dev server has no such images,
// and the bundled images show instead. Safe to re-run (updates in place).
// DEV00001 is the one pinned id (tools/dev_setup.gd defaults to it); real machines get generated ids.
//   npm run seed
import { importConfig } from '../src/services/catalog.js';
import { readConfigFile, stripImageUrls, withDb } from './lib.js';
import { DEV_KEY, hashKey, issueKey } from '../src/services/keys.js';
import { MachineKey } from '../src/models/index.js';

export const DEV_MACHINE = 'DEV00001';

// Never in production: the seed creates a machine with a publicly known key.
if (process.env.NODE_ENV === 'production') {
  console.error('Refused: npm run seed is for development (it creates DEV00001 with a known key).');
  process.exit(1);
}
const MOCK_DEFAULT = new URL('../../mockserver/responses/config/default.json', import.meta.url).pathname;

await withDb(async () => {
  const config = stripImageUrls(readConfigFile(MOCK_DEFAULT));
  const { machine } = await importConfig({ tenantId: 'powerfuel', tenantName: 'PowerFuel Gym', machineId: DEV_MACHINE, config });
  if (!(await MachineKey.exists({ hash: hashKey(DEV_KEY) }))) await issueKey(machine, { label: 'dev seed', key: DEV_KEY });
  console.log(`Seeded tenant "powerfuel" (PowerFuel Gym) with machine "${DEV_MACHINE}" `
    + `(${config.flavors.length} products, dev key ${DEV_KEY}).`);
});
