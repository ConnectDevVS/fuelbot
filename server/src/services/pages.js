// Cursor pages (stories/users-rbac decision 10): newest first by _id (or by a date field, ties by
// _id); the cursor is opaque.
import mongoose from 'mongoose';
import { HttpError } from '../errors.js';

export const MAX_LIMIT = 200;
export const DEFAULT_LIMIT = 50;

function decodeCursor(cursor) {
  const hex = Buffer.from(String(cursor), 'base64url').toString('utf8');
  if (!mongoose.Types.ObjectId.isValid(hex) || hex.length !== 24) throw new HttpError(400, 'invalid_cursor');
  return new mongoose.Types.ObjectId(hex);
}

/** A sortBy cursor: "<ISO date>|<id>" of the page's last row. */
function decodeDateCursor(cursor) {
  const [iso, hex] = Buffer.from(String(cursor), 'base64url').toString('utf8').split('|');
  const at = new Date(iso);
  if (Number.isNaN(at.getTime()) || !mongoose.Types.ObjectId.isValid(hex ?? '') || hex.length !== 24) {
    throw new HttpError(400, 'invalid_cursor');
  }
  return { at, id: new mongoose.Types.ObjectId(hex) };
}

/**
 * One page of Model matching filter: {items: rows mapped by view, next_cursor}. Newest _id first, or
 * with sortBy (a date field) newest sortBy first, ties by _id.
 */
export async function findPage(Model, filter, query, view, { select, sortBy } = {}) {
  let limit = Number.parseInt(query.limit ?? DEFAULT_LIMIT, 10);
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
  limit = Math.min(limit, MAX_LIMIT);
  let where = { ...filter };
  if (query.cursor && sortBy) {
    const { at, id } = decodeDateCursor(query.cursor);
    where = { $and: [where, { $or: [{ [sortBy]: { $lt: at } }, { [sortBy]: at, _id: { $lt: id } }] }] };
  } else if (query.cursor) {
    where._id = { $lt: decodeCursor(query.cursor) };
  }
  let q = Model.find(where).sort(sortBy ? { [sortBy]: -1, _id: -1 } : { _id: -1 }).limit(limit + 1);
  if (select) q = q.select(select);
  const rows = await q.lean();
  const more = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  const cursor = () => (sortBy ? `${last[sortBy].toISOString()}|${last._id}` : String(last._id));
  return {
    items: items.map(view),
    next_cursor: more ? Buffer.from(cursor()).toString('base64url') : null,
  };
}
