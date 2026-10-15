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
        // Once a day: the preorder duties are measured in days (the margin is two days wide), and
        // both are idempotent.
        schedule: '20 2 * * *',
        summary:
            'Asks the buyer of a late preorder whether to keep waiting, and announces a wait left unanswered for 30 days, which `returns` cancels and refunds.',
        run: () =>
            runPreorderSweep()
                .then((result) => {
                    logger.info({ message: 'Preorder sweep done.', ...result });
                })
                // Each notice and each expiry rides the outbox; settled inside the lease so
                // `notifications` and `returns` have heard every one before the connections close.
                .then(() => settleOutboxNudges()),
        needs: { subscriptions: true, i18n: true },
        lease: { ttlMs: 30 * 60 * 1000 }
    }
];
