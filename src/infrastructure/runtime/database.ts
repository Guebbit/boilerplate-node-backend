/**
 * @module
 * MongoDB connection lifecycle. The demo profile's snapshot machinery (empty, capture, restore) is
 * `scenarios/support/database-snapshot.ts` — a different concern, needed by only two callers.
 *
 * See: docs/tools/mongodb-mongoose.md
 */

// Mongoose is the ODM over the MongoDB driver. Importing the default export gives the
// *singleton* — `mongoose.connect()` mutates global state, so any file that
// `import`s `mongoose` finds the same live connection.
import mongoose from 'mongoose';
import type { ClientSession } from 'mongoose';
import { logger } from '@infrastructure/adapters/logger';
import { databaseConfig, isRelaxedEnvironment } from '@infrastructure/runtime/config';
import { applyMongooseDefaults } from '@infrastructure/runtime/mongoose-defaults';

/** Give up after this many attempts so a misconfigured URI fails the deploy instead of retrying forever. */
const MAX_RETRIES = 10;

/** First backoff delay; each subsequent attempt doubles it (1s, 2s, 4s, …). */
const BASE_DELAY_MS = 1000;

/**
 * MongoDB's server error code for a failed authentication. Retrying the same credentials cannot
 * succeed, and each attempt waits out a full server selection first.
 * https://www.mongodb.com/docs/manual/reference/error-codes/
 */
const AUTHENTICATION_FAILED = 18;

/**
 * Whether a connect failure is one only a configuration change fixes — a URI that does not
 * parse, or credentials the server refuses. Those fail the boot at once instead of after the
 * whole retry budget (minutes, each attempt waiting out server selection).
 *
 * @param error - what `mongoose.connect()` rejected with
 */
export const isPermanentConnectError = (error: unknown): boolean => {
    const { name, code } = (error ?? {}) as { name?: unknown; code?: unknown };
    return (
        name === 'MongoParseError' ||
        name === 'MongoInvalidArgumentError' ||
        code === AUTHENTICATION_FAILED
    );
};

/**
 * The server-side time limit for a scheduled job's queries, in ms. A reaper or a sweep scans more
 * than a request ever does, so it gets minutes where a request gets seconds
 * (`NODE_MONGO_MAX_TIME_MS`), but still a ceiling: a job stuck behind a hung query is not one that
 * can be noticed.
 */
export const JOB_MAX_TIME_MS = 600_000;

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
 * `tests/unit/scripts/db/host-scripts.test.ts` pins the behaviour the `host` script depends on.
 */
export const getDatabaseUri = () => {
    // A full URI wins outright — it may carry credentials or options the fragments cannot express.
    const config = databaseConfig();
    if (config.NODE_DB_URI) return config.NODE_DB_URI;

    return `mongodb://${config.NODE_MONGODB_HOST}:${String(config.NODE_MONGODB_PORT)}/${config.NODE_MONGODB_NAME}`;
};

/**
 * Apply this process's Mongoose settings, once, before the first query.
 *
 * `autoIndex` goes off in production, `maxTimeMS` is set for every query. Both are Mongoose GLOBAL
 * options, read when a query runs rather than when a schema compiles, so there is no load order to
 * get wrong: no entry point can build a model "too early" for them.
 *
 * `maxTimeMS` is attached to every query and aggregate that did not set its own, and a query that
 * did (even `0`, "no limit") keeps it. It cannot reach `save`, `insertMany`, `bulkWrite` or a raw
 * `collection.*` call: those are writes (accepted, a comment at each site) or set a limit by hand.
 * https://mongoosejs.com/docs/api/mongoose.html#Mongoose.prototype.set()
 * https://www.mongodb.com/docs/manual/reference/method/cursor.maxTimeMS/
 *
 * @param maxTimeMs - the limit for queries naming none; defaults to `NODE_MONGO_MAX_TIME_MS`
 */
export const configureMongoose = (
    maxTimeMs: number = databaseConfig().NODE_MONGO_MAX_TIME_MS
): void => {
    // Also set by `mongoose-boot` at the entry; repeated here for a caller that skips the entry.
    applyMongooseDefaults();
    if (!isRelaxedEnvironment()) mongoose.set('autoIndex', false);
    mongoose.set('maxTimeMS', maxTimeMs);
};

/**
 * Connect to MongoDB with exponential-backoff retry, capped at 30s; throws once attempts run out.
 *
 * Exists for orchestrated environments: when the API container starts alongside the database
 * container, the first few connects legitimately fail while Mongo is still initialising.
 *
 * Turns `autoIndex` off in production, before connecting — every entry point that calls this
 * (the server, every cron script) shares the guard, not only the ones that go through
 * `createApp()`'s `boot`. Never turns it on: `scripts/db/sync-indexes.ts` already ran `false` in
 * production, and dev/test keep Mongoose's own default (on), which is what gives the test suites
 * their constraints for free. https://mongoosejs.com/docs/guide.html#autoIndex
 *
 * @param maxTimeMs - the per-query time limit, see {@link configureMongoose}; a scheduled job passes
 *   {@link JOB_MAX_TIME_MS} through {@link startJob}
 */
export const start = (maxTimeMs?: number) => {
    configureMongoose(maxTimeMs);

    // Recursive rather than a `for` loop so each retry chains onto the previous promise
    // without `async`/`await` — this codebase stays on explicit promise chains throughout.
    const attemptConnect = (attempt: number): Promise<void> =>
        // `mongoose.connect()` resolves once the driver has completed the handshake. It also
        // sets `mongoose.connection`, so everything else in the app is wired up as a side effect.
        mongoose.connect(getDatabaseUri()).then(
            // Swallow the resolved Mongoose instance: callers only need "connected", not the handle.
            () => undefined,
            (error: unknown) => {
                if (isPermanentConnectError(error))
                    throw new Error('DB connection refused by configuration; not retrying.', {
                        cause: error
                    });
                // Budget exhausted — propagate so the boot sequence aborts the process.
                if (attempt >= MAX_RETRIES - 1)
                    throw new Error(`DB connection failed after ${MAX_RETRIES} attempts`, {
                        cause: error
                    });
                // Exponential backoff (2^attempt), clamped at 30s so late attempts stay responsive
                // once the database finally comes up.
                const delayMs = Math.min(BASE_DELAY_MS * 2 ** attempt, 30_000);
                // Stryker disable all
                logger.warn({
                    message: `DB not ready, retrying in ${delayMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
                    error
                });
                // Stryker restore all
                return wait(delayMs).then(() => attemptConnect(attempt + 1));
            }
        );

    watchConnection();
    return attemptConnect(0);
};

/**
 * {@link start}, for a scheduled job (a reaper, a sweep, a one-shot setup script): the same
 * connection with the longer per-query limit {@link JOB_MAX_TIME_MS}.
 */
export const startJob = () => start(JOB_MAX_TIME_MS);

/** Whether {@link watchConnection} already attached its listeners — `start()` can run again. */
let watching = false;

/** True while {@link stopDatabase} closes the pool, so its own `disconnected` is not reported as a loss. */
let stopping = false;

/**
 * Log the connection dropping and coming back. The driver reconnects on its own and says nothing,
 * so without these a Mongo outage mid-run leaves no trace but the requests it failed.
 * https://mongoosejs.com/docs/connections.html#connection-events
 */
const watchConnection = (): void => {
    if (watching) return;
    watching = true;
    // Stryker disable all
    mongoose.connection.on('disconnected', () => {
        if (!stopping) logger.warn('MongoDB connection lost.');
    });
    mongoose.connection.on('reconnected', () => logger.info('MongoDB connection restored.'));
    // Stryker restore all
};

/**
 * Shutdown should try to release the driver cleanly, but disconnect failures are not recoverable work.
 *
 * `mongoose.disconnect()` closes every pooled socket so Mongo does not keep the sessions
 * open until they time out. Rejections are logged and absorbed: we are already exiting, and
 * throwing here would abort the remaining teardown steps in the shutdown chain.
 */
export const stopDatabase = () => {
    stopping = true;
    return mongoose
        .disconnect()
        .then(
            () => undefined,
            (error: unknown) => {
                // Stryker disable all
                logger.warn({
                    message: 'MongoDB disconnect failed.',
                    error
                });
                // Stryker restore all
            }
        )
        .finally(() => {
            stopping = false;
        });
};

/**
 * The active Mongoose connection. Available after `start()` resolves.
 *
 * Exported for readiness probes and diagnostics, which read `connection.readyState` (0
 * disconnected / 1 connected / 2 connecting / 3 disconnecting). The object exists at import
 * time and is populated by `connect()`, so grabbing the reference before `start()` runs is safe.
 */
export const { connection } = mongoose;

/**
 * Runs `fn` inside a MongoDB multi-document transaction, retrying it on a transient error the
 * driver itself flags as safe to retry (a stepdown, a network blip) per MongoDB's own recommended
 * transaction pattern. `fn` must only touch the database through calls that take `{ session }` —
 * a write made without it is not part of the transaction and will not roll back with the rest.
 * https://mongoosejs.com/docs/transactions.html
 *
 * Requires a replica set: a standalone `mongod` refuses `startTransaction()` outright.
 * Every entry point that reaches this — the server, every cron script, `mongodb-memory-server`'s
 * test double — runs one; see `scenarios/support/ephemeral-mongod.ts` and `docker-compose.yml`.
 *
 * @param work - the work to run inside the transaction, given the session to pass to every write
 * @returns whatever `work` resolved with, once the transaction has committed
 */
export const withTransaction = <T>(work: (session: ClientSession) => Promise<T>): Promise<T> =>
    connection.transaction(work);
