// Telemetry and sales ingest (plan §3.3–§3.6): never lose a record, never store one twice.
// Known fields are type-checked against the model; anything unknown or wrong-typed goes to
// `extra` (strict schemas must not silently drop it, and refusing would make the app drop it).
import { SERVER_FIELDS } from '../models/records.js';
import { isDuplicateKey } from '../db.js';
import { HttpError } from '../errors.js';

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function fitsPath(schemaType, value) {
  if (value === null) return true;   // nullable as sent (e.g. offer_price, fault)
  switch (schemaType.instance) {
    case 'String': return typeof value === 'string';
    case 'Number': return typeof value === 'number' && Number.isFinite(value);
    case 'Boolean': return typeof value === 'boolean';
    case 'Array': {
      if (!Array.isArray(value)) return false;
      const sub = schemaType.schema;   // array of sub-documents (e.g. stages)
      if (!sub) return value.every((v) => typeof v === 'string');
      return value.every((item) => isObject(item) && Object.entries(item).every(
        ([k, v]) => sub.path(k) && fitsPath(sub.path(k), v),
      ));
    }
    default: return false;
  }
}

function parseTimestamp(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const t = Date.parse(value);
  return Number.isNaN(t) ? fallback : new Date(t);
}

/**
 * Splits a posted body into a document for `Model`: typed known fields, identity from the
 * headers (kiosk), the body's own ids only when they differ, and everything else in `extra`.
 */
export function toRecord(Model, body, kiosk, now = new Date()) {
  const doc = {};
  const extra = {};
  for (const [key, value] of Object.entries(body)) {
    if (key === 'tenant_id' || key === 'machine_id') {
      const headerValue = key === 'tenant_id' ? kiosk.tenantId : kiosk.machineId;
      if (value !== headerValue) {
        if (typeof value === 'string') doc[`body_${key}`] = value;
        else extra[key] = value;
      }
      continue;
    }
    const path = SERVER_FIELDS.includes(key) ? null : Model.schema.path(key);
    if (path && fitsPath(path, value)) doc[key] = value;
    else extra[key] = value;
  }
  doc.tenant_id = kiosk.tenantId;
  doc.machine_id = kiosk.machineId;
  doc.received_at = now;
  doc.ts = parseTimestamp(doc.timestamp, now);
  doc.machine_known = kiosk.known;
  if (Object.keys(extra).length) doc.extra = extra;
  return doc;
}

/**
 * Stores one record. Returns {status, body, doc, duplicate}. keyField is the dedupe key
 * (event_id / order_id); requiredFields must be non-empty strings or it's 400 `invalidError`.
 */
export async function ingest(Model, body, kiosk, { keyField, requiredFields, invalidError, log }) {
  if (!isObject(body)) throw new HttpError(400, invalidError);
  for (const field of requiredFields) {
    if (typeof body[field] !== 'string' || body[field] === '') throw new HttpError(400, invalidError);
  }
  const doc = toRecord(Model, body, kiosk);
  if (doc.body_tenant_id || doc.body_machine_id) {
    console.warn(`[${log}] ${body[keyField]}: body ids (${doc.body_tenant_id ?? '-'}/${doc.body_machine_id ?? '-'}) `
      + `differ from headers (${kiosk.tenantId}/${kiosk.machineId}); headers kept`);
  }
  try {
    await Model.create(doc);
  } catch (err) {
    if (!isDuplicateKey(err)) throw err;
    return { status: 200, body: { ok: true, duplicate: true }, doc, duplicate: true };
  }
  return { status: 201, body: { ok: true }, doc, duplicate: false };
}
