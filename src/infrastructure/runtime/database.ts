/**
 * MongoDB connection lifecycle.
 *
 * See: docs/tools/mongodb-mongoose.md
 */

// Mongoose is the ODM (Object Document Mapper) over the official MongoDB driver: it adds
// schemas, validation and middleware. Importing the default export gives the *singleton* —
// `mongoose.connect()` mutates global state, which is why models elsewhere can just
// `import mongoose from 'mongoose'` and find the same live connection.
import mongoose from 'mongoose';
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
 * Accept either a full Mongo URI or host/port/database fragments so local and hosted setups share one code path.
 *
 * Managed providers (Atlas, Railway, …) hand you a single credential-bearing URI, while
 * docker-compose setups are easier to express as separate host/port values. Precedence is
 * URI first, so a deployment can override a baked-in default with one variable.
 *
 * Note the truthiness check rather than a `!== undefined` one: an EMPTY `NODE_DB_URI` falls
 * through to the fragments deliberately, and that is load-bearing. It is how the `:host` npm
 * scripts reach a containerised database from the host — they blank the URI and override only
 * `NODE_MONGODB_HOST`, so the database NAME keeps coming from `.env` instead of being spelled
 * out a second time in `package.json`, where it can drift and seed the wrong database.
 *
 * Exported for `migrate-mongo-config.js`, which cannot import this module — it is CommonJS,
 * loaded by migrate-mongo's own resolver, and this file is TypeScript. It reimplements these
 * five lines, and `tests/unit/db/host-scripts.test.ts` asserts the two never disagree.
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
 * Connect to MongoDB with exponential-backoff retry.
 * Each failed attempt doubles the delay, capped at 30 seconds.
 * Throws if all attempts are exhausted.
 *
 * The retry loop exists for orchestrated environments: when the API container starts
 * alongside the database container, the first few connects legitimately fail while Mongo
 * is still initialising. Backing off (rather than crash-looping) keeps startup logs readable.
 */
export const start = () => {
    // Recursive rather than a `for` loop so each retry chains onto the previous promise
    // without `async`/`await` — this codebase stays on explicit promise chains throughout.
    const attemptConnect = (attempt: number): Promise<void> =>
        // `mongoose.connect()` resolves once the driver has completed the handshake. It also
        // sets `mongoose.connection`, so everything else in the app is wired up as a side effect.
        mongoose.connect(getDatabaseUri()).then(
            // Swallow the resolved Mongoose instance: callers only need "connected", not the handle.
            () => {},
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
        () => {},
        (error: unknown) => {
            logger.warn({
                message: 'MongoDB disconnect failed.',
                // Narrow `unknown` before touching `.message`: anything can be thrown in JS.
                error: error instanceof Error ? error.message : String(error)
            });
        }
    );

/**
 * The active Mongoose connection.
 * Available after `start()` resolves.
 *
 * Exported for readiness probes and diagnostics, which read `connection.readyState`
 * (0 disconnected / 1 connected / 2 connecting / 3 disconnecting). The object exists
 * immediately at import time and is populated by `connect()`, so grabbing the reference
 * before `start()` runs is safe.
 */
export const connection = mongoose.connection;
