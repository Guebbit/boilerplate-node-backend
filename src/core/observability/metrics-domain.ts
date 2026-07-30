/**
 * Domain (business) metrics.
 *
 * All `Counter`s, all sharing one `status` label convention, all registered on the same registry
 * as the HTTP metrics so a single `/metrics` scrape carries both.
 *
 * Why these exist as metrics at all, given the same events are already audited and sent to
 * analytics: each signal answers a different question at a different cost. Analytics is for
 * per-user product funnels, audit is the per-event compliance record, and these counters are
 * cheap always-on aggregates you can *alert* on — "signup failure ratio above 20% for 5
 * minutes" needs a counter, not a query over an event store.
 *
 * The `status` label (typically 'success' / 'failure') is what makes each counter usable as
 * both a volume and a success-ratio signal.
 */

import { Counter } from 'prom-client';
// Same registry as the HTTP metrics — importing it rather than calling prom-client's `register`
// directly keeps the single-registry decision visible.
import { metricsRegistry } from '@core/observability/metrics-http';

/** Business counters that you cannot derive from traces alone. */
// Database/HTTP/runtime metrics live elsewhere (OTel mongoose spans, observability.ts).
// Traces are sampled and short-lived, so they cannot answer "how many signups today" —
// which is precisely the gap these counters fill.

/**
 * Login attempts split by outcome (success / failure)
 * The failure series is the security-relevant one: a sudden spike suggests credential stuffing.
 */
export const authLoginTotal = new Counter({
    // Prometheus naming: `<domain>_<subject>_total` for a counter.
    name: 'auth_login_total',
    help: 'Total login attempts, labelled by outcome.',
    // `as const` narrows the label names to literals, so `inc({ status })` is type-checked
    // against them instead of accepting any string key.
    labelNames: ['status'] as const,
    registers: [metricsRegistry]
});

/**
 * Sign-up attempts split by outcome.
 * Top-of-funnel volume, and a failure rate that catches a broken registration flow faster
 * than a user report would.
 */
export const authSignupTotal = new Counter({
    name: 'auth_signup_total',
    help: 'Total sign-up attempts, labelled by outcome.',
    labelNames: ['status'] as const,
    registers: [metricsRegistry]
});

/**
 * Password-reset request attempts (initial request only).
 * "Initial request only" matters: this counts the *request* for a reset link, not the
 * confirmation step, so the two cannot be conflated when reading the funnel.
 */
export const authPasswordResetTotal = new Counter({
    name: 'auth_password_reset_total',
    help: 'Total password-reset request attempts.',
    labelNames: ['status'] as const,
    registers: [metricsRegistry]
});

/**
 * Refresh-token operations.
 * Rising failures here mean sessions are being dropped — users get logged out unexpectedly,
 * which rarely shows up as an explicit error report.
 */
export const authRefreshTotal = new Counter({
    name: 'auth_refresh_total',
    help: 'Total token-refresh attempts, labelled by outcome.',
    labelNames: ['status'] as const,
    registers: [metricsRegistry]
});

/**
 * Expired-token cleanup runs (admin endpoint).
 * Note: no `labelNames` — a maintenance job either ran or did not, so there is no outcome
 * dimension worth slicing by. Useful mainly to confirm the job is still running at all.
 */
export const authTokenCleanupTotal = new Counter({
    name: 'auth_token_cleanup_total',
    help: 'Total expired-token cleanup operations.',
    registers: [metricsRegistry]
});

/**
 * Account deletion request attempts.
 * A churn signal, and one with regulatory weight (GDPR erasure requests).
 */
export const authAccountDeleteTotal = new Counter({
    name: 'auth_account_delete_total',
    help: 'Total account-deletion request attempts.',
    labelNames: ['status'] as const,
    registers: [metricsRegistry]
});

/**
 * Checkout (cart → order) attempts.
 * The most revenue-critical counter here: a rising failure ratio means money is not being
 * taken, and it warrants a page rather than a dashboard glance.
 */
export const cartCheckoutTotal = new Counter({
    name: 'cart_checkout_total',
    help: 'Total checkout attempts, labelled by outcome.',
    labelNames: ['status'] as const,
    registers: [metricsRegistry]
});

/**
 * Admin-created orders.
 * Unlabelled: these are created directly by staff, so there is no user-facing failure mode to
 * distinguish. Kept separate from `cartCheckoutTotal` so manual orders do not distort the
 * customer checkout success rate.
 */
export const orderCreatedTotal = new Counter({
    name: 'order_created_total',
    help: 'Total orders created.',
    registers: [metricsRegistry]
});
