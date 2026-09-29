// API error codes → messages and form fields (dashboard plan §7). The text lives in strings.js.
import { ApiError } from './client.js';
import { t } from '../strings.js';

/** Every code the dashboard maps (DP §7 plus the session codes the client routes). */
export const CODES = [
  'invalid_credentials', 'too_many_attempts', 'tenant_disabled', 'wrong_password', 'same_password',
  'weak_password', 'invalid_email', 'email_taken', 'invalid_role', 'role_scope_change', 'unknown_tenant',
  'unknown_machine', 'machines_not_allowed', 'forbidden_self', 'last_tenant_admin', 'last_platform_admin',
  'invalid_body', 'invalid_config', 'version_conflict', 'if_match_required', 'forbidden_field', 'forbidden',
  'product_in_use', 'product_exists', 'tenant_exists', 'source_not_configured', 'not_found', 'network_error',
  'not_signed_in', 'password_change_required', 'csrf_header_required',
];

// Codes whose message says something went wrong on our side (a bug, never expected).
const BUGS = new Set(['if_match_required', 'csrf_header_required']);

// Top-level codes that belong to one field (DP §7): the users API's, and a taken product id.
const USER_FIELDS = {
  product_exists: 'product_id',
  invalid_email: 'email',
  email_taken: 'email',
  invalid_role: 'role',
  role_scope_change: 'role',
  unknown_tenant: 'tenant_id',
  unknown_machine: 'machines',
  machines_not_allowed: 'machines',
  weak_password: 'password',
};

const STOCK_FIELDS = ['portion_g', 'low_portions'];

/** The user-facing message for an error (ApiError or anything else). */
export function messageFor(error) {
  if (!(error instanceof ApiError)) return t('error.generic');
  const { code, details } = error;
  if (BUGS.has(code)) return t('error.generic');
  if (code === 'forbidden_field') {
    const fields = Array.isArray(details) ? details : [];
    return t(fields.some((f) => STOCK_FIELDS.includes(f)) ? 'error.forbidden_field.stock' : 'error.forbidden_field.price');
  }
  if (CODES.includes(code)) return t(`error.${code}`);
  if (error.status >= 500) return t('error.server');
  return t('error.generic');
}

/** 'menu[2].hopper' → ['menu', 2, 'hopper'] (an antd Form name path). */
export function fieldPath(field) {
  return String(field).split('.').flatMap((part) => {
    const out = [];
    const re = /([^[\]]+)|\[(\d+)\]/g;
    let m;
    while ((m = re.exec(part))) out.push(m[2] !== undefined ? Number(m[2]) : m[1]);
    return out;
  });
}

/**
 * Field errors for antd form.setFields: [{name, errors}]. invalid_body details map by their field
 * path; the users codes map to their field. `rename` maps a server field to the form's name.
 */
export function fieldErrors(error, rename = {}) {
  if (!(error instanceof ApiError)) return [];
  const name = (field) => fieldPath(rename[field] ?? field);
  if (error.code === 'invalid_body' && Array.isArray(error.details)) {
    return error.details.filter((d) => d && d.field).map((d) => ({ name: name(d.field), errors: [String(d.error)] }));
  }
  if (USER_FIELDS[error.code]) return [{ name: name(USER_FIELDS[error.code]), errors: [messageFor(error)] }];
  return [];
}
