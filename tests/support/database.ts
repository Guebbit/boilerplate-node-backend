import { randomUUID } from 'node:crypto';
import os from 'node:os';
import mongoose from 'mongoose';
import { COMMAND_MONITORING, configureMongoose } from '@infrastructure/runtime/database';
import { observeDatabaseCommands } from '@infrastructure/persistence/command-metrics';

/**
 * Driver options every connection opened INSIDE jest needs.
 * Driver >= 7.6 loads `os` with a dynamic import() that jest's vm sandbox rejects, so the
 * handshake would go out without its `driver` field; handing it the module skips the import.
 *
 * `runtimeAdapters` is `@experimental` in driver 7.8 (`node_modules/mongodb/mongodb.d.ts`, `MongoClientOptions`), so a
 * driver bump is where this can change. The driver's own fallback, which jest breaks, is
 * `options.runtimeAdapters?.os ?? (await import('os'))` (`node_modules/mongodb/lib/runtime_adapters.js`).
 * https://mongodb.github.io/node-mongodb-native/7.8/interfaces/MongoClientOptions.html#runtimeAdapters
 */
export const JEST_DRIVER_OPTIONS = { runtimeAdapters: { os } } as const;

/**
 * Connects this test file to the jest instance's shared in-memory Mongo.
 *
 * Why one server: `setupTestDb()` calls this from `beforeAll`, once per TEST FILE. A
 *   `MongoMemoryServer` started here would spawn and kill a real `mongod` for every suite that
 *   touches the database, and once per MUTANT under Stryker, which loops the suite. Each server
 *   also costs ~200 MB of `dbpath` that only a clean `stop()` removes, and Stryker kills workers as
 *   a matter of course: that stranded tens of GB across hundreds of directories in one run.
 * How:       `globalSetup` starts ONE server and publishes its uri; each file takes its own
 *   DATABASE on it. `process.env` is the channel: jest gives every file a fresh module registry
 *   (a module-level singleton would be re-created per file), and the environment crosses that
 *   boundary and the one into worker processes.
 * Bounds:    disk cost and process count, not memory. What keeps memory flat across files is
 *   freeing each file when it ends (`tests/support/test-environment.ts`).
 * Isolation: a database name per file keeps files apart, `clearAll` empties collections between
 *   cases, and `disconnect` drops the file's database on the way out.
 *
 * @see docs/build/mutation-testing-memory.md#the-bson-warning-sign
 */
export const connect = async () => {
    const uri = process.env.NODE_TEST_MONGO_URI;
    if (!uri)
        throw new Error(
            'NODE_TEST_MONGO_URI is unset — tests/support/global-setup.ts starts the shared ' +
                'in-memory Mongo and publishes it. Run through jest, which is wired to it in ' +
                'jest.config.js (`globalSetup`), rather than importing this module directly.'
        );

    // The same Mongoose settings `start()` applies in every real process.
    configureMongoose();

    // Unique per call, and `connect` is called once per file, so this is effectively per-file.
    await mongoose.connect(uri, {
        dbName: `test-${randomUUID().slice(0, 8)}`,
        ...JEST_DRIVER_OPTIONS,
        ...COMMAND_MONITORING
    });
    observeDatabaseCommands(mongoose.connection);

    /**
     * Wait for every registered model's indexes to exist before the first case runs.
     *
     * Mongoose builds indexes in the background, so `connect()` resolving does not mean a unique
     * index is enforcing anything yet. Connecting to an already-running server is immediate, with
     * none of the second or two a per-file `MongoMemoryServer` would cost — and that gap is exactly
     * long enough to hide the race by accident. Without this wait, `enforces email uniqueness at
     * the database level` inserts a duplicate that succeeds, intermittently and only under parallel
     * workers.
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

/** Empties every collection without dropping the database or closing the connection. */
export const clearAll = async () => {
    const { collections } = mongoose.connection;
    for (const value of Object.values(collections)) {
        await value.deleteMany({});
    }
};
