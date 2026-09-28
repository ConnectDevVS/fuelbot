// Raw request-body checks, before Mongoose sees anything (plan §4.1, stories/catalog-admin
// decision 4): unknown fields and wrong types are 400 invalid_body, never cast or dropped.
import { HttpError } from '../errors.js';
import { isValidImageUrl } from './validate.js';

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Field types. Each returns an error string, or null when the value fits.
export const T = {
  string: (max = 500) => (v) => (typeof v === 'string' && v.length <= max ? null : `a string (≤ ${max})`),
  nonEmpty: (max = 200) => (v) => (typeof v === 'string' && v.trim() !== '' && v.length <= max
    ? null : `a non-empty string (≤ ${max})`),
  slug: () => (v) => (typeof v === 'string' && /^[a-z0-9][a-z0-9_-]{0,39}$/.test(v)
    ? null : 'lowercase letters, digits, - or _ (1–40, starting with a letter or digit)'),
  bool: () => (v) => (typeof v === 'boolean' ? null : 'true or false'),
  rupees: () => (v) => (Number.isInteger(v) && v > 0 ? null : 'whole rupees > 0'),
  whole: (min = 0, max = 1e6) => (v) => (Number.isInteger(v) && v >= min && v <= max
    ? null : `a whole number ${min}–${max}`),
  number: () => (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? null : 'a number ≥ 0'),
  strings: (max = 50) => (v) => (Array.isArray(v) && v.length <= max && v.every((s) => typeof s === 'string' && s.length <= 200)
    ? null : `a list of strings (≤ ${max})`),
  bundledImage: () => (v) => (typeof v === 'string' && v.startsWith('res://') ? null : 'a res:// path'),
  imageUrl: () => (v) => (typeof v === 'string' && isValidImageUrl(v) ? null : 'an https:// image URL with a file name'),
  nullable: (inner) => (v) => (v === null ? null : inner(v)),
  object: (spec) => (v) => {
    if (!isObject(v)) return 'an object';
    const problems = collect(v, spec, '');
    return problems.length ? problems.map((p) => `${p.field}: ${p.error}`).join('; ') : null;
  },
  list: (itemCheck, max = 20) => (v) => {
    if (!Array.isArray(v) || v.length > max) return `a list (≤ ${max})`;
    for (const [i, item] of v.entries()) {
      const e = itemCheck(item);
      if (e) return `[${i}] ${e}`;
    }
    return null;
  },
};

function collect(body, spec, prefix) {
  const problems = [];
  for (const key of Object.keys(body)) {
    if (!(key in spec)) problems.push({ field: prefix + key, error: 'unknown field' });
  }
  for (const [key, rule] of Object.entries(spec)) {
    const { check, required } = typeof rule === 'function' ? { check: rule, required: false } : rule;
    if (!(key in body) || body[key] === undefined) {
      if (required) problems.push({ field: prefix + key, error: 'required' });
      continue;
    }
    const error = check(body[key]);
    if (error) problems.push({ field: prefix + key, error });
  }
  return problems;
}

export const required = (check) => ({ check, required: true });

/** Returns the body if it fits spec; throws 400 invalid_body with every problem otherwise. */
export function checkBody(body, spec) {
  if (!isObject(body)) throw new HttpError(400, 'invalid_body', [{ field: '', error: 'a JSON object' }]);
  const problems = collect(body, spec, '');
  if (problems.length) throw new HttpError(400, 'invalid_body', problems);
  return body;
}

/**
 * Optimistic locking (decision 2): If-Match must equal the current version.
 * Missing → 428 if_match_required; stale → 409 version_conflict {current}.
 */
export function checkVersion(req, current) {
  const raw = req.get('If-Match');
  if (raw === undefined) throw new HttpError(428, 'if_match_required');
  const sent = Number.parseInt(String(raw).replace(/^W\//, '').replaceAll('"', ''), 10);
  if (sent !== current) throw new HttpError(409, 'version_conflict', { current });
}
