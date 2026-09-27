// Creates a platform_admin (FuelBot staff) for the dashboard (stories/users-rbac decision 9).
//   npm run create-admin -- --email=ops@fuelbot.example [--name="Ops"]
// The password comes from a hidden prompt, or ADMIN_PASSWORD in the environment (scripts).
// Never pass it as an argument: arguments show up in the process list and shell history.
import readline from 'node:readline';
import { User } from '../src/models/index.js';
import { hashPassword, checkPassword } from '../src/auth/passwords.js';
import { parseArgs, withDb } from './lib.js';

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

const { options } = parseArgs();
if (typeof options.email !== 'string' || !options.email.includes('@')) {
  console.error('usage: npm run create-admin -- --email=<email> [--name=<name>]');
  process.exit(2);
}

let password = process.env.ADMIN_PASSWORD;
if (!password) {
  if (!process.stdin.isTTY) {
    console.error('No terminal for the password prompt: set ADMIN_PASSWORD instead.');
    process.exit(2);
  }
  password = await promptHidden('Password (10+ characters): ');
  const again = await promptHidden('Repeat it: ');
  if (again !== password) {
    console.error('The passwords differ.');
    process.exit(1);
  }
}
try {
  checkPassword(password);
} catch (err) {
  console.error(`Refused: ${err.details}.`);
  process.exit(1);
}

await withDb(async (settings) => {
  const email = options.email.trim().toLowerCase();
  if (await User.exists({ email })) throw new Error(`A user with email ${email} already exists.`);
  await User.create({
    email,
    name: typeof options.name === 'string' ? options.name : '',
    role: 'platform_admin',
    password_hash: await hashPassword(password, settings.bcryptCost),
  });
  console.log(`Created platform_admin ${email}.`);
});
