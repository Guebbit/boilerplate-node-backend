/**
 * @module
 * Returns' own rate-limit budget: `returnsWriteLimiter`, on `POST /returns`. Data
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
import { returnsRateLimitData } from './rate-limits.generated';

/**
 * Returns opened per window, per ACCOUNT. Each one is a row staff must read and a mail the shop
 * pays to send, so it is bounded well above a real customer's handful of returns and well below
 * the global brake.
 */
const RETURNS_WRITE_BUDGET: RateLimitBudget = {
    ...returnsRateLimitData.returnsWrite,
    keyedBy: KEYED_BY_AUTHENTICATED_ACCOUNT,
    keyGenerator: accountIdOf
};

/** The budget for `POST /returns` — see {@link RETURNS_WRITE_BUDGET}. */
export const returnsWriteLimiter: RequestHandler = buildRateLimiter(RETURNS_WRITE_BUDGET);

/** This module's declared budgets — listed on `./module.ts`'s `rateLimits`. */
export const returnsRateLimits: readonly RateLimitBudget[] = [RETURNS_WRITE_BUDGET];
