// MongoDB via Mongoose. Models live in src/models/ (strict schemas, plan §4.1).
import mongoose from 'mongoose';
import './models/index.js';

mongoose.set('strict', true);
mongoose.set('strictQuery', true);

/** Connects the default mongoose connection and builds every registered model's indexes. */
export async function connectDb(url) {
  await mongoose.connect(url, { serverSelectionTimeoutMS: 5000 });
  await Promise.all(Object.values(mongoose.models).map((model) => model.syncIndexes()));
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.disconnect();
}

export async function pingDb() {
  await mongoose.connection.db.admin().command({ ping: 1 });
}

export function isDuplicateKey(err) {
  return err?.code === 11000;
}
