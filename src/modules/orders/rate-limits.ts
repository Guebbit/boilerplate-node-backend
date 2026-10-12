/**
 * @module
 * Orders' own rate-limit budget: `ordersExportLimiter`, on `GET /orders/export`. Data
 * (`RateLimitBudget`, declared on `./module.ts`'s `rateLimits`) turned into middleware by
 * `buildRateLimiter` (`@infrastructure/http/middlewares/rate-limit`), the same factory every other
 * module's budgets go through.
 *
 * See: docs/tools/security.md#the-rate-limit-budgets
 */

import type { RequestHandler } from 'express';
import type { RateLimitBudget } from '@types';
import {
    buildRateLimiter,
    accountIdOf,
    KEYED_BY_AUTHENTICATED_ACCOUNT
} from '@infrastructure/http/middlewares/rate-limit';

/**
 * Exports allowed per window, per ACCOUNT. Each one scans up to `NODE_ORDER_EXPORT_MAX_ROWS`
 * orders through a cursor: a long read, not a burst. Well above a person reconciling a month in
 * three filters, well below a script mining the shop's customers one filter at a time.
 */
const ORDERS_EXPORT_BUDGET: RateLimitBudget = {
    name: 'Order CSV exports',
    namespace: 'orders-export',
    environmentVariable: 'NODE_ORDER_EXPORT_RATE_LIMIT_MAX',
    defaultMax: 10,
    windowMs: 'shared',
    keyedBy: KEYED_BY_AUTHENTICATED_ACCOUNT,
    bounds:
        'Exports against `GET /orders/export`, keyed on the ACCOUNT — the step-up already makes ' +
        'the caller a person, and an address-keyed budget would let one signed-in manager behind ' +
        'a shared address starve every other caller on it.',
    audited: true,
    keyGenerator: accountIdOf
};

/** The budget for the export route — see {@link ORDERS_EXPORT_BUDGET}. */
export const ordersExportLimiter: RequestHandler = buildRateLimiter(ORDERS_EXPORT_BUDGET);

/** This module's declared budgets — listed on `./module.ts`'s `rateLimits`. */
export const ordersRateLimits: readonly RateLimitBudget[] = [ORDERS_EXPORT_BUDGET];
