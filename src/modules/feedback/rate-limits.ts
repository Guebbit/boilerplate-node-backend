/**
 * @module
 * Feedback's own rate-limit budgets: `submissionLimiter`, the address-keyed budget for the
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
    name: 'Contact submissions — per address',
    namespace: 'submissions',
    environmentVariable: 'NODE_SUBMISSION_RATE_LIMIT_MAX',
    defaultMax: 5,
    windowMs: 'shared',
    keyedBy: KEYED_BY_ADDRESS,
    bounds:
        'Contact-form submissions from ONE address, spent by SUCCESS — a well-formed post is the ' +
        'abuse being bounded, not a failed one.',
    audited: true
};

/** The budget for `POST /feedback/contact` on its own — see {@link SUBMISSION_ADDRESS_BUDGET}. */
export const submissionLimiter: RequestHandler = buildRateLimiter(SUBMISSION_ADDRESS_BUDGET);

/** Contact-form submissions allowed per window, per submitted EMAIL ADDRESS. */
const SUBMISSION_IDENTITY_BUDGET: RateLimitBudget = {
    name: 'Contact submissions — per email',
    namespace: 'submission-identity',
    environmentVariable: 'NODE_SUBMISSION_RATE_LIMIT_EMAIL_MAX',
    defaultMax: 5,
    windowMs: 'shared',
    keyedBy: KEYED_BY_SUBMITTED_EMAIL,
    bounds: 'Contact-form submissions naming ONE sender email, spent by success.',
    audited: true,
    keyGenerator: identityOf
};

/** Contact-form submissions allowed per window, per caller ADDRESS BLOCK. */
const SUBMISSION_BLOCK_BUDGET: RateLimitBudget = {
    name: 'Contact submissions — per address block',
    namespace: 'submission-block',
    environmentVariable: 'NODE_SUBMISSION_RATE_LIMIT_BLOCK_MAX',
    defaultMax: 20,
    windowMs: 'shared',
    keyedBy: KEYED_BY_ADDRESS_BLOCK,
    bounds: 'Contact-form submissions from ONE address block, spent by success.',
    audited: true,
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
export const feedbackRateLimits: readonly RateLimitBudget[] = [
    SUBMISSION_ADDRESS_BUDGET,
    SUBMISSION_IDENTITY_BUDGET,
    SUBMISSION_BLOCK_BUDGET
];
