/**
 * @module
 * Orders' own rate-limit budget: `invoiceLimiter`, on `GET /orders/:id/invoice`. Data
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
 * Invoice renders allowed per window, per ACCOUNT.
 *
 * Every hit spawns a Chromium launch (`renderHtmlToPdf`) — CPU and memory a request handler does
 * not otherwise cost. Sized well above one legitimate session's download-view-redownload burst,
 * well below the global brake, so a signed-in account clicking the button cannot hold every CPU
 * the container has.
 */
const INVOICE_RENDER_BUDGET: RateLimitBudget = {
    name: 'Invoice renders',
    namespace: 'orders-invoice',
    environmentVariable: 'NODE_INVOICE_RATE_LIMIT_MAX',
    defaultMax: 20,
    windowMs: 'shared',
    keyedBy: KEYED_BY_AUTHENTICATED_ACCOUNT,
    bounds:
        'Renders against `GET /orders/{id}/invoice`, keyed on the ACCOUNT — every hit spawns a ' +
        'Chromium launch, so an address-keyed budget would let one signed-in account behind a ' +
        'shared address starve every other caller on it.',
    audited: true,
    keyGenerator: accountIdOf
};

/** The budget for `GET /orders/:id/invoice` — see {@link INVOICE_RENDER_BUDGET}. */
export const invoiceLimiter: RequestHandler = buildRateLimiter(INVOICE_RENDER_BUDGET);

/** This module's declared budgets — listed on `./module.ts`'s `rateLimits`. */
export const ordersRateLimits: readonly RateLimitBudget[] = [INVOICE_RENDER_BUDGET];
