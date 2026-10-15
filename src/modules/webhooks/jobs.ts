/**
 * @module
 * The scheduled job `webhooks` owns: the delivery retry sweep.
 *
 * See: docs/reference/ops.md#scheduled-jobs
 */

import type { JobDeclaration } from '@kernel/registry';
import { sweepDueWebhookDeliveries } from './services/sweep';

/** The jobs `webhooks` owns. */
export const webhooksJobs: readonly JobDeclaration[] = [
    {
        name: 'sweep:webhook-retries',
        // Every minute: the sweep interval IS the retry granularity.
        schedule: '* * * * *',
        summary:
            "Re-enqueues a webhook delivery whose `nextAttemptAt` has come — the delayed-retry story's other half.",
        run: () => sweepDueWebhookDeliveries()
    }
];
