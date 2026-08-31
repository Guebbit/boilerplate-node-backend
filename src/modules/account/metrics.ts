/**
 * @module
 * Domain counters this module owns, registered on the shared `metricsRegistry` so one
 * `/metrics` scrape carries these alongside the HTTP metrics.
 *
 * Nothing imports these to *read* them — `GET /observability/metrics/overview` resolves by
 * metric name off the registry, so deleting this module just zeroes its counters.
 *
 * Distinct from audit and analytics: these are cheap always-on aggregates meant to be
 * *alerted* on ("failure ratio above 20% for 5 minutes"), not queried per-user or per-event.
 * The `status` label is what makes each counter usable as both a volume and success-ratio signal.
 */

import { Counter } from 'prom-client';
import { metricsRegistry } from '@infrastructure/observability/metrics-http';

/**
 * Login attempts split by outcome (success / failure).
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
 * Authenticated password changes (the current-password flow, not the email reset).
 * Kept separate from `auth_password_reset_total` for the same reason that one excludes the
 * confirmation step: two flows in one counter cannot be read as a funnel. The failure series
 * doubles as a security signal — repeated wrong current passwords against a live session
 * suggests a hijacked device probing for the credential it does not have.
 */
export const authPasswordChangeTotal = new Counter({
    name: 'auth_password_change_total',
    help: 'Total authenticated password-change attempts, labelled by outcome.',
    labelNames: ['status'] as const,
    registers: [metricsRegistry]
});

/**
 * Email-verification confirmations (the token-spending step, not the send).
 * The send is not counted: it rides the email queue, whose own metrics say whether mail moves.
 * What no other signal answers is how many verification links actually get clicked — the
 * success/failure split here is the closest thing this stack has to a deliverability check.
 */
export const authEmailVerifyTotal = new Counter({
    name: 'auth_email_verify_total',
    help: 'Total email-verification confirmation attempts, labelled by outcome.',
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
