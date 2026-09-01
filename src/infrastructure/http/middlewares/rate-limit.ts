/**
 * @module
 * Rate limiting: a global burst brake across the whole surface, a pair of tighter budgets for
 * routes that accept a credential, and one each for the public submission that emails an operator
 * and for routes that accept an image upload. Every limiter shares one Redis-or-memory store (see
 * `rate-limit-store.ts`), fails open on a store error, and answers through the shared error
 * envelope rather than express-rate-limit's own plain-text body.
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { rateLimit, type Store } from 'express-rate-limit';
import { rejectResponse } from '@infrastructure/http/response';
import { logger } from '@infrastructure/adapters/logger';
import { t } from '@infrastructure/i18n';
import {
    emitAuditEvent,
    buildAuditEvent,
    coreAuditActions
} from '@infrastructure/observability/audit';
import { rateLimitStore } from '@infrastructure/http/middlewares/rate-limit-store';
import { environmentNumber } from '@infrastructure/runtime/environment';
import { callerContextOf } from '@infrastructure/http/request';

/**
 * Default window, in ms, used when `NODE_RATE_LIMIT_WINDOW_MS` is unset: one minute.
 *
 * The test suites raise it tenfold — see `tests/support/setup.ts`.
 *
 * See: docs/tools/security.md#the-rate-limit-budgets
 */
export const DEFAULT_RATE_LIMIT_WINDOW_MS = 60 * 1000;

/**
 * Default per-address budget, used when `NODE_RATE_LIMIT_MAX` is unset: 100 requests per window,
 * sized for browsing rather than for guessing.
 */
export const DEFAULT_RATE_LIMIT_MAX = 100;

/**
 * Failed credential attempts allowed per window, per ACCOUNT named.
 *
 * The smaller of the two credential budgets — see `credentialLimiters`: guessing at one account is
 * the attack, and someone signing in on several devices is not.
 */
export const DEFAULT_AUTH_RATE_LIMIT_MAX = 10;

/**
 * Failed credential attempts allowed per window, per ADDRESS calling.
 *
 * The larger of the two credential budgets — see `DEFAULT_AUTH_RATE_LIMIT_MAX`.
 */
export const DEFAULT_AUTH_RATE_LIMIT_ADDRESS_MAX = 30;

/**
 * Contact-form submissions allowed per window, per ADDRESS.
 *
 * A person files a contact request once; five a minute from one address is already generous,
 * against a global brake of {@link DEFAULT_RATE_LIMIT_MAX}. See `submissionLimiter` for why this
 * budget is spent by success rather than failure.
 */
export const DEFAULT_SUBMISSION_RATE_LIMIT_MAX = 5;

/**
 * Image uploads allowed per window, per ADDRESS.
 *
 * Sized well above what one legitimate session needs (bulk product-image edits included) and well
 * below the global brake — see `uploadLimiter` for why this budget exists at all.
 */
export const DEFAULT_UPLOAD_RATE_LIMIT_MAX = 20;

/** The configured window, in ms — falls back to {@link DEFAULT_RATE_LIMIT_WINDOW_MS}. */
const windowMs = () =>
    environmentNumber('NODE_RATE_LIMIT_WINDOW_MS', DEFAULT_RATE_LIMIT_WINDOW_MS, 1);

/**
 * What a caller sees when a budget is spent: the shared error envelope, never express-rate-limit's
 * own plain-text body.
 *
 * `audit` is opt-in per limiter. The credential budgets record every refusal — a burst of them IS
 * what credential stuffing looks like, and the one signal that arrives before an account is taken.
 * The global brake does not: a port scan would just bury the trail in noise.
 */
const refuse =
    (audit: boolean) =>
    (request: Request, response: Response): Response => {
        if (audit)
            emitAuditEvent(
                buildAuditEvent(callerContextOf(request), {
                    action: coreAuditActions.SECURITY_RATE_LIMIT_HIT,
                    outcome: 'failure',
                    metadata: { route: request.path, method: request.method }
                })
            );

        return rejectResponse(response, 429, [
            { code: 'RATE_LIMITED', message: t('generic.error-rate-limited') }
        ]);
    };

/**
 * The options every limiter shares, with the store and the audit choice as the only per-limiter
 * variables.
 *
 * @param store - where this limiter's counters live — see `rate-limit-store.ts`
 * @param audit - whether a refusal emits an audit event — see {@link refuse}
 */
const limiterOptions = (store: Store, audit: boolean) => ({
    store,
    windowMs: windowMs(),
    // draft-7 rate-limit headers (RateLimit-*), not the deprecated X-RateLimit-* set.
    standardHeaders: 'draft-7' as const,
    legacyHeaders: false,
    /*
     * A store that cannot answer lets the request through, rather than answering 500. Failing
     * closed would turn a Redis blip into an authentication outage — worse than a window with
     * unenforced budgets. The outage is logged at `error` once, so it is never a silent one.
     */
    passOnStoreError: true,
    handler: refuse(audit)
});

/**
 * The burst brake: requests per address per window, across the whole surface.
 *
 * Mounted globally in `app/security.ts` rather than per route, so a request that matches no route
 * counts too — a scanner sweeping for paths that do not exist is the traffic most worth braking.
 */
export const rateLimiter = rateLimit({
    ...limiterOptions(rateLimitStore('global'), false),
    limit: environmentNumber('NODE_RATE_LIMIT_MAX', DEFAULT_RATE_LIMIT_MAX, 1)
});

/**
 * Who a credential attempt names, normalised the way the login lookup normalises it — otherwise
 * `Ada@Example.com` and `ada@example.com` are two budgets for one account.
 *
 * Hashed because the key reaches Redis, and a `KEYS *` or RDB dump should not hand over the user
 * list. An attempt naming nobody is bucketed as `anonymous`, which still costs something.
 */
const identityOf = (request: Request): string => {
    const body: unknown = request.body;
    const named =
        typeof body === 'object' && body !== null
            ? ((body as Record<string, unknown>).email ??
              (body as Record<string, unknown>).username)
            : undefined;
    const identity = typeof named === 'string' ? named.trim().toLowerCase() : '';

    return createHash('sha256')
        .update(identity || 'anonymous')
        .digest('hex');
};

/**
 * The credential budgets, for the routes that accept a password or mint a token.
 *
 * TWO independent limiters: one bounds failed attempts against ONE account (defeats a botnet
 * spreading guesses), the other bounds attempts from ONE host (defeats spraying a user list).
 * Keying on the PAIR instead is the weakest of the three — either half varied gets a fresh bucket.
 *
 * `skipSuccessfulRequests` on both: only FAILURES spend the budget, so a shared address (an
 * office, CI, the e2e suite) is never locked out by people getting it right. Exported as an array
 * because Express flattens one, so a route cannot apply half of the pair.
 *
 * See: docs/tools/security.md#the-rate-limit-budgets
 */
export const credentialLimiters: RequestHandler[] = [
    rateLimit({
        ...limiterOptions(rateLimitStore('credentials-identity'), true),
        limit: environmentNumber('NODE_AUTH_RATE_LIMIT_MAX', DEFAULT_AUTH_RATE_LIMIT_MAX, 1),
        skipSuccessfulRequests: true,
        keyGenerator: identityOf
    }),
    rateLimit({
        ...limiterOptions(rateLimitStore('credentials-address'), true),
        limit: environmentNumber(
            'NODE_AUTH_RATE_LIMIT_ADDRESS_MAX',
            DEFAULT_AUTH_RATE_LIMIT_ADDRESS_MAX,
            1
        ),
        skipSuccessfulRequests: true
    })
];

/**
 * The budget for public submissions that cause an outbound email.
 *
 * Unlike `credentialLimiters`, a SUCCESSFUL request spends it: the abuse here is a well-formed
 * submission repeated, not a failed one — every abusive contact-form post gets a 201, so
 * `skipSuccessfulRequests` would change nothing about the amplifier this exists to bound. Keyed on
 * the caller's address (the default `keyGenerator`), since the only identity a contact form
 * carries beyond that is free text a spammer varies for free.
 *
 * See: docs/tools/security.md#the-rate-limit-budgets
 */
export const submissionLimiter: RequestHandler = rateLimit({
    ...limiterOptions(rateLimitStore('submissions'), true),
    limit: environmentNumber('NODE_SUBMISSION_RATE_LIMIT_MAX', DEFAULT_SUBMISSION_RATE_LIMIT_MAX, 1)
});

/**
 * The budget for routes that accept an image upload.
 *
 * Image processing (the `worker.image.digest` pipeline — see `docs/tools/image-processing.md`) is
 * CPU-bound: decoding and re-encoding is real work whether it runs in the request (no broker
 * configured) or in a worker consuming one job at a time. The global brake alone was sized for
 * ordinary browsing, not for gating something that expensive, so a burst of well-formed upload
 * requests is a cheap way to saturate it. Spent by success, like `submissionLimiter`, for the same
 * reason: the cost is in a well-formed request being processed, not in a failed one.
 *
 * See: docs/tools/security.md#the-rate-limit-budgets
 */
export const uploadLimiter: RequestHandler = rateLimit({
    ...limiterOptions(rateLimitStore('uploads'), true),
    limit: environmentNumber('NODE_UPLOAD_RATE_LIMIT_MAX', DEFAULT_UPLOAD_RATE_LIMIT_MAX, 1)
});

/**
 * Guards the Prometheus scrape endpoint with a static bearer credential — Prometheus cannot hold a
 * session, so the admin JWT the other observability routes use is not available to it.
 *
 * DENY by default when `NODE_METRICS_TOKEN` is unset, and `timingSafeEqual` rather than `===`,
 * which would leak the token's prefix to anyone willing to measure.
 *
 * See: docs/tools/security.md#why-the-metrics-endpoint-has-its-own-credential
 */
export const isMetricsScraper = (request: Request, response: Response, next: NextFunction) => {
    const expected = process.env.NODE_METRICS_TOKEN;

    if (!expected) {
        logger.warn({
            message:
                'NODE_METRICS_TOKEN is not set — /observability/metrics is refusing every request.'
        });
        rejectResponse(response, 503, []);
        return;
    }

    // The scheme is required, not stripped-if-present: a bare token would mean the credential is
    // read from a header shape no client should be sending — one more way for it to leak.
    const authorization = request.header('Authorization') ?? '';
    const provided = authorization.startsWith('Bearer ')
        ? authorization.slice('Bearer '.length)
        : '';
    const expectedBytes = Buffer.from(expected);
    const providedBytes = Buffer.from(provided);

    // `timingSafeEqual` throws on a length mismatch, which would itself be a length oracle — so
    // the lengths are compared first and the result folded into one boolean.
    const matches =
        expectedBytes.length === providedBytes.length &&
        timingSafeEqual(expectedBytes, providedBytes);

    if (!matches) {
        rejectResponse(response, 401, []);
        return;
    }

    next();
};
