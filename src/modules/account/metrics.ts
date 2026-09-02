/**
 * @module
 * Domain counters this module owns, registered on the shared `metricsRegistry` so one `/metrics`
 * scrape carries these alongside the HTTP metrics. Nothing imports these to *read* them —
 * `GET /observability/metrics/overview` resolves by metric name off the registry. The `status`
 * label is what makes each counter usable as both a volume and success-ratio signal.
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
 * Kept separate from `auth_password_reset_total` since two flows in one counter cannot be read
 * as a funnel; the failure series also doubles as a security signal for a hijacked device
 * probing without the credential.
 */
export const authPasswordChangeTotal = new Counter({
    name: 'auth_password_change_total',
    help: 'Total authenticated password-change attempts, labelled by outcome.',
    labelNames: ['status'] as const,
    registers: [metricsRegistry]
});

/**
 * Step-up re-authentication attempts.
 * The failure series here is a sharper signal than a login failure: it means someone HOLDING a
 * live, valid session cannot produce the password behind it — a stolen-session probe, not a
 * mistyped credential from someone who was never signed in.
 */
export const authReauthTotal = new Counter({
    name: 'auth_reauth_total',
    help: 'Total step-up re-authentication attempts, labelled by outcome.',
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

/**
 * Two-factor enrollment confirmations (the `POST /account/2fa/confirm` step, not `setup`).
 * A high failure rate here usually means the QR code or manual secret wasn't scanned correctly,
 * not an attack — enrollment happens inside an already-authenticated, fresh session.
 */
export const authTwoFactorEnrollTotal = new Counter({
    name: 'auth_two_factor_enroll_total',
    help: 'Total two-factor enrollment confirmations, labelled by outcome.',
    labelNames: ['status'] as const,
    registers: [metricsRegistry]
});

/**
 * Two-factor disable attempts.
 * The failure series is the interesting one: a stolen-but-fresh session probing for the second
 * factor before it can strip 2FA off the account.
 */
export const authTwoFactorDisableTotal = new Counter({
    name: 'auth_two_factor_disable_total',
    help: 'Total two-factor disable attempts, labelled by outcome.',
    labelNames: ['status'] as const,
    registers: [metricsRegistry]
});

/**
 * Login-time 2FA challenge attempts (`POST /account/login/2fa`).
 * The sharpest signal of the three: a failure here means the PASSWORD already checked out — same
 * reasoning `authReauthTotal`'s comment gives, one level earlier in the funnel.
 */
export const authTwoFactorChallengeTotal = new Counter({
    name: 'auth_two_factor_challenge_total',
    help: 'Total login-time 2FA challenge attempts, labelled by outcome.',
    labelNames: ['status'] as const,
    registers: [metricsRegistry]
});

/**
 * OAuth login/signup attempts, labelled by provider and outcome — kept separate from
 * `authLoginTotal` rather than adding a label to it, since every existing call site would
 * otherwise need a `provider: 'password'` to keep the series comparable. Lets a dashboard tell a
 * Google outage apart from GitHub's, or from the password funnel entirely.
 */
export const authOauthTotal = new Counter({
    name: 'auth_oauth_total',
    help: 'Total OAuth login/signup attempts, labelled by provider and outcome.',
    labelNames: ['provider', 'status'] as const,
    registers: [metricsRegistry]
});
