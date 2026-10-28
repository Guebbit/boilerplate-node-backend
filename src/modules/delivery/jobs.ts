/**
 * @module
 * The scheduled jobs `delivery` owns: the hold-note scrub and the daily preorder sweep.
 *
 * See: docs/reference/ops.md#scheduled-jobs
 */

import type { JobDeclaration } from '@kernel/registry';
import { deliveryJobData } from './jobs.generated';
import { logger } from '@infrastructure/adapters/logger';
import { settleOutboxNudges } from '@kernel/outbox';
import { scrubHoldNotes, scrubLostNotes } from './services/retention';
import { runPreorderSweep } from './services/preorder-sweep';

/** The jobs `delivery` owns. */
export const deliveryJobs: readonly JobDeclaration[] = [
    {
        ...deliveryJobData.reapDelivery,
        run: () =>
            Promise.all([scrubHoldNotes(), scrubLostNotes()]).then(
                ([holds, losses]) => holds + losses
            )
    },
    {
        ...deliveryJobData.sweepPreorders,
        run: () =>
            runPreorderSweep()
                .then((result) => {
                    logger.info({ message: 'Preorder sweep done.', ...result });
                })
                // Each notice rides the outbox; settled inside the lease so `notifications` has
                // heard every one before the connections close.
                .then(() => settleOutboxNudges()),
        needs: { subscriptions: true, i18n: true },
        lease: { ttlMs: 30 * 60 * 1000 }
    }
];
