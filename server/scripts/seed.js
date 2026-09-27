// Dev data: the mock's default catalog as tenant "powerfuel", machine "DEV00001"
// (stories/kiosk-api decision 5). Image URLs are removed: the dev server has no such images,
// and the bundled images show instead. Safe to re-run (updates in place).
// DEV00001 is the one pinned id (tools/dev_setup.gd defaults to it); real machines get generated ids.
//   npm run seed
import { importConfig } from '../src/services/catalog.js';
import { readConfigFile, stripImageUrls, withDb } from './lib.js';

export const DEV_MACHINE = 'DEV00001';
const MOCK_DEFAULT = new URL('../../mockserver/responses/config/default.json', import.meta.url).pathname;

await withDb(async () => {
  const config = stripImageUrls(readConfigFile(MOCK_DEFAULT));
  await importConfig({ tenantId: 'powerfuel', tenantName: 'PowerFuel Gym', machineId: DEV_MACHINE, config });
  console.log(`Seeded tenant "powerfuel" (PowerFuel Gym) with machine "${DEV_MACHINE}" `
    + `(${config.flavors.length} products).`);
});
