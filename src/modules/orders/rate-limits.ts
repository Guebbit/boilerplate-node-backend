/**
 * @module
 * Orders' own rate-limit budgets: `ordersExportLimiter` on `GET /orders/export` and `ordersNoteLimiter`
 * on `POST /orders/:id/timeline/notes`. Data
 * (`RateLimitBudget`, declared on `./module.ts`'s `rateLimits`) turned into middleware by
 * `buildRateLimiter` (`@infrastructure/http/middlewares/rate-limit`), the same factory every other
 * module's budgets go through.
 *
 * See: docs/understand/security.md#the-rate-limit-budgets
 */

import type { RequestHandler } from 'express';
import type { RateLimitBudget } from '@types';
import {
    buildRateLimiter,
    accountIdOf,
    KEYED_BY_AUTHENTICATED_ACCOUNT
} from '@infrastructure/http/middlewares/rate-limit';
import { ordersRateLimitData } from './rate-limits.generated';

/**
 * Exports allowed per window, per ACCOUNT. Each one scans up to `NODE_ORDER_EXPORT_MAX_ROWS`
 * orders through a cursor: a long read, not a burst. Well above a person reconciling a month in
 * three filters, well below a script mining the shop's customers one filter at a time.
 */
const ORDERS_EXPORT_BUDGET: RateLimitBudget = {
    ...ordersRateLimitData.ordersExport,
    keyedBy: KEYED_BY_AUTHENTICATED_ACCOUNT,
    keyGenerator: accountIdOf
};

/** The budget for the export route — see {@link ORDERS_EXPORT_BUDGET}. */
export const ordersExportLimiter: RequestHandler = buildRateLimiter(ORDERS_EXPORT_BUDGET);

/**
 * Staff notes allowed per window, per ACCOUNT. A note is a row kept for years and handed to the
 * buyer on request: a person logging calls stays far under it, a script filling a file does not.
 */
const ORDERS_NOTE_BUDGET: RateLimitBudget = {
    ...ordersRateLimitData.ordersNote,
    keyedBy: KEYED_BY_AUTHENTICATED_ACCOUNT,
    keyGenerator: accountIdOf
};

/** The budget for the note route — see {@link ORDERS_NOTE_BUDGET}. */
export const ordersNoteLimiter: RequestHandler = buildRateLimiter(ORDERS_NOTE_BUDGET);

/** This module's declared budgets — listed on `./module.ts`'s `rateLimits`. */
export const ordersRateLimits: readonly RateLimitBudget[] = [
    ORDERS_EXPORT_BUDGET,
    ORDERS_NOTE_BUDGET
];
