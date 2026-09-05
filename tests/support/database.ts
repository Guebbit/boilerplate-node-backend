import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';

/**
 * Connects this test file to the jest instance's shared in-memory Mongo.
 *
 * ── ONE SERVER PER JEST INSTANCE, NOT ONE PER FILE ───────────────────────────────────────────────
 * `setupTestDb()` calls this from `beforeAll`, so it runs once per TEST FILE. A `MongoMemoryServer`
 * started here would spawn and kill a real `mongod` once for every suite that touches the database —
 * 37 times per pass, and once per MUTANT under Stryker, which runs the suite in a loop. Each server
 * also costs ~200 MB of `dbpath` that only a clean `stop()` removes, and Stryker kills workers as a
 * matter of course: that combination stranded 88 GB across 212 directories in a single run.
 *
 * `globalSetup` therefore starts ONE server and publishes its uri; each file takes its own DATABASE
 * on it. `process.env` is the channel because jest gives every test file a fresh module registry, so
 * a module-level singleton here would be re-created per file, while the environment crosses both
 * that boundary and the one into worker processes.
 *
 * This bounds the DISK cost and the process count. It is not what bounds the worker's memory — that
 * growth is `bson`'s 17 MiB module-scope buffer, re-allocated per module registry and unrelated to
 * connections; see the case study in `docs/tools/mutation-testing.md`.
 *
 * ── ISOLATION IS UNCHANGED ───────────────────────────────────────────────────────────────────────
 * A database name per file keeps files apart, `clearAll` still empties collections between cases,
 * and `disconnect` drops the file's database on the way out. What changed is the cost of the
 * server, not the isolation of the data.
 */
export const connect = async () => {
    const uri = process.env.NODE_TEST_MONGO_URI;
    if (!uri)
        throw new Error(
            'NODE_TEST_MONGO_URI is unset — tests/support/global-setup.ts starts the shared ' +
                'in-memory Mongo and publishes it. Run through jest, which is wired to it in ' +
                'jest.config.js (`globalSetup`), rather than importing this module directly.'
        );

    // Unique per call, and `connect` is called once per file, so this is effectively per-file.
    await mongoose.connect(uri, { dbName: `test-${randomUUID().slice(0, 8)}` });

    /*
     * Wait for every registered model's indexes to exist before the first case runs.
     *
     * Mongoose builds indexes in the background, so `connect()` resolving does not mean a unique
     * index is enforcing anything yet. That race was previously hidden by accident: starting a
     * `MongoMemoryServer` per file took a second or two, which was long enough for the build to
     * finish first. Connecting to an already-running server is immediate, so the race became
     * visible — `enforces email uniqueness at the database level` inserted a duplicate and it
     * succeeded, intermittently and only under parallel workers.
     *
     * `Model.init()` resolves when that model's indexes are built. Models are registered when the
     * test file imports them, which happens before `beforeAll` runs, so this sees all of them.
     */
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
};

/**
 * Drops this file's database and closes its connection, leaving the shared server running for the
 * files that come after it.
 */
export const disconnect = async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
};

export const clearAll = async () => {
    const { collections } = mongoose.connection;
    for (const key of Object.keys(collections)) {
        await collections[key].deleteMany({});
    }
};
