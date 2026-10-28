/**
 * @module
 * The scheduled job `orders` owns: the retention scrub.
 *
 * See: docs/reference/ops.md#scheduled-jobs
 */

import type { JobDeclaration } from '@kernel/registry';
import { ordersJobData } from './jobs.generated';
import { anonymizeDueOrders } from './services/retention';
import { scrubTimelineText } from './services/timeline';

/** The job `orders` owns. */
export const ordersJobs: readonly JobDeclaration[] = [
    {
        ...ordersJobData.reapOrders,
        // Resolves how many orders were anonymized — the demo profile's job lever reports it.
        run: () =>
            anonymizeDueOrders().then((anonymized) => scrubTimelineText().then(() => anonymized))
    }
];
