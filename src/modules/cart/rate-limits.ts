/**
 * @module
 * Cart's own rate-limit budget: `checkoutLimiter`, on `POST /cart/checkout`. Data
 * (`RateLimitBudget`, declared on `./module.ts`'s `rateLimits`) turned into middleware by
 * `buildRateLimiter`, the same factory every other module's budgets go through.
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
 * Checkouts attempted per window, per ACCOUNT. Each one that gets through holds stock, writes an
 * order, burns an order number, mails the buyer and clears the products cache, so a loop of them
 * is the cheap half of a denial of inventory. Sized well above a person (a retry, a second order)
 * and far below a script. Every attempt counts, refused or placed: a refused one still read the
 * basket and the stock.
 */
const CHECKOUT_BUDGET: RateLimitBudget = {
    name: 'Checkouts attempted',
    namespace: 'checkout',
    environmentVariable: 'NODE_CHECKOUT_RATE_LIMIT_MAX',
    defaultMax: 10,
    windowMs: 'shared',
    keyedBy: KEYED_BY_AUTHENTICATED_ACCOUNT,
    bounds:
        'Requests to `POST /cart/checkout`, keyed on the ACCOUNT: each placed order holds stock and ' +
        'writes an order, a mail and a cache wipe, and an address-keyed budget would let one signed-in ' +
        'account behind a shared address starve every other caller on it.',
    audited: true,
    keyGenerator: accountIdOf
};

/** The budget for `POST /cart/checkout` — see {@link CHECKOUT_BUDGET}. */
export const checkoutLimiter: RequestHandler = buildRateLimiter(CHECKOUT_BUDGET);

/** This module's declared budgets — listed on `./module.ts`'s `rateLimits`. */
export const cartRateLimits: readonly RateLimitBudget[] = [CHECKOUT_BUDGET];
