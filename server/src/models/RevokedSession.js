// Signed-out sessions (plan §4.6): a session's id stays here until the session would have
// expired anyway; MongoDB deletes it then (TTL index).
import mongoose from 'mongoose';
import { STRICT } from './common.js';

const RevokedSessionSchema = new mongoose.Schema({
  jti: { type: String, required: true, unique: true },
  expires_at: { type: Date, required: true },
}, { ...STRICT, collection: 'revoked_sessions' });

RevokedSessionSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

export const RevokedSession = mongoose.model('RevokedSession', RevokedSessionSchema);
