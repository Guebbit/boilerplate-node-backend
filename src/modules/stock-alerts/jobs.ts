/**
 * @module
 * The scheduled job `stock-alerts` owns: the hourly pass that answers requests for a product that
 * became orderable without a write (a preorder whose release date passed).
 *
 * See: docs/reference/ops.md#scheduled-jobs
 */

import type { JobDeclaration } from '@kernel/registry';
import { stockAlertsJobData } from './jobs.generated';
import { logger } from '@infrastructure/adapters/logger';
import { settleOutboxNudges } from '@kernel/outbox';
import { stockAlertService } from './service';

/** The jobs `stock-alerts` owns. */
export const stockAlertsJobs: readonly JobDeclaration[] = [
    {
        ...stockAlertsJobData.sweepStockAlerts,
        run: () =>
            stockAlertService
                .sweepBuyable(new Date())
                .then((products) => {
                    logger.info({ message: 'Stock alert sweep done.', products });
                })
                // Each inbox row rides the outbox; settled inside the lease so `notifications` has
                // heard every one before the connections close.
                .then(() => settleOutboxNudges()),
        needs: { subscriptions: true, i18n: true },
        lease: { ttlMs: 30 * 60 * 1000 }
    }
];
