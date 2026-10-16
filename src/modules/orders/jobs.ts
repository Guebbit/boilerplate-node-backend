/**
 * @module
 * The scheduled job `orders` owns: the retention scrub.
 *
 * See: docs/reference/ops.md#scheduled-jobs
 */

import type { JobDeclaration } from '@kernel/registry';
import { anonymizeDueOrders } from './services/retention';
import { scrubTimelineText } from './services/timeline';

/** The job `orders` owns. */
export const ordersJobs: readonly JobDeclaration[] = [
    {
        name: 'reap:orders',
        schedule: '10 2 * * *',
        summary:
            "Anonymizes an order's remaining PII once its retention window has passed, and unsets a timeline row's staff text once its own window has.",
        // Resolves how many orders were anonymized — the demo profile's job lever reports it.
        run: () =>
            anonymizeDueOrders().then((anonymized) => scrubTimelineText().then(() => anonymized))
    }
];
