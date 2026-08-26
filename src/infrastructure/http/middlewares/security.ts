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
 * Default window and per-address budget, used when the `NODE_RATE_LIMIT_*` variables are unset:
 * 100 requests per MINUTE, sized for browsing rather than for guessing.
 *
 * The test suites raise it tenfold — see `tests/support/setup.ts`.
 *
 * See: docs/tools/security.md#the-two-rate-limit-budgets
 */
export const DEFAULT_RATE_LIMIT_WINDOW_MS = 60 * 1000;
export const DEFAULT_RATE_LIMIT_MAX = 100;

/**
 * Failed credential attempts allowed per window, per ACCOUNT named and per ADDRESS calling.
 *
 * Two numbers because they are two budgets — see `credentialLimiters`. The per-account one is the
 * smaller: guessing at one account is the attack, and someone signing in on several devices is not.
 */
export const DEFAULT_AUTH_RATE_LIMIT_MAX = 10;
export const DEFAULT_AUTH_RATE_LIMIT_ADDRESS_MAX = 30;

const windowMs = () =>
    environmentNumber('NODE_RATE_LIMIT_WINDOW_MS', DEFAULT_RATE_LIMIT_WINDOW_MS, 1);

/**
 * What a caller sees when a budget is spent: the shared error envelope, never express-rate-limit's
 * own plain-text body, and `Retry-After` so a well-behaved client can wait rather than hammer.
 *
 * `audit` is opt-in per limiter. The credential budgets record every refusal, because a burst of
 * them IS what credential stuffing looks like from the inside and it is the one signal that arrives
 * before an account is taken rather than after. The global brake does not: a port scan would fill
 * the trail with noise and bury exactly the entries worth reading.
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

const limiterOptions = (store: Store, audit: boolean) => ({
    store,
    windowMs: windowMs(),
    standardHeaders: 'draft-7' as const,
    legacyHeaders: false,
    /*
     * A store that cannot answer lets the request through, rather than answering 500.
     *
     * This is the fail-open choice made explicit — see `rate-limit-store.ts`. Failing closed would
     * turn a Redis blip into an authentication outage: nobody could sign in, which is a worse
     * failure than a window during which the budgets are not enforced. The outage is logged at
     * `error` level once, so it is never a silent one.
     */
    passOnStoreError: true,
    handler: refuse(audit)
});

/*
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
 * Hashed because the key reaches Redis, and a `KEYS *` or an RDB dump should not hand over the
 * user list. An attempt naming nobody is bucketed as `anonymous`: it still costs something,
 * because a flood of shapeless requests at a credential route is itself the attack.
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
 * TWO independent limiters, applied together, and that is the whole design:
 *
 * - the first bounds failed attempts against ONE account, however many hosts they come from. It is
 *   what a botnet spreading its guesses defeats when the key is the address alone.
 * - the second bounds failed attempts from ONE host, however many accounts they name. It is what a
 *   single machine spraying a user list defeats when the key is the account alone.
 *
 * Keying on the PAIR — `email|ip` — reads like it does both and does neither: an attacker who
 * varies either half gets a fresh bucket, so the pair is the weakest of the three keys rather than
 * the strongest. Two buckets cost one extra store round-trip and close both holes.
 *
 * `skipSuccessfulRequests` on both, so only FAILURES spend the budget: proving the password is the
 * strongest possible evidence that this caller is not guessing, and a shared address — an office,
 * a CI runner, the paired frontend's e2e suite — must not be locked out by people getting it right.
 *
 * Exported as an array because Express flattens one, so a route reads
 * `router.post('/login', credentialLimiters, postLogin)` and cannot apply half of the pair.
 *
 * See: docs/tools/security.md#the-two-rate-limit-budgets
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

    // The scheme is required, not stripped-if-present: accepting a bare token would mean the
    // credential is read from a header shape no client should be sending, which is one more way
    // for it to end up somewhere it was not meant to be.
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
