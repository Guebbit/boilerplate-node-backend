/**
 * Domain-level and database-level Prometheus metrics.
 *
 * Business counters let you alert on funnel health
 * (e.g. login failure spike, checkout abandonment).
 *
 * DB counters let you catch query regressions
 * without full APM tooling.
 */

import type { Schema, Query as MongooseQuery, MongooseDefaultQueryMiddleware } from 'mongoose';
import { Counter, Histogram } from 'prom-client';
import {
    SEMATTRS_DB_SYSTEM,
    SEMATTRS_DB_OPERATION,
    SEMATTRS_DB_MONGODB_COLLECTION
} from '@opentelemetry/semantic-conventions';
import { metricsRegistry } from './observability';
import { getTracer } from './tracer';

// ─── Auth metrics ─────────────────────────────────────────────────────────────

/** Login attempts split by outcome (success / failure). */
export const authLoginTotal = new Counter({
    name: 'auth_login_total',
    help: 'Total login attempts, labelled by outcome.',
    labelNames: ['status'] as const,
    registers: [metricsRegistry]
});

/** Sign-up attempts split by outcome. */
export const authSignupTotal = new Counter({
    name: 'auth_signup_total',
    help: 'Total sign-up attempts, labelled by outcome.',
    labelNames: ['status'] as const,
    registers: [metricsRegistry]
});

/** Password-reset request attempts (initial request only). */
export const authPasswordResetTotal = new Counter({
    name: 'auth_password_reset_total',
    help: 'Total password-reset request attempts.',
    labelNames: ['status'] as const,
    registers: [metricsRegistry]
});

/** Refresh-token operations. */
export const authRefreshTotal = new Counter({
    name: 'auth_refresh_total',
    help: 'Total token-refresh attempts, labelled by outcome.',
    labelNames: ['status'] as const,
    registers: [metricsRegistry]
});

/** Expired-token cleanup runs (admin endpoint). */
export const authTokenCleanupTotal = new Counter({
    name: 'auth_token_cleanup_total',
    help: 'Total expired-token cleanup operations.',
    registers: [metricsRegistry]
});

// ─── Cart / checkout metrics ─────────────────────────────────────────────────

/** Checkout (cart → order) attempts. */
export const cartCheckoutTotal = new Counter({
    name: 'cart_checkout_total',
    help: 'Total checkout attempts, labelled by outcome.',
    labelNames: ['status'] as const,
    registers: [metricsRegistry]
});

// ─── Order metrics ────────────────────────────────────────────────────────────

/** Admin-created orders. */
export const orderCreatedTotal = new Counter({
    name: 'order_created_total',
    help: 'Total orders created.',
    registers: [metricsRegistry]
});

// ─── Database metrics ─────────────────────────────────────────────────────────

/** Total Mongoose queries by collection and operation. */
export const databaseQueryTotal = new Counter({
    name: 'db_query_total',
    help: 'Total Mongoose queries executed.',
    labelNames: ['collection', 'operation'] as const,
    registers: [metricsRegistry]
});

/** Duration of Mongoose queries in seconds. */
export const databaseQueryDuration = new Histogram({
    name: 'db_query_duration_seconds',
    help: 'Duration of Mongoose queries in seconds.',
    labelNames: ['collection', 'operation'] as const,
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
    registers: [metricsRegistry]
});

/** Failed Mongoose queries. */
export const databaseErrorsTotal = new Counter({
    name: 'db_errors_total',
    help: 'Total Mongoose query errors.',
    labelNames: ['collection', 'operation'] as const,
    registers: [metricsRegistry]
});

// ─── Mongoose plugin ──────────────────────────────────────────────────────────

/**
 * Mongoose schema plugin that records query duration and error counts.
 * Register with mongoose.plugin() before schemas are defined.
 */

// These ops map to the MongooseDefaultQueryMiddleware union type.
const QUERY_OPS: MongooseDefaultQueryMiddleware[] = [
    'find',
    'findOne',
    'findOneAndUpdate',
    'findOneAndDelete',
    'deleteOne',
    'deleteMany',
    'countDocuments',
    'updateOne',
    'updateMany'
];

// WeakMap keeps start times without preventing GC of Query objects.
const queryStartTimes = new WeakMap<object, number>();
// WeakMap keeps active OTel spans keyed on the same Query/Document object.
const querySpans = new WeakMap<object, ReturnType<ReturnType<typeof getTracer>['startSpan']>>();

// Runtime Query shape not fully reflected in Mongoose types; used internally for safe property access.
interface IMongooseQueryInternal {
    mongooseCollection?: { name?: string };
    op?: string;
}

/** Extract collection name from a Mongoose Query object. */
const getCollectionName = (query: MongooseQuery<unknown, unknown>): string =>
    (query as IMongooseQueryInternal).mongooseCollection?.name ?? 'unknown';

/** Extract the operation name from a Mongoose Query object. */
const getOperation = (query: MongooseQuery<unknown, unknown>): string =>
    (query as IMongooseQueryInternal).op ?? 'query';

export const mongooseMetricsPlugin = (schema: Schema): void => {
    // ── Query pre hook: record start time + open OTel span ────────────────
    schema.pre<MongooseQuery<unknown, unknown>>(QUERY_OPS, function () {
        queryStartTimes.set(this, Date.now());
        // Start a child span for this DB operation.
        const collection = getCollectionName(this);
        const operation = getOperation(this);
        const span = getTracer().startSpan(`db.${collection}.${operation}`, {
            attributes: {
                [SEMATTRS_DB_SYSTEM]: 'mongodb',
                [SEMATTRS_DB_OPERATION]: operation,
                [SEMATTRS_DB_MONGODB_COLLECTION]: collection
            }
        });
        querySpans.set(this, span);
    });

    // ── Query post hook: record duration, end span ─────────────────────────
    schema.post<MongooseQuery<unknown, unknown>>(QUERY_OPS, function (_result, next) {
        const collection = getCollectionName(this);
        const operation = getOperation(this);
        const startMs = queryStartTimes.get(this);
        if (startMs !== undefined) {
            databaseQueryDuration.observe({ collection, operation }, (Date.now() - startMs) / 1000);
            queryStartTimes.delete(this);
        }
        databaseQueryTotal.inc({ collection, operation });
        // End the OTel span (success path).
        querySpans.get(this)?.end();
        querySpans.delete(this);
        next();
    });

    // ── Query error hook: increment error counter, record error on span ───
    // The 3-argument form (error, result, next) is the Mongoose error-handling post hook.
    schema.post<MongooseQuery<unknown, unknown>>(
        QUERY_OPS,
        function (error: Error, _result: unknown, next: (error?: Error) => void) {
            const collection = getCollectionName(this);
            const operation = getOperation(this);
            databaseErrorsTotal.inc({ collection, operation });
            // Record the error on the span before ending it.
            const span = querySpans.get(this);
            if (span) {
                span.recordException(error);
                span.end();
                querySpans.delete(this);
            }
            next(error);
        }
    );

    // ── Document save pre hook ─────────────────────────────────────────────
    schema.pre('save', function () {
        queryStartTimes.set(this, Date.now());
        const collection =
            (this.constructor as { collection?: { name?: string } }).collection?.name ?? 'unknown';
        const span = getTracer().startSpan(`db.${collection}.save`, {
            attributes: {
                [SEMATTRS_DB_SYSTEM]: 'mongodb',
                [SEMATTRS_DB_OPERATION]: 'save',
                [SEMATTRS_DB_MONGODB_COLLECTION]: collection
            }
        });
        querySpans.set(this, span);
    });

    // ── Document save post hook ────────────────────────────────────────────
    schema.post('save', function (_document, next) {
        const collection =
            (this.constructor as { collection?: { name?: string } }).collection?.name ?? 'unknown';
        const startMs = queryStartTimes.get(this);
        if (startMs !== undefined) {
            databaseQueryDuration.observe(
                { collection, operation: 'save' },
                (Date.now() - startMs) / 1000
            );
            queryStartTimes.delete(this);
        }
        databaseQueryTotal.inc({ collection, operation: 'save' });
        querySpans.get(this)?.end();
        querySpans.delete(this);
        next();
    });

    // ── Document save error hook ───────────────────────────────────────────
    schema.post('save', function (error: Error, _document: unknown, next: (error?: Error) => void) {
        const collection =
            (this.constructor as { collection?: { name?: string } }).collection?.name ?? 'unknown';
        databaseErrorsTotal.inc({ collection, operation: 'save' });
        const span = querySpans.get(this);
        if (span) {
            span.recordException(error);
            span.end();
            querySpans.delete(this);
        }
        next(error);
    });
};
