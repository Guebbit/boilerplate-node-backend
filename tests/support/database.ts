import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongoServer: MongoMemoryServer;

/**
 * Starts an in-memory Mongo for this worker, with its data directory under the run's own root.
 *
 * `dbPath` is passed explicitly rather than left to the library's `os.tmpdir()` default so that a
 * worker killed before `disconnect()` strands its ~201 MB inside the repo's gitignored `.tmp/`,
 * which the run that owns it deletes on the way out. See `global-setup.ts`.
 */
export const connect = async () => {
    const root = process.env.NODE_TEST_MONGO_ROOT;
    const dbPath = root ? await mkdtemp(path.join(root, 'worker-')) : undefined;

    mongoServer = await MongoMemoryServer.create(dbPath ? { instance: { dbPath } } : undefined);
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
};

export const disconnect = async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    await mongoServer.stop();
};

export const clearAll = async () => {
    const { collections } = mongoose.connection;
    for (const key of Object.keys(collections)) {
        await collections[key].deleteMany({});
    }
};
