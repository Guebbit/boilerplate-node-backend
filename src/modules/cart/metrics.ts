/**
 * @module
 * Domain counters this module owns. See `modules/account/metrics.ts` for why they live in the
 * module rather than in `infrastructure`, and how the overview endpoint reads them without importing here.
 */

import { Counter } from 'prom-client';
import { metricsRegistry } from '@infrastructure/observability/metrics-http';

/**
 * Checkout (cart → order) attempts.
 * The most revenue-critical counter in the app: a rising failure ratio means money is not being
 * taken, and it warrants a page rather than a dashboard glance.
 */
export const cartCheckoutTotal = new Counter({
    // Prometheus naming: `<domain>_<subject>_total` for a counter.
    name: 'cart_checkout_total',
    help: 'Total checkout attempts, labelled by outcome.',
    // `as const` narrows the label names to literals, so `inc({ status })` is type-checked
    // against them instead of accepting any string key.
    labelNames: ['status'] as const,
    registers: [metricsRegistry]
});
