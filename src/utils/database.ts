import mongoose from 'mongoose';
import { logger } from './winston';
import { mongoQueryDurationMs, mongoQueryTotal, mongoQueryErrorsTotal } from './domain-metrics';

const MAX_RETRIES = 10;

/**
 * Mongoose operations tracked for timing metrics.
 * Covers the most common query types; aggregate/save/remove are included separately.
 */
const TRACKED_OPS = [
    'find',
    'findOne',
    'findOneAndUpdate',
    'findOneAndDelete',
    'updateOne',
    'updateMany',
    'deleteOne',
    'deleteMany',
    'countDocuments',
    'estimatedDocumentCount'
] as const;

/**
 * Global Mongoose plugin — measures query duration for every schema.
 *
 * Must be registered before any mongoose.model() call.
 * database.ts is imported by app.ts before routes/models, so the ordering is correct.
 *
 * Each pre-hook saves a high-resolution start time on `this` (the Query).
 * Each post-hook reads it, computes elapsed ms, and records the histogram.
 */
mongoose.plugin((schema: mongoose.Schema) => {
    for (const op of TRACKED_OPS) {
        schema.pre(op, function (this: mongoose.Query<unknown, unknown>) {
            (this as mongoose.Query<unknown, unknown> & { _metricsStart: bigint })._metricsStart =
                process.hrtime.bigint();
        });

        schema.post(op, function (this: mongoose.Query<unknown, unknown>) {
            const q = this as mongoose.Query<unknown, unknown> & { _metricsStart?: bigint };
            if (q._metricsStart === undefined) return;
            const durationMs = Number(process.hrtime.bigint() - q._metricsStart) / 1_000_000;
            const collection = this.model?.collection?.name ?? 'unknown';
            mongoQueryDurationMs.labels(collection, op).observe(durationMs);
            mongoQueryTotal.labels(collection, op).inc();
        });
    }

    // save / validate / remove use document middleware — `this` is the document
    schema.pre('save', function (this: mongoose.Document) {
        (this as mongoose.Document & { _metricsStart: bigint })._metricsStart =
            process.hrtime.bigint();
    });
    schema.post('save', function (this: mongoose.Document) {
        const document_ = this as mongoose.Document & { _metricsStart?: bigint };
        if (document_._metricsStart === undefined) return;
        const durationMs = Number(process.hrtime.bigint() - document_._metricsStart) / 1_000_000;
        const collection = (this as { collection?: { name?: string } }).collection?.name ?? 'unknown';
        mongoQueryDurationMs.labels(collection, 'save').observe(durationMs);
        mongoQueryTotal.labels(collection, 'save').inc();
    });

    // Capture query-level errors too
    schema.post(/.*/, function (_result: unknown, next: (error?: mongoose.CallbackError) => void) {
        next();
    });
});

/**
 * Connection-level error handler for query execution errors.
 * Fires for driver-level failures such as network drops during a query.
 */
mongoose.connection.on('error', () => {
    mongoQueryErrorsTotal.labels('connection', 'error').inc();
});

const BASE_DELAY_MS = 1000;
const DEFAULT_DATABASE_NAME = 'boilerplate-node-backend';

/**
 * Backoff delays should yield to the event loop instead of blocking the whole process.
 */
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Accept either a full Mongo URI or host/port/database fragments so local and hosted setups share one code path.
 */
const getDatabaseUri = () => {
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
 */
export const start = () => {
    const attemptConnect = (attempt: number): Promise<void> =>
        mongoose.connect(getDatabaseUri()).then(
            () => {},
            () => {
                if (attempt >= MAX_RETRIES - 1)
                    throw new Error(`DB connection failed after ${MAX_RETRIES} attempts`);
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
 */
export const stopDatabase = () =>
    mongoose.disconnect().then(
        () => {},
        (error: unknown) => {
            logger.warn({
                message: 'MongoDB disconnect failed.',
                error: error instanceof Error ? error.message : String(error)
            });
        }
    );

/**
 * The active Mongoose connection.
 * Available after `start()` resolves.
 */
export const connection = mongoose.connection;
