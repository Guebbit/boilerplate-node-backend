/**
 * @module
 * Invoicing's own rate-limit budget: `invoicingLimiter`, on `GET /orders/:id/invoice` and
 * `GET /orders/:id/credit-notes/:creditNoteId` — one budget for both, since both spawn the same
 * Chromium launch.
 * Data (`RateLimitBudget`, declared on `./module.ts`'s `rateLimits`) turned into middleware by
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
import { invoicingRateLimitData } from './rate-limits.generated';

/**
 * Renders allowed per window, per ACCOUNT — every hit spawns a Chromium launch
 * (`renderHtmlToPdf`), CPU and memory a request handler does not otherwise cost. Sized well above
 * one legitimate session's download-view-redownload burst, well below the global brake.
 */
const INVOICING_RENDER_BUDGET: RateLimitBudget = {
    ...invoicingRateLimitData.invoicingRender,
    keyedBy: KEYED_BY_AUTHENTICATED_ACCOUNT,
    keyGenerator: accountIdOf
};

/** The budget for both download routes — see {@link INVOICING_RENDER_BUDGET}. */
export const invoicingLimiter: RequestHandler = buildRateLimiter(INVOICING_RENDER_BUDGET);

/** This module's declared budgets — listed on `./module.ts`'s `rateLimits`. */
export const invoicingRateLimits: readonly RateLimitBudget[] = [INVOICING_RENDER_BUDGET];
