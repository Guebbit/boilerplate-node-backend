/**
 * @module
 * Payments' own rate-limit budgets: the webhook's own ceiling (`webhookLimiter`), and the two
 * card-testing budgets on `POST /:id/confirm` (`paymentConfirmAttemptLimiter`,
 * `paymentConfirmDeclineLimiter`) plus the gate built on the latter
 * (`paymentDeclineChallengeGate`). Each is data (`RateLimitBudget`, declared on `./module.ts`'s
 * `rateLimits`) turned into middleware by `buildRateLimiter`
 * (`@infrastructure/http/middlewares/rate-limit`), the same factory every other module's budgets
 * go through.
 *
 * See: docs/tools/security.md#the-rate-limit-budgets
 */

import type { Request, RequestHandler } from 'express';
import type { RateLimitInfo } from 'express-rate-limit';
import type { RateLimitBudget } from '@types';
import { buildRateLimiter } from '@infrastructure/http/middlewares/rate-limit';
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
    keyedBy: 'address',
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
 * Who a payment-velocity budget is keyed on: the authenticated account. `identityOf` (the
 * credential budgets' key) reads the request BODY, the wrong place here — the account confirming
 * a payment is in `authContext`, resolved by `getAuth` before either limiter below runs
 * (`payments/routes.ts` mounts them after `router.use(getAuth, isAuth)`), so the `!` is a fact
 * `isAuth` already proved, not a suppression.
 */
const accountIdOf = (request: Request): string => request.authContext!.id;

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
    keyedBy: 'the authenticated account',
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
    keyedBy: 'the authenticated account',
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
 * Whether this confirm attempt's account has at least one PRIOR decline already on record this
 * window. Missing rate-limit info (the decline limiter didn't run, or a store error let the
 * request through) reads as "not yet" — same fail-open reasoning account's own identity gate uses.
 *
 * `info.remaining` already reflects THIS request's own provisional count — express-rate-limit
 * increments before the outcome is known, then undoes it later if `requestWasSuccessful` says so —
 * so `remaining` is one lower than the prior-decline count alone would read. The threshold is
 * `limit - 1`, not `limit`, to cancel that provisional count out.
 */
const hasAPriorDecline = (request: Request): boolean => {
    // Same cast account's own identity gate uses: the property name is chosen at runtime
    // (`requestPropertyName`), which the `Request` augmentation cannot describe.
    const info = (request as Request & Record<string, RateLimitInfo | undefined>)[
        PAYMENT_DECLINE_RATE_LIMIT_PROPERTY
    ];
    if (!info) return false;
    return info.remaining < info.limit - 1;
};

/**
 * Mounted after `paymentConfirmDeclineLimiter`: passes an account's first confirm attempt through
 * untouched, delegates to `humanChallengeGate` once that account has at least one decline already
 * on record. A no-op until a human-challenge provider is configured, like every other mount of it.
 */
export const paymentDeclineChallengeGate: RequestHandler = (request, response, next) =>
    hasAPriorDecline(request) ? humanChallengeGate(request, response, next) : next();

/** This module's declared budgets — listed on `./module.ts`'s `rateLimits`. */
export const paymentsRateLimits: readonly RateLimitBudget[] = [
    WEBHOOK_BUDGET,
    CONFIRM_ATTEMPT_BUDGET,
    CONFIRM_DECLINE_BUDGET
];
