/**
 * @module
 * MongoDB connection lifecycle.
 *
 * See: docs/tools/mongodb-mongoose.md
 */

// Mongoose is the ODM over the MongoDB driver. Importing the default export gives the
// *singleton* — `mongoose.connect()` mutates global state, so any file that
// `import`s `mongoose` finds the same live connection.
import mongoose from 'mongoose';
// The driver's own raw-document type, for the copy helpers at the bottom of this file: what
// `collection.find()` yields and `collection.insertMany()` takes, with no Mongoose hydration
// in between. https://mongodb.github.io/node-mongodb-native/
import type { Document } from 'mongodb';
import { logger } from '@infrastructure/adapters/logger';

/** Give up after this many attempts so a misconfigured URI fails the deploy instead of retrying forever. */
const MAX_RETRIES = 10;

/** First backoff delay; each subsequent attempt doubles it (1s, 2s, 4s, …). */
const BASE_DELAY_MS = 1000;

/** Fallback database name when only host/port are configured. */
const DEFAULT_DATABASE_NAME = 'boilerplate-node-backend';

/**
 * Backoff delays should yield to the event loop instead of blocking the whole process.
 *
 * Promisified `setTimeout` — a busy-wait loop here would freeze the event loop and, in a
 * container, block the health-check endpoint from ever answering.
 */
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Accept either a full Mongo URI or host/port/database fragments, URI taking precedence.
 *
 * The truthiness check (not `!== undefined`) is load-bearing: an EMPTY `NODE_DB_URI` falls
 * through to the fragments on purpose. That's how `npm run host` reaches a containerised
 * database from the host — it blanks the URI and overrides only `NODE_MONGODB_HOST`, so the
 * database name still comes from `.env` instead of drifting in `package.json`.
 *
 * `tests/unit/db/host-scripts.test.ts` pins the behaviour the `host` script depends on.
 */
export const getDatabaseUri = () => {
    // A full URI wins outright — it may carry credentials or options the fragments cannot express.
    if (process.env.NODE_DB_URI) return process.env.NODE_DB_URI;

    const host = process.env.NODE_MONGODB_HOST ?? '127.0.0.1';
    const port = process.env.NODE_MONGODB_PORT ?? '27017';
    const databaseName = process.env.NODE_MONGODB_NAME ?? DEFAULT_DATABASE_NAME;
    return `mongodb://${host}:${port}/${databaseName}`;
};

/**
 * Connect to MongoDB with exponential-backoff retry, capped at 30s; throws once attempts run out.
 *
 * Exists for orchestrated environments: when the API container starts alongside the database
 * container, the first few connects legitimately fail while Mongo is still initialising.
 *
 * Does not touch `autoIndex` — a caller with its own requirement (`db/sync-indexes.ts` turns it
 * off before calling this; `src/app.ts`'s `startServer` turns it off in production) sets it before
 * calling `start()`, and this shared connection helper has no opinion of its own to override that.
 */
export const start = () => {
    // Recursive rather than a `for` loop so each retry chains onto the previous promise
    // without `async`/`await` — this codebase stays on explicit promise chains throughout.
    const attemptConnect = (attempt: number): Promise<void> =>
        // `mongoose.connect()` resolves once the driver has completed the handshake. It also
        // sets `mongoose.connection`, so everything else in the app is wired up as a side effect.
        mongoose.connect(getDatabaseUri()).then(
            // Swallow the resolved Mongoose instance: callers only need "connected", not the handle.
            () => undefined,
            () => {
                // Budget exhausted — propagate so the boot sequence aborts the process.
                if (attempt >= MAX_RETRIES - 1)
                    throw new Error(`DB connection failed after ${MAX_RETRIES} attempts`);
                // Exponential backoff (2^attempt), clamped at 30s so late attempts stay responsive
                // once the database finally comes up.
                const delayMs = Math.min(BASE_DELAY_MS * 2 ** attempt, 30_000);
                logger.warn(
                    `DB not ready, retrying in ${delayMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
                );
                return wait(delayMs).then(() => attemptConnect(attempt + 1));
            }
        );

    return attemptConnect(0);
};

/**
 * Shutdown should try to release the driver cleanly, but disconnect failures are not recoverable work.
 *
 * `mongoose.disconnect()` closes every pooled socket so Mongo does not keep the sessions
 * open until they time out. Rejections are logged and absorbed: we are already exiting, and
 * throwing here would abort the remaining teardown steps in the shutdown chain.
 */
export const stopDatabase = () =>
    mongoose.disconnect().then(
        () => undefined,
        (error: unknown) => {
            logger.warn({
                message: 'MongoDB disconnect failed.',
                // Narrow `unknown` before touching `.message`: anything can be thrown in JS.
                error: error instanceof Error ? error.message : String(error)
            });
        }
    );

/**
 * The active Mongoose connection. Available after `start()` resolves.
 *
 * Exported for readiness probes and diagnostics, which read `connection.readyState` (0
 * disconnected / 1 connected / 2 connecting / 3 disconnecting). The object exists at import
 * time and is populated by `connect()`, so grabbing the reference before `start()` runs is safe.
 */
export const { connection } = mongoose;

/**
 * Empty every collection, never drop the database.
 *
 * `dropDatabase()` looks like the obvious reset, but it clears each model's index build along
 * with the data — Mongoose only runs `Model.init()` at connect and at schema compile, neither of
 * which fires again after a drop. Everything a unique or TTL index enforces (duplicate-email
 * refusal, payment idempotency, cart expiry) is silently gone until the process restarts. Emptying
 * leaves every collection, and every index on it, exactly where `start()` built it.
 *
 * Used by `src/app/demo.ts`'s `restoreScenario` and `scenarios/apply.ts --reset` — the same bug,
 * against the same two callers, is why this is one helper rather than two.
 */
export const emptyDatabase = (): Promise<void> =>
    Promise.all(
        Object.values(connection.collections).map((collection) => collection.deleteMany({}))
    ).then(() => undefined);

/**
 * Whether every collection is empty.
 *
 * `scenarios/apply.ts`'s guard: the flows it runs are not idempotent — driving a checkout twice
 * makes two orders — so seeding on top of existing data is refused rather than attempted. Stops
 * at the first collection holding anything.
 */
export const isDatabaseEmpty = async (): Promise<boolean> => {
    for (const collection of Object.values(connection.collections))
        if ((await collection.countDocuments({}, { limit: 1 })) > 0) return false;
    return true;
};

/**
 * Every document in every collection, as plain BSON — the input {@link restoreDatabaseCopy} takes.
 *
 * Keyed by collection NAME rather than by model: the walk is over
 * `connection.collections`, so a collection no model claims (a migration's own bookkeeping, say)
 * is copied too. `Document` here is the driver's raw shape, not a Mongoose document — nothing
 * hydrates on the way out or on the way back in.
 */
export type DatabaseCopy = Readonly<Record<string, Document[]>>;

/**
 * Read the whole database into memory.
 *
 * Exists for `src/app/demo.ts`: a `shop` restore replays this copy instead of reseeding, which
 * skips the fourteen bcrypt cost-12 hashes and the whole HTTP flow run that produced the
 * scenario in the first place. Nothing else should reach for it — a copy of the database in a
 * process's heap is only affordable because the demo profile's database is small and disposable.
 */
export const captureDatabase = (): Promise<DatabaseCopy> =>
    Promise.all(
        Object.entries(connection.collections).map(([name, collection]) =>
            collection
                .find({})
                .toArray()
                .then((documents): [string, Document[]] => [name, documents])
        )
    ).then((entries) => Object.fromEntries(entries));

/**
 * Empty every collection and write `copy` back, exactly as {@link captureDatabase} read it.
 *
 * `insertMany` with `ordered: false`, so one rejected document does not abandon the rest of that
 * collection — the failure then names every problem rather than the first. Empty collections are
 * skipped: `insertMany([])` is an error in the driver, not a no-op.
 * https://www.mongodb.com/docs/manual/reference/method/db.collection.insertMany/
 *
 * MUST NOT run concurrently with itself — `src/app/demo.ts`'s restore queue is what guarantees
 * that. Two overlapping replays of the same copy collide on `_id`.
 */
export const restoreDatabaseCopy = (copy: DatabaseCopy): Promise<void> =>
    emptyDatabase()
        .then(() =>
            Promise.all(
                Object.entries(copy)
                    .filter(([, documents]) => documents.length > 0)
                    .map(([name, documents]) =>
                        connection.collection(name).insertMany(documents, { ordered: false })
                    )
            )
        )
        .then(() => undefined);
