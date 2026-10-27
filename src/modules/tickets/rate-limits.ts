/**
 * @module
 * Tickets's own rate-limit budgets: `submissionLimiter`, the address-keyed budget for the
 * contact form, and `contactLimiters`, which adds the identity and address-block dimensions on
 * top of it. Each is data (`RateLimitBudget`, declared on `./module.ts`'s `rateLimits`) turned
 * into middleware by `buildRateLimiter` (`@infrastructure/http/middlewares/rate-limit`), the same
 * factory every other module's budgets go through.
 *
 * See: docs/tools/security.md#the-rate-limit-budgets
 */

import type { RequestHandler } from 'express';
import type { RateLimitBudget } from '@types';
import {
    buildRateLimiter,
    identityOf,
    addressBlockOf,
    KEYED_BY_ADDRESS,
    KEYED_BY_ADDRESS_BLOCK,
    KEYED_BY_SUBMITTED_EMAIL
} from '@infrastructure/http/middlewares/rate-limit';
import { ticketsRateLimitData } from './rate-limits.generated';

/**
 * Contact-form submissions allowed per window, per ADDRESS.
 *
 * A person files a contact request once; five a minute from one address is already generous,
 * against a global brake of `DEFAULT_RATE_LIMIT_MAX`. Unlike the credential budgets, a
 * SUCCESSFUL request spends it: the abuse here is a well-formed submission repeated, not a failed
 * one — every abusive contact-form post gets a `201`, so `skipSuccessfulRequests` would change
 * nothing about the amplifier this exists to bound.
 */
const SUBMISSION_ADDRESS_BUDGET: RateLimitBudget = {
    ...ticketsRateLimitData.submissions,
    keyedBy: KEYED_BY_ADDRESS
};

/** The budget for `POST /tickets` on its own — see {@link SUBMISSION_ADDRESS_BUDGET}. */
export const submissionLimiter: RequestHandler = buildRateLimiter(SUBMISSION_ADDRESS_BUDGET);

/** Contact-form submissions allowed per window, per submitted EMAIL ADDRESS. */
const SUBMISSION_IDENTITY_BUDGET: RateLimitBudget = {
    ...ticketsRateLimitData.submissionIdentity,
    keyedBy: KEYED_BY_SUBMITTED_EMAIL,
    keyGenerator: identityOf
};

/** Contact-form submissions allowed per window, per caller ADDRESS BLOCK. */
const SUBMISSION_BLOCK_BUDGET: RateLimitBudget = {
    ...ticketsRateLimitData.submissionBlock,
    keyedBy: KEYED_BY_ADDRESS_BLOCK,
    keyGenerator: addressBlockOf
};

/**
 * The contact-form budgets: `submissionLimiter` (address) plus the two dimensions Rung 1 adds —
 * identity and address-block. The form carries no identity beyond free text EXCEPT the sender's
 * own email, which `identityOf` reads exactly like the credential and signup budgets do.
 *
 * See: docs/tools/security.md#the-rate-limit-budgets
 */
export const contactLimiters: RequestHandler[] = [
    submissionLimiter,
    buildRateLimiter(SUBMISSION_IDENTITY_BUDGET),
    buildRateLimiter(SUBMISSION_BLOCK_BUDGET)
];

/** This module's declared budgets — listed on `./module.ts`'s `rateLimits`. */
export const ticketsRateLimits: readonly RateLimitBudget[] = [
    SUBMISSION_ADDRESS_BUDGET,
    SUBMISSION_IDENTITY_BUDGET,
    SUBMISSION_BLOCK_BUDGET
];
