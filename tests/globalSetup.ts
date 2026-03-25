import 'dotenv/config';
import { MongoMemoryServer } from 'mongodb-memory-server';
import './global';

/**
 * Jest global setup — runs once before all test suites in the main process.
 *
 * Strategy:
 *  - If NODE_DB_URI is already set to a valid connection string (e.g. via a
 *    .env file pointing to a real MongoDB / podman container), we leave it as-is.
 *  - Otherwise we spin up an in-memory MongoDB instance and expose its URI via
 *    NODE_DB_URI so that every test file can call mongoose.connect() without
 *    needing an external database.
 */
export default async function globalSetup(): Promise<void> {
    const existingUri = process.env.NODE_DB_URI ?? '';

    // A real URI always starts with the standard MongoDB scheme
    if (existingUri.startsWith('mongodb://') || existingUri.startsWith('mongodb+srv://')) {
        return;
    }

    const mongod = await MongoMemoryServer.create();
    process.env.NODE_DB_URI = mongod.getUri();
    // Store the instance on globalThis so the teardown module can stop it
    globalThis.__MONGOD__ = mongod;
}
