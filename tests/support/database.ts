import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';

/**
 * Connects this test file to the jest instance's shared in-memory Mongo.
 *
 * ── ONE SERVER PER JEST INSTANCE, NOT ONE PER FILE ───────────────────────────────────────────────
 * `setupTestDb()` calls this from `beforeAll`, so it runs once per TEST FILE. Starting a
 * `MongoMemoryServer` here — which is what it used to do — meant spawning and killing a real `mongod`
 * 33 times per pass, once for each suite that touches the database.
 *
 * A normal `npm test` absorbs that. Stryker does not: it runs the suite once per MUTANT inside one
 * long-lived process, so 33 servers per pass became thousands per run, and the driver's ~1 MB
 * connection buffers accumulated in a process that never exits. Measured 2026-08-14: 958 buffers
 * holding 1.08 GB, 45% of the heap, ending in a worker killed and restarted every 15–25 seconds.
 * See `docs/tools/mutation-testing.md`.
 *
 * `globalSetup` now starts ONE server and publishes its uri; each file takes its own DATABASE on it.
 * `process.env` is the channel because jest gives every test file a fresh module registry — a
 * module-level singleton here would be re-created per file, which is the bug this replaces — while
 * the environment crosses both that boundary and the one into worker processes.
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
