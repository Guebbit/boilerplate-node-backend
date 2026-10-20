/**
 * @module
 * The scheduled job `users` owns: the nightly reduction of expired purchase holds.
 *
 * See: docs/reference/ops.md#scheduled-jobs
 */

import type { JobDeclaration } from '@kernel/registry';
import { logger } from '@infrastructure/adapters/logger';
import { reapExpiredPurchaseHolds } from './services/purchase-hold';

/** The jobs `users` owns. */
export const usersJobs: readonly JobDeclaration[] = [
    {
        name: 'reap:purchase-holds',
        // Nightly with the other reapers: an expired hold is already ignored by every reader, so
        // this only trims what is kept. Idempotent: a reduced account has no hold left to match.
        schedule: '12 2 * * *',
        summary:
            'Reduces every expired purchase hold to the date that restarts the count of cancellations, dropping its note and who set it.',
        run: () =>
            reapExpiredPurchaseHolds().then((reduced) => {
                logger.info({ message: 'Purchase holds reaped.', holdsReduced: reduced });
                return { reduced };
            }),
        lease: { ttlMs: 15 * 60 * 1000 }
    }
];
