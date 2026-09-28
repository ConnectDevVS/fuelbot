// A failed save → the form (dashboard plan §4 pattern 10, §7). invalid_body details go to their
// fields by path ('menu[2].hopper' → ['menu', 2, 'hopper']); a path the form doesn't have goes to
// the summary. Users codes and forbidden_field mark their fields. Anything else is a summary message.
import { ApiError } from '../../api/client.js';
import { fieldErrors, fieldPath, messageFor } from '../../api/errors.js';
import { t } from '../../strings.js';

const key = (name) => JSON.stringify([].concat(name));

/** The form's registered field names (antd reports every mounted Form.Item). */
function knownFields(form) {
  return new Set(form.getFieldsError().map((f) => key(f.name)));
}

/**
 * Sets field errors on the antd form and returns what the FormError summary shows:
 * {message, fields: [{name, error}], unknown: [{field, error}]}, or null for a non-ApiError.
 * rename maps a server field to the form's name ({password: 'new'}).
 */
export function applyServerError(error, form, { rename = {} } = {}) {
  if (!(error instanceof ApiError)) return { message: t('error.generic'), fields: [], unknown: [] };
  const known = knownFields(form);
  let fields = [];
  const unknown = [];

  if (error.code === 'invalid_body' && Array.isArray(error.details)) {
    for (const d of error.details) {
      const name = fieldPath(rename[d.field] ?? d.field);
      if (d.field && known.has(key(name))) fields.push({ name, errors: [String(d.error)] });
      else unknown.push({ field: d.field || t('form.body'), error: String(d.error) });
    }
  } else if (error.code === 'forbidden_field' && Array.isArray(error.details)) {
    const text = messageFor(error);
    fields = error.details.map((f) => fieldPath(rename[f] ?? f)).filter((n) => known.has(key(n)))
      .map((name) => ({ name, errors: [text] }));
  } else {
    fields = fieldErrors(error, rename).filter((f) => known.has(key(f.name)));
  }

  if (fields.length) form.setFields(fields);
  const message = error.code === 'invalid_body' ? t('error.invalid_body') : messageFor(error);
  return { message, fields: fields.map((f) => ({ name: f.name, error: f.errors[0] })), unknown };
}
