/**
 * @module
 * Domain counters this module owns. See `modules/account/metrics.ts` for why they live in the
 * module rather than in `infrastructure`, and how the overview endpoint reads them without importing here.
 */

import { Counter } from 'prom-client';
import { metricsRegistry } from '@infrastructure/observability/metrics-http';

/**
 * Confirm attempts, by outcome.
 * Labelled because the ratio is the metric: a decline spike with steady volume is a card-fraud
 * or provider incident, not a traffic change — the two summed together would hide it.
 */
export const paymentConfirmTotal = new Counter({
    name: 'payment_confirm_total',
    help: 'Payment confirmation attempts by outcome.',
    labelNames: ['outcome'],
    registers: [metricsRegistry]
});
