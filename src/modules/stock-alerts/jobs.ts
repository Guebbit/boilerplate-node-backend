/**
 * @module
 * The scheduled job `stock-alerts` owns: the five-minute pass that answers requests for a product
 * that is no longer `out_of_stock`.
 *
 * @see docs/reference/ops.md#scheduled-jobs
 */

import type { JobDeclaration } from '@kernel/registry';
import { stockAlertsJobData } from './jobs.generated';
import { logger } from '@infrastructure/adapters/logger';
import { stockAlertService } from './service';
import { MINUTE_MS } from '@domain-primitives/time';

/** The jobs `stock-alerts` owns. */
export const stockAlertsJobs: readonly JobDeclaration[] = [
    {
        ...stockAlertsJobData.sweepStockAlerts,
        run: () =>
            stockAlertService.sweepBuyable().then((products) => {
                logger.info({ message: 'Stock alert sweep done.', products });
            }),
        lease: { ttlMs: 30 * MINUTE_MS }
    }
];
