/**
 * @module
 * Domain counters this module owns. See `modules/account/metrics.ts` for why they live in the
 * module rather than in `infrastructure`, and how the overview endpoint reads them without importing here.
 */

import { Counter } from 'prom-client';
import { metricsRegistry } from '@infrastructure/observability/metrics-http';

/**
 * Admin-created orders.
 * Unlabelled: these are created directly by staff, so there is no user-facing failure mode to
 * distinguish. Kept separate from `cart`'s `cart_checkout_total` so manual orders do not distort
 * the customer checkout success rate.
 */
export const orderCreatedTotal = new Counter({
    name: 'order_created_total',
    help: 'Total orders created.',
    registers: [metricsRegistry]
});
