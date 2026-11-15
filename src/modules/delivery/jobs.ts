/**
 * @module
 * The scheduled jobs `delivery` owns: the hold-note scrub and the daily preorder sweep.
 *
 * @see docs/reference/ops.md#scheduled-jobs
 */

import type { JobDeclaration } from '@kernel/registry';
import { deliveryJobData } from './jobs.generated';
import { logger } from '@infrastructure/adapters/logger';
import { scrubHoldNotes, scrubLostNotes } from './services/retention';
import { runPreorderSweep } from './services/preorder-sweep';
import { MINUTE_MS } from '@domain-primitives/time';

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
            runPreorderSweep().then((result) => {
                logger.info({ message: 'Preorder sweep done.', ...result });
            }),
        lease: { ttlMs: 30 * MINUTE_MS }
    }
];
