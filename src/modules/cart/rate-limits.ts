/**
 * @module
 * Cart's own rate-limit budgets: `checkoutLimiter` on `POST /cart/checkout`, `mergeLimiter` on
 * `POST /cart/merge`. Data (`RateLimitBudget`, declared on `./module.ts`'s `rateLimits`) turned
 * into middleware by `buildRateLimiter`, the same factory every other module's budgets go through.
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

/**
 * Merges one account may run per window.
 *
 * A merge is a hundred `POST /cart`s in one request — up to a hundred catalogue reads and cart
 * writes (docs/modules/cart.md#merging-a-guest-cart). The global brake counts it as one request,
 * which is a hundredfold under-count of both costs. A person merges once per sign-in, so ten a
 * minute never touches a legitimate flow. Keyed on the account, not the address: the route is
 * signed in, and an address key would reset per IP for a stolen session hammering the cart.
 * Every request spends it, a replay included — the abuse is the request, not its outcome.
 */
const MERGE_BUDGET: RateLimitBudget = {
    name: 'Cart merges',
    namespace: 'cart-merge',
    environmentVariable: 'NODE_CART_MERGE_RATE_LIMIT_MAX',
    defaultMax: 10,
    windowMs: 'shared',
    keyedBy: KEYED_BY_AUTHENTICATED_ACCOUNT,
    bounds:
        '`POST /cart/merge`: up to 100 lines per call, each a catalogue read and a cart write. ' +
        'Every request counts.',
    audited: true,
    keyGenerator: accountIdOf
};

/** The budget for `POST /cart/merge` — see {@link MERGE_BUDGET}. */
export const mergeLimiter: RequestHandler = buildRateLimiter(MERGE_BUDGET);

/** This module's declared budgets — listed on `./module.ts`'s `rateLimits`. */
export const cartRateLimits: readonly RateLimitBudget[] = [CHECKOUT_BUDGET, MERGE_BUDGET];
