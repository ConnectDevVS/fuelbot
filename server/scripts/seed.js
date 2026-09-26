// Dev data: the mock's default catalog as tenant "powerfuel", machine "machine-042"
// (stories/kiosk-api decision 5). Image URLs are removed: the dev server has no such images,
// and the bundled images show instead. Safe to re-run (updates in place).
//   npm run seed
import { importConfig } from '../src/services/catalog.js';
import { readConfigFile, stripImageUrls, withDb } from './lib.js';

const MOCK_DEFAULT = new URL('../../mockserver/responses/config/default.json', import.meta.url).pathname;

await withDb(async () => {
  const config = stripImageUrls(readConfigFile(MOCK_DEFAULT));
  await importConfig({ tenantId: 'powerfuel', tenantName: 'PowerFuel Gym', machineId: 'machine-042', config });
  console.log('Seeded tenant "powerfuel" (PowerFuel Gym) with machine "machine-042" '
    + `(${config.flavors.length} products).`);
});
