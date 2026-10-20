/**
 * @module
 * The scheduled jobs `delivery` owns: the hold-note scrub and the daily preorder sweep.
 *
 * See: docs/reference/ops.md#scheduled-jobs
 */

import type { JobDeclaration } from '@kernel/registry';
import { logger } from '@infrastructure/adapters/logger';
import { settleOutboxNudges } from '@kernel/outbox';
import { scrubHoldNotes } from './services/retention';
import { runPreorderSweep } from './services/preorder-sweep';

/** The jobs `delivery` owns. */
export const deliveryJobs: readonly JobDeclaration[] = [
    {
        name: 'reap:delivery',
        schedule: '11 2 * * *',
        summary:
            "Unsets a fulfillment order's hold note once it has not changed for its retention window.",
        run: () => scrubHoldNotes()
    },
    {
        name: 'sweep:preorders',
        // Once a day: a date passes on a calendar day, and the sweep is idempotent.
        schedule: '20 2 * * *',
        summary:
            'Tells the buyer of a preorder whose expected date passed with the goods still not here, once. It asks nothing and cancels nothing.',
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
