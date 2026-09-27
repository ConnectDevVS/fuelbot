// Password hashing and rules (stories/users-rbac decision 6).
import bcrypt from 'bcryptjs';
import { HttpError } from '../errors.js';

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_BYTES = 72;   // bcrypt ignores anything past 72 bytes

// Compared against when the email is unknown, so a miss takes as long as a hit.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 4);

/** Throws 400 weak_password unless 10 characters to 72 bytes. */
export function checkPassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH
    || Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    throw new HttpError(400, 'weak_password',
      `a password is ${MIN_PASSWORD_LENGTH} characters to ${MAX_PASSWORD_BYTES} bytes`);
  }
}

export async function hashPassword(password, cost) {
  checkPassword(password);
  return bcrypt.hash(password, cost);
}

/** Constant-ish time: always runs one bcrypt comparison, even without a hash. */
export async function verifyPassword(password, hash) {
  if (typeof password !== 'string') password = '';
  const ok = await bcrypt.compare(password, hash || DUMMY_HASH);
  return Boolean(hash) && ok;
}
