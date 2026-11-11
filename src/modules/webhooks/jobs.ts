/**
 * @module
 * The scheduled job `webhooks` owns: the delivery retry sweep.
 *
 * See: docs/reference/ops.md#scheduled-jobs
 */

import type { JobDeclaration } from '@kernel/registry';
import { webhooksJobData } from './jobs.generated';
import { sweepDueWebhookDeliveries } from './services/sweep';

/** The jobs `webhooks` owns. */
export const webhooksJobs: readonly JobDeclaration[] = [
    {
        ...webhooksJobData.sweepWebhookRetries,
        run: () => sweepDueWebhookDeliveries()
    }
];
