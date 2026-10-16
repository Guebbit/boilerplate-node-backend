/**
 * @module
 * Stats service — what the dashboard reads. `range.ts` checks a period and puts it in the shop's
 * zone; `sales.ts` and `breakdowns.ts` compose the owners' own grouped reads. Nothing here stores
 * anything: every figure is read on demand from the module that owns it.
 */

import { getSalesStats } from './sales';
import {
    getCategoryStats,
    getCustomerStats,
    getOperationsStats,
    getPaymentMix,
    getPipelineStats,
    getProductSeries,
    getProductStats
} from './breakdowns';

export { resolvePeriod, type Period } from './range';

/** The service's public surface — every controller goes through this. */
export const statsService = {
    getSalesStats,
    getProductStats,
    getProductSeries,
    getCategoryStats,
    getPaymentMix,
    getOperationsStats,
    getCustomerStats,
    getPipelineStats
};
