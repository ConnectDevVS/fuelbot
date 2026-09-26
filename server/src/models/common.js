// Shared schema options (plan §4.1): strict, snake_case timestamps.
export const TIMESTAMPS = { createdAt: 'created_at', updatedAt: 'updated_at' };
export const STRICT = { strict: true, strictQuery: true };
export const SUB = { _id: false, strict: true };
