/**
 * @module
 * The scheduled jobs `orders` owns: the retention scrub and the owed-refund retry.
 *
 * See: docs/reference/ops.md#scheduled-jobs
 */

import type { JobDeclaration } from '@kernel/registry';
import { anonymizeDueOrders } from './services/retention';
import { scrubTimelineText } from './services/timeline';
import { retryPendingEffects } from './services/cancel';

/** The jobs `orders` owns. */
export const ordersJobs: readonly JobDeclaration[] = [
    {
        name: 'reap:orders',
        schedule: '10 2 * * *',
        summary:
            "Anonymizes an order's remaining PII once its retention window has passed, and unsets a timeline row's staff text once its own window has.",
        // Resolves how many orders were anonymized — the demo profile's job lever reports it.
        run: () =>
            anonymizeDueOrders().then((anonymized) => scrubTimelineText().then(() => anonymized))
    },
    {
        name: 'sweep:order-effects',
        // Every 5 minutes, matching the NODE_ORDER_EFFECT_RETRY_MINUTES=5 grace window; a nightly
        // run would leave a refund owed for up to 24 hours.
        schedule: '*/5 * * * *',
        summary:
            "Re-announces ORDER_REFUND_OWED for a refund the event bus's one delivery attempt did not carry through.",
        run: retryPendingEffects,
        // The sweep works by emitting `ORDER_REFUND_OWED`: with no `payments` listener registered it
        // would clear every marker having refunded nothing.
        needs: { subscriptions: true }
    }
];
