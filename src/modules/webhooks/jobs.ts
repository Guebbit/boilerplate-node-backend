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
        // An inline send can auto-disable a subscription and emit
        // `webhook.subscription_auto_disabled`: `notifications` hears it through its subscription,
        // and the staff mail is rendered from the translations.
        needs: { subscriptions: true, i18n: true },
        run: () => sweepDueWebhookDeliveries()
    }
];
