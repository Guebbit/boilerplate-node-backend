import { Counter } from 'prom-client';
import { metricsRegistry } from './observability';

// Business counters that you cannot derive from traces alone.
// Database/HTTP/runtime metrics live elsewhere (OTel mongoose spans, observability.ts).

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

/** Checkout (cart → order) attempts. */
export const cartCheckoutTotal = new Counter({
    name: 'cart_checkout_total',
    help: 'Total checkout attempts, labelled by outcome.',
    labelNames: ['status'] as const,
    registers: [metricsRegistry]
});

/** Admin-created orders. */
export const orderCreatedTotal = new Counter({
    name: 'order_created_total',
    help: 'Total orders created.',
    registers: [metricsRegistry]
});
