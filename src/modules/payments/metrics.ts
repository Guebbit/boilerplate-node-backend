/**
 * @module
 * Domain counters this module owns. See `modules/account/metrics.ts` for why they live in the
 * module rather than in `infrastructure`, and how the overview endpoint reads them without importing here.
 */

import { Counter } from 'prom-client';
import { metricsRegistry } from '@infrastructure/observability/metrics-registry';

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

/**
 * Payments the provider reported `succeeded` for a different amount, currency or payment than the
 * one frozen. Labelled by which fields differed. Any increment is a reconciliation to look at.
 */
export const paymentAmountMismatchTotal = new Counter({
    name: 'payment_amount_mismatch_total',
    help: 'Provider-reported successes whose amount, currency or payment id differ from the frozen payment.',
    labelNames: ['field'],
    registers: [metricsRegistry]
});

/**
 * Zero from startup, so an `increase()` alert sees the first mismatch after a restart. The fields
 * are the ones `services/settlement.ts` compares.
 * https://prometheus.io/docs/practices/instrumentation/#avoid-missing-metrics
 */
for (const field of ['amount', 'currency', 'paymentId'])
    paymentAmountMismatchTotal.inc({ field }, 0);

/**
 * Provider messages the app refused although they were signed: the adapter could not read the
 * body, or what it returned failed the contract schema. Labelled by `reason`.
 * A signature failure is NOT counted here (`security_events_total` owns it).
 * Any increment means a reader is broken and a dispute or refund message was dropped.
 */
export const paymentWebhookDroppedTotal = new Counter({
    name: 'payment_webhook_dropped_total',
    help: 'Signed provider webhook deliveries refused because they could not be read.',
    labelNames: ['reason'],
    registers: [metricsRegistry]
});

/**
 * Zero from startup, so an `increase()` alert sees the first drop after a restart.
 * https://prometheus.io/docs/practices/instrumentation/#avoid-missing-metrics
 */
paymentWebhookDroppedTotal.inc({ reason: 'unreadable' }, 0);
