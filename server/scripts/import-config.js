// Imports an app config (the kiosk's schema) as a tenant's products plus one machine's menu.
//   npm run import-config -- --tenant=powerfuel --machine=machine-042 [--tenant-name="PowerFuel Gym"]
//                            [--strip-image-urls] path/to/config.json
// Accepts a plain config or a mock scenario file without "extends". Re-importing updates in place.
import { importConfig } from '../src/services/catalog.js';
import { parseArgs, readConfigFile, stripImageUrls, withDb } from './lib.js';

const { options, positional } = parseArgs();
if (!options.tenant || !options.machine || positional.length !== 1) {
  console.error('usage: npm run import-config -- --tenant=<id> --machine=<id> [--tenant-name=<name>] '
    + '[--strip-image-urls] <config.json>');
  process.exit(2);
}

await withDb(async () => {
  const config = readConfigFile(positional[0]);
  if (options['strip-image-urls']) stripImageUrls(config);
  const { machine } = await importConfig({
    tenantId: options.tenant,
    tenantName: typeof options['tenant-name'] === 'string' ? options['tenant-name'] : undefined,
    machineId: options.machine,
    config,
  });
  console.log(`Imported ${config.flavors.length} flavors into tenant ${options.tenant}, machine ${machine._id}.`);
});
