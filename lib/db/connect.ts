import mongoose from 'mongoose';

const globalForMongoose = globalThis as typeof globalThis & {
  mongoose?: {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
  };
};

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME ?? 'lifeos';

if (!MONGODB_URI) {
  console.warn('MONGODB_URI is not set. Database features will be unavailable until it is configured.');
}

async function connectMongo() {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is not configured. Set it in your environment before connecting to MongoDB.');
  }

  if (globalForMongoose.mongoose?.conn) {
    return globalForMongoose.mongoose.conn;
  }

  if (!globalForMongoose.mongoose) {
    globalForMongoose.mongoose = { conn: null, promise: null };
  }

  if (!globalForMongoose.mongoose.promise) {
    globalForMongoose.mongoose.promise = mongoose.connect(MONGODB_URI, {
      dbName: MONGODB_DB_NAME,
    }).then((mongooseInstance) => mongooseInstance);
  }

  try {
    globalForMongoose.mongoose.conn = await globalForMongoose.mongoose.promise;
  } catch (error) {
    globalForMongoose.mongoose.promise = null;
    throw error;
  }

  return globalForMongoose.mongoose.conn;
}

export default connectMongo;
