// Preloaded by every npm script (`node --import ./src/env.js …`), before settings are read.
// ENV_FILE picks the file (ENV_FILE=.env.production npm start) and must exist; without it,
// .env is read if present. Values already in the environment win over the file.
const file = process.env.ENV_FILE;
if (file) {
  try {
    process.loadEnvFile(file);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error(`ENV_FILE not found: ${file}`);
      process.exit(1);
    }
    throw err;
  }
} else {
  try {
    process.loadEnvFile('.env');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}
