import { Counter, Histogram } from 'prom-client';

// ─── Auth counters ────────────────────────────────────────────────────────────

/** Successful logins. Use the ratio against failure to compute success rate. */
export const loginSuccessTotal = new Counter({
    name: 'auth_login_success_total',
    help: 'Total number of successful login attempts.'
});

/** Failed logins (wrong password, unknown user, etc.). */
export const loginFailureTotal = new Counter({
    name: 'auth_login_failure_total',
    help: 'Total number of failed login attempts.'
});

/** New user registrations. */
export const signupTotal = new Counter({
    name: 'auth_signup_total',
    help: 'Total number of new user registrations.'
});

// ─── Cart / checkout counters ─────────────────────────────────────────────────

/** Checkouts that produced an order successfully. */
export const checkoutSuccessTotal = new Counter({
    name: 'cart_checkout_success_total',
    help: 'Total number of successful cart checkouts.'
});

/** Checkouts that failed (empty cart, validation, etc.). */
export const checkoutFailureTotal = new Counter({
    name: 'cart_checkout_failure_total',
    help: 'Total number of failed cart checkout attempts.'
});

// ─── Order counters ───────────────────────────────────────────────────────────

/** Every time an order document is created (cart checkout or admin POST /orders). */
export const orderCreatedTotal = new Counter({
    name: 'order_created_total',
    help: 'Total number of orders created.'
});

// ─── MongoDB query metrics ────────────────────────────────────────────────────

/**
 * Per-collection, per-operation query duration.
 * Labels keep cardinality low: only collection name and operation type.
 * Use this histogram for slow-query detection and per-collection latency dashboards.
 */
export const mongoQueryDurationMs = new Histogram({
    name: 'mongodb_query_duration_milliseconds',
    help: 'MongoDB query duration in milliseconds.',
    labelNames: ['collection', 'operation'] as const,
    buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000]
});

/** Total queries executed — pair with the histogram to compute throughput. */
export const mongoQueryTotal = new Counter({
    name: 'mongodb_queries_total',
    help: 'Total number of MongoDB queries executed.',
    labelNames: ['collection', 'operation'] as const
});

/** Queries that raised an error at the driver layer. */
export const mongoQueryErrorsTotal = new Counter({
    name: 'mongodb_query_errors_total',
    help: 'Total number of MongoDB query errors.',
    labelNames: ['collection', 'operation'] as const
});
