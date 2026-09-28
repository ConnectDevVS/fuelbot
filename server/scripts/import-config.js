// Imports an app config (the kiosk's schema) as a tenant's products plus one machine's menu.
//   npm run import-config -- --tenant=powerfuel [--machine=<id>] [--tenant-name="PowerFuel Gym"]
//                            [--strip-image-urls] path/to/config.json
// Without --machine a new machine is registered under a generated id (printed). With it, the
// machine must exist (re-import) or the id must be 8 characters A–Z0–9.
// Accepts a plain config or a mock scenario file without "extends". Re-importing updates in place.
import { importConfig } from '../src/services/catalog.js';
import { parseArgs, readConfigFile, stripImageUrls, withDb } from './lib.js';
import { MACHINE_ID_PATTERN } from '../src/services/machines.js';

const { options, positional } = parseArgs();
if (!options.tenant || positional.length !== 1 || (options.machine && !MACHINE_ID_PATTERN.test(options.machine))) {
  console.error('usage: npm run import-config -- --tenant=<id> [--machine=<8 chars A-Z0-9>] [--tenant-name=<name>] '
    + '[--strip-image-urls] <config.json>');
  process.exit(2);
}

await withDb(async () => {
  const config = readConfigFile(positional[0]);
  if (options['strip-image-urls']) stripImageUrls(config);
  const { machine } = await importConfig({
    tenantId: options.tenant,
    tenantName: typeof options['tenant-name'] === 'string' ? options['tenant-name'] : undefined,
    machineId: typeof options.machine === 'string' ? options.machine : undefined,
    config,
  });
  console.log(`Imported ${config.flavors.length} flavors into tenant ${options.tenant}, machine ${machine._id}.`);
});
