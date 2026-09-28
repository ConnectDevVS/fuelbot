// Cursor pages (stories/users-rbac decision 10): newest first by _id; the cursor is opaque.
import mongoose from 'mongoose';
import { HttpError } from '../errors.js';

export const MAX_LIMIT = 200;
export const DEFAULT_LIMIT = 50;

function decodeCursor(cursor) {
  const hex = Buffer.from(String(cursor), 'base64url').toString('utf8');
  if (!mongoose.Types.ObjectId.isValid(hex) || hex.length !== 24) throw new HttpError(400, 'invalid_cursor');
  return new mongoose.Types.ObjectId(hex);
}

/** One page of Model matching filter: {items: rows mapped by view, next_cursor}. */
export async function findPage(Model, filter, query, view, { select } = {}) {
  let limit = Number.parseInt(query.limit ?? DEFAULT_LIMIT, 10);
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
  limit = Math.min(limit, MAX_LIMIT);
  const where = { ...filter };
  if (query.cursor) where._id = { $lt: decodeCursor(query.cursor) };
  let q = Model.find(where).sort({ _id: -1 }).limit(limit + 1);
  if (select) q = q.select(select);
  const rows = await q.lean();
  const more = rows.length > limit;
  const items = rows.slice(0, limit);
  return {
    items: items.map(view),
    next_cursor: more ? Buffer.from(String(items.at(-1)._id)).toString('base64url') : null,
  };
}
