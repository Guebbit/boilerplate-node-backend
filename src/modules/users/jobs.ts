/**
 * @module
 * The scheduled job `users` owns: the nightly reduction of expired purchase holds.
 *
 * See: docs/reference/ops.md#scheduled-jobs
 */

import type { JobDeclaration } from '@kernel/registry';
import { usersJobData } from './jobs.generated';
import { logger } from '@infrastructure/adapters/logger';
import { reapExpiredPurchaseHolds } from './services/purchase-hold';

/** The jobs `users` owns. */
export const usersJobs: readonly JobDeclaration[] = [
    {
        ...usersJobData.reapPurchaseHolds,
        run: () =>
            reapExpiredPurchaseHolds().then((reduced) => {
                logger.info({ message: 'Purchase holds reaped.', holdsReduced: reduced });
                return { reduced };
            }),
        lease: { ttlMs: 15 * 60 * 1000 }
    }
];
