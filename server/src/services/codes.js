// Emailed codes (plan §4.16): 6 characters, valid 30 minutes, cleared once used, voided after 5
// wrong tries. One code per user, shared by every flow. Stored encrypted (AES-256-GCM, key from
// CODE_ENCRYPTION_KEY) so a live code can be resent as is. Never logged, never in a response.
import crypto from 'node:crypto';
import { User } from '../models/index.js';
import { HttpError } from '../errors.js';

// No O, I, L (or 0, 1): read off a phone and typed without mixing them up.
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;
export const CODE_TTL_MS = 30 * 60 * 1000;
export const MAX_ATTEMPTS = 5;

export function generateCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return code;
}

/** What the user typed, without spaces and upper-cased ("abc 234" → "ABC234"). */
export const normaliseCode = (input) => (typeof input === 'string' ? input.replace(/\s+/g, '').toUpperCase() : '');

export function encryptCode(code, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const text = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, text, cipher.getAuthTag()]).toString('base64');
}

/** The code, or null when it can't be decrypted (another key: a dev restart, or tampering). */
export function decryptCode(enc, key) {
  try {
    const buf = Buffer.from(enc, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(buf.length - 16));
    return Buffer.concat([decipher.update(buf.subarray(12, buf.length - 16)), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

const isLive = (ec, now) => Boolean(ec?.enc) && ec.expires_at > now && ec.attempts < MAX_ATTEMPTS;

const invalidCode = (voided = false) => Object.assign(new HttpError(400, 'invalid_code'), { voided });

/**
 * The user's code to send: the live one as is (same expiry), else a new one replacing it.
 * Conditional on the code read, so parallel calls end with one code. → {code, expiresAt, reused}
 */
export async function issueCode(userId, settings, { now = new Date() } = {}) {
  for (let i = 0; i < 3; i += 1) {
    const user = await User.findById(userId).select('+email_code').lean();
    if (!user) throw new HttpError(404, 'not_found');
    const current = user.email_code;
    if (isLive(current, now)) {
      const code = decryptCode(current.enc, settings.codeKey);
      if (code) return { code, expiresAt: current.expires_at, reused: true };
    }
    const code = generateCode();
    const next = {
      enc: encryptCode(code, settings.codeKey),
      issued_at: now,
      expires_at: new Date(now.getTime() + CODE_TTL_MS),
      attempts: 0,
    };
    const res = await User.updateOne({ _id: userId, 'email_code.issued_at': current?.issued_at ?? null },
      { $set: { email_code: next } });
    if (res.modifiedCount === 1) return { code, expiresAt: next.expires_at, reused: false };
  }
  throw new Error('issueCode: the code kept changing');
}

/**
 * Resolves when input is the user's live code; otherwise throws 400 invalid_code (no code, expired,
 * voided or wrong alike). A wrong code counts an attempt; the fifth voids it (`err.voided`).
 * The caller clears the code in the same save as the new password (`email_code: null`).
 */
export async function checkCode(userId, input, settings, { now = new Date() } = {}) {
  const user = await User.findById(userId).select('+email_code').lean();
  const current = user?.email_code;
  if (!isLive(current, now)) throw invalidCode();
  const stored = decryptCode(current.enc, settings.codeKey);
  const given = normaliseCode(input);
  if (stored && given.length === stored.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(stored))) return;

  const filter = { _id: userId, 'email_code.issued_at': current.issued_at };
  const after = await User.findOneAndUpdate(filter, { $inc: { 'email_code.attempts': 1 } }, { returnDocument: 'after' })
    .select('+email_code').lean();
  const voided = (after?.email_code?.attempts ?? MAX_ATTEMPTS) >= MAX_ATTEMPTS;
  if (voided) await User.updateOne(filter, { $set: { email_code: null } });
  throw invalidCode(voided);
}

export async function clearCode(userId) {
  await User.updateOne({ _id: userId }, { $set: { email_code: null } });
}
