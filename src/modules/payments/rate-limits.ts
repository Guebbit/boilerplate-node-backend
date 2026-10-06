/**
 * @module
 * Payments' own rate-limit budgets: the webhook's own ceiling (`webhookLimiter`), the pooled one for
 * intents and syncs (`paymentIntentLimiter`), and the three
 * card-testing budgets on `POST /:id/confirm` (`paymentConfirmAttemptLimiter`,
 * `paymentConfirmDeclineLimiter`, `paymentConfirmDeclineBlockLimiter`) plus the gate built on the
 * two decline ones (`paymentDeclineChallengeGate`). Each is data (`RateLimitBudget`, declared on `./module.ts`'s
 * `rateLimits`) turned into middleware by `buildRateLimiter`
 * (`@infrastructure/http/middlewares/rate-limit`), the same factory every other module's budgets
 * go through.
 *
 * See: docs/tools/security.md#the-rate-limit-budgets
 */

import type { Request, RequestHandler } from 'express';
import type { RateLimitBudget } from '@types';
import {
    buildRateLimiter,
    rateLimitInfoOf,
    accountIdOf,
    addressBlockOf,
    KEYED_BY_ADDRESS,
    KEYED_BY_ADDRESS_BLOCK,
    KEYED_BY_AUTHENTICATED_ACCOUNT
} from '@infrastructure/http/middlewares/rate-limit';
import { humanChallengeGate } from '@infrastructure/http/middlewares/human-challenge';

/**
 * Payment webhook deliveries allowed per window, per ADDRESS.
 *
 * The provider is one caller, but its address is not this application's to size a global budget
 * around. A signature check is what actually authenticates a delivery — this budget exists
 * because the route is otherwise unbounded, and every route this application answers deserves a
 * stated ceiling rather than a silent one. Sized for a burst of genuine deliveries (several events
 * per order, a sale driving many orders at once), not the one-per-order steady state.
 */
const WEBHOOK_BUDGET: RateLimitBudget = {
    name: 'Payment webhook deliveries',
    namespace: 'payment-webhook',
    environmentVariable: 'NODE_PAYMENT_WEBHOOK_RATE_LIMIT_MAX',
    defaultMax: 60,
    windowMs: 'shared',
    keyedBy: KEYED_BY_ADDRESS,
    bounds: 'Deliveries to `POST /payments/webhook`, spent by success — the traffic being bounded.',
    audited: true
};

/**
 * The budget for `POST /payments/webhook` — the only unauthenticated WRITE surface this API has.
 * See {@link WEBHOOK_BUDGET}.
 */
export const webhookLimiter: RequestHandler = buildRateLimiter(WEBHOOK_BUDGET);

/** Window, in ms, for both payment-velocity budgets — fixed at one hour: the duration is part of what the budget means, not an artefact of the shared browsing window. */
const PAYMENT_VELOCITY_WINDOW_MS = 60 * 60 * 1000;

/**
 * Confirm attempts allowed per ACCOUNT per hour — the blunt cap on the whole intent→confirm loop:
 * a payment can be re-confirmed with a different `paymentMethodRef` after a decline, so this
 * bounds the loop itself regardless of outcome.
 */
const CONFIRM_ATTEMPT_BUDGET: RateLimitBudget = {
    name: 'Payment confirm attempts',
    namespace: 'payments-confirm-attempts',
    environmentVariable: 'NODE_PAYMENT_CONFIRM_RATE_LIMIT_MAX',
    defaultMax: 5,
    windowMs: PAYMENT_VELOCITY_WINDOW_MS,
    keyedBy: KEYED_BY_AUTHENTICATED_ACCOUNT,
    bounds:
        'Attempts against `POST /payments/:id/confirm`, counted regardless of outcome — a ' +
        'checkout that never fails a password check can still burn through many card numbers on ' +
        'one intent.',
    audited: true,
    keyGenerator: accountIdOf
};

/** The budget for confirm attempts — see {@link CONFIRM_ATTEMPT_BUDGET}. */
export const paymentConfirmAttemptLimiter: RequestHandler =
    buildRateLimiter(CONFIRM_ATTEMPT_BUDGET);

/**
 * Where express-rate-limit stores the decline limiter's counter on `request` —
 * `paymentDeclineChallengeGate` is the only reader, the same arrangement as account's identity
 * budget.
 */
const PAYMENT_DECLINE_RATE_LIMIT_PROPERTY = 'paymentDeclineRateLimit';

/**
 * Declines against `POST /payments/:id/confirm`, keyed on the account — the accurate signal the
 * attempt budget above is not: a person retries a flaky card two or three times, a card tester
 * retries many different ones. Matches Stripe's own published Radar rule ("block after 3 declines
 * from an IP"), keyed here on the account instead. `skipSuccessfulRequests` spends the budget on a
 * genuine decline only: `requestWasSuccessful` reads `request.paymentConfirmDeclined`, set by the
 * controller, rather than the stock `statusCode < 400` check — this route's OTHER 409,
 * `PAYMENT_ORDER_NOT_PAYABLE`, is a race, not a decline, and must not spend it.
 */
const CONFIRM_DECLINE_BUDGET: RateLimitBudget = {
    name: 'Payment confirm declines',
    namespace: 'payments-confirm-declines',
    environmentVariable: 'NODE_PAYMENT_DECLINE_RATE_LIMIT_MAX',
    defaultMax: 3,
    windowMs: PAYMENT_VELOCITY_WINDOW_MS,
    keyedBy: KEYED_BY_AUTHENTICATED_ACCOUNT,
    bounds:
        "A genuine DECLINE against `POST /payments/:id/confirm`, counted apart from the route's " +
        'other 409 (a race, not a decline).',
    audited: true,
    keyGenerator: accountIdOf,
    skipSuccessfulRequests: true,
    requestWasSuccessful: (request) => !request.paymentConfirmDeclined,
    requestPropertyName: PAYMENT_DECLINE_RATE_LIMIT_PROPERTY
};

/** The budget for confirm declines — see {@link CONFIRM_DECLINE_BUDGET}. */
export const paymentConfirmDeclineLimiter: RequestHandler =
    buildRateLimiter(CONFIRM_DECLINE_BUDGET);

/**
 * Intent creations and syncs allowed per ACCOUNT per hour, ONE counter for both routes: each ends
 * in a call to the payment provider, which has its own rate limits and costs. Far above what a
 * shopper retrying a checkout needs, so only a script loops through it. Every request counts.
 */
const INTENT_SYNC_BUDGET: RateLimitBudget = {
    name: 'Payment intents and syncs',
    namespace: 'payments-intent-sync',
    environmentVariable: 'NODE_PAYMENT_INTENT_RATE_LIMIT_MAX',
    defaultMax: 30,
    windowMs: PAYMENT_VELOCITY_WINDOW_MS,
    keyedBy: KEYED_BY_AUTHENTICATED_ACCOUNT,
    bounds:
        'Calls to `POST /payments/intent` and `POST /payments/:id/sync`, pooled — each reaches ' +
        'the payment provider.',
    audited: true,
    keyGenerator: accountIdOf
};

/**
 * The budget for intents and syncs — see {@link INTENT_SYNC_BUDGET}. ONE middleware instance,
 * mounted on both routes: two instances of one budget would count separately.
 */
export const paymentIntentLimiter: RequestHandler = buildRateLimiter(INTENT_SYNC_BUDGET);

/**
 * Where the block decline limiter's counter lives on `request` — the gate below reads it, the
 * same arrangement as {@link PAYMENT_DECLINE_RATE_LIMIT_PROPERTY}.
 */
const PAYMENT_DECLINE_BLOCK_RATE_LIMIT_PROPERTY = 'paymentDeclineBlockRateLimit';

/**
 * Declines against `POST /payments/:id/confirm`, keyed on the caller's address BLOCK: what the
 * per-account budget cannot see, a card tester rotating through many accounts from one network.
 * A block, not one address, so a carrier NAT is not locked out by one address and a tester is not
 * given a fresh budget per address. 10 an hour against the account's 3, because a block is shared
 * by many honest people. Spent by a genuine decline only, like {@link CONFIRM_DECLINE_BUDGET}.
 * Card-number fingerprinting (what Stripe Radar does) waits for a real provider adapter.
 */
const CONFIRM_DECLINE_BLOCK_BUDGET: RateLimitBudget = {
    name: 'Payment confirm declines per address block',
    namespace: 'payments-confirm-declines-block',
    environmentVariable: 'NODE_PAYMENT_DECLINE_BLOCK_RATE_LIMIT_MAX',
    defaultMax: 10,
    windowMs: PAYMENT_VELOCITY_WINDOW_MS,
    keyedBy: KEYED_BY_ADDRESS_BLOCK,
    bounds:
        'A genuine DECLINE against `POST /payments/:id/confirm` from one address block, whatever ' +
        'the account — card testing spread over many accounts.',
    audited: true,
    keyGenerator: addressBlockOf,
    skipSuccessfulRequests: true,
    requestWasSuccessful: (request) => !request.paymentConfirmDeclined,
    requestPropertyName: PAYMENT_DECLINE_BLOCK_RATE_LIMIT_PROPERTY
};

/** The budget for confirm declines per address block — see {@link CONFIRM_DECLINE_BLOCK_BUDGET}. */
export const paymentConfirmDeclineBlockLimiter: RequestHandler = buildRateLimiter(
    CONFIRM_DECLINE_BLOCK_BUDGET
);

/**
 * Fraction of the block's decline budget that must be spent before an otherwise honest confirm
 * starts carrying the human challenge. Same fraction as account's
 * `CHALLENGE_AFTER_IDENTITY_BUDGET_SPENT`.
 */
const CHALLENGE_AFTER_BLOCK_BUDGET_SPENT = 0.5;

/**
 * Whether the caller's address block has spent half its decline budget. Missing rate-limit info
 * (the block limiter didn't run) reads as "not yet".
 *
 * `info.remaining` already counts THIS request provisionally, so it is one lower than the prior
 * declines alone: the comparison is strict (`<`) to cancel that out, arming at exactly half.
 */
const blockBudgetMostlySpent = (request: Request): boolean => {
    const info = rateLimitInfoOf(request, PAYMENT_DECLINE_BLOCK_RATE_LIMIT_PROPERTY);
    if (!info) return false;
    return info.remaining < info.limit * (1 - CHALLENGE_AFTER_BLOCK_BUDGET_SPENT);
};

/**
 * Whether this confirm attempt's account has at least one PRIOR decline already on record this
 * window. Missing rate-limit info (the decline limiter didn't run) reads as "not yet". During a Redis
 * outage the budget counts in memory (`failoverStore`), so the gate reads the fallback's numbers.
 *
 * `info.remaining` already reflects THIS request's own provisional count — express-rate-limit
 * increments before the outcome is known, then undoes it later if `requestWasSuccessful` says so —
 * so `remaining` is one lower than the prior-decline count alone would read. The threshold is
 * `limit - 1`, not `limit`, to cancel that provisional count out.
 */
const hasAPriorDecline = (request: Request): boolean => {
    const info = rateLimitInfoOf(request, PAYMENT_DECLINE_RATE_LIMIT_PROPERTY);
    if (!info) return false;
    return info.remaining < info.limit - 1;
};

/**
 * Mounted after both decline limiters: passes an account's first confirm attempt through
 * untouched, delegates to `humanChallengeGate` once that account has at least one decline already
 * on record, or its address block has spent half its decline budget. A no-op until a
 * human-challenge provider is configured, like every other mount of it.
 */
export const paymentDeclineChallengeGate: RequestHandler = (request, response, next) =>
    hasAPriorDecline(request) || blockBudgetMostlySpent(request)
        ? humanChallengeGate(request, response, next)
        : next();

/** This module's declared budgets — listed on `./module.ts`'s `rateLimits`. */
export const paymentsRateLimits: readonly RateLimitBudget[] = [
    WEBHOOK_BUDGET,
    CONFIRM_ATTEMPT_BUDGET,
    CONFIRM_DECLINE_BUDGET,
    CONFIRM_DECLINE_BLOCK_BUDGET,
    INTENT_SYNC_BUDGET
];
