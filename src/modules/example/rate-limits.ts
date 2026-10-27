/**
 * @module
 * In any module: its rate-limit budgets as data (`RateLimitBudget`, listed on `module.ts`'s
 * `rateLimits`), turned into middleware by the one `buildRateLimiter` every module uses.
 * Here: a create budget per caller.
 * Delete it if: the module needs no budget (and its route mount).
 *
 * See: docs/tools/security.md#the-rate-limit-budgets
 */

import type { RequestHandler } from 'express';
import type { RateLimitBudget } from '@types';
import {
    accountIdOf,
    buildRateLimiter,
    KEYED_BY_AUTHENTICATED_ACCOUNT
} from '@infrastructure/http/middlewares/rate-limit';
import { exampleRateLimitData } from './rate-limits.generated';

/**
 * Examples one account may create per window. Keyed on the account, not the address: the route is
 * signed in, and an address-keyed budget would let one noisy account starve everyone behind the
 * same address. A successful create spends it — the abuse is a well-formed write repeated.
 */
const CREATE_EXAMPLE_BUDGET: RateLimitBudget = {
    ...exampleRateLimitData.exampleCreate,
    keyedBy: KEYED_BY_AUTHENTICATED_ACCOUNT,
    keyGenerator: accountIdOf
};

/** The budget for `POST /examples` — see {@link CREATE_EXAMPLE_BUDGET}. */
export const createExampleLimiter: RequestHandler = buildRateLimiter(CREATE_EXAMPLE_BUDGET);

/** This module's declared budgets — listed on `./module.ts`'s `rateLimits`. */
export const exampleRateLimits: readonly RateLimitBudget[] = [CREATE_EXAMPLE_BUDGET];
