/**
 * @module
 * Rate limiting's shared machinery, plus the three budgets no module owns.
 *
 * Owns:    the global burst brake (`rateLimiter`), the api-key budget (`apiKeyLimiter`,
 *          credential-keyed), and the image-upload budget (`uploadLimiter`, shared by `account`,
 *          `products` and `users`).
 * Shares:  {@link buildRateLimiter} — every module's own `rate-limits.ts` budget goes through the
 *          same factory as this file's three.
 * Backing: one Redis-or-memory store (`rate-limit-store.ts`), fails open on a store error, answers
 *          through the shared error envelope, never express-rate-limit's own plain-text body.
 *
 * See: docs/tools/security.md#the-rate-limit-budgets
 */

import { createHash } from 'node:crypto';
import { isIPv4 } from 'node:net';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { constantTimeEqual } from '@infrastructure/security/constant-time';
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
import { refuseAntibot } from '@infrastructure/http/middlewares/antibot-log';
import type { RateLimitBudget } from '@types';

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
 * Image uploads allowed per window, per ADDRESS.
 *
 * Sized well above what one legitimate session needs (bulk product-image edits included) and well
 * below the global brake — the cost here is CPU (the `worker.image.digest` pipeline), not a spam
 * email, so `skipSuccessfulRequests` stays off: a well-formed upload is the expensive case, not a
 * rejected one.
 */
export const DEFAULT_UPLOAD_RATE_LIMIT_MAX = 20;

/**
 * Requests allowed per window, per api-key CREDENTIAL.
 *
 * Sized like a payment webhook's own budget: well above one legitimate integration's steady
 * state, well below the global brake, so it bounds a misbehaving or compromised credential
 * without a partner ever noticing it during normal use.
 */
export const DEFAULT_API_KEY_RATE_LIMIT_MAX = 120;

/**
 * What a caller sees when a budget is spent: the shared error envelope, never express-rate-limit's
 * own plain-text body.
 *
 * `audit` is opt-in per budget. The credential budgets record every refusal — a burst of them IS
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

        /*
         * Every refusal, audited or not — `installSecurity` mounts these limiters before
         * `installRequestContext` mounts the request logger, so a 429 short-circuits before
         * anything else would record it, leaving the global brake with no trace at all.
         */
        return refuseAntibot('rate-limit', request, response, 429, [
            { code: 'RATE_LIMITED', message: t('generic.error-rate-limited') }
        ]);
    };

/**
 * A {@link RateLimitBudget}'s data, turned into the actual Express middleware — the single place
 * every module-owned and infrastructure-owned limiter alike is built from.
 */
export const buildRateLimiter = (budget: RateLimitBudget): RequestHandler =>
    rateLimit({
        store: rateLimitStore(budget.namespace),
        windowMs:
            budget.windowMs === 'shared'
                ? environmentNumber('NODE_RATE_LIMIT_WINDOW_MS', DEFAULT_RATE_LIMIT_WINDOW_MS, 1)
                : budget.windowMs,
        // draft-7 rate-limit headers (RateLimit-*), not the deprecated X-RateLimit-* set.
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        /*
         * A store that cannot answer lets the request through, rather than answering 500. Failing
         * closed would turn a Redis blip into an authentication outage — worse than a window with
         * unenforced budgets. The outage is logged at `error` once, so it is never a silent one.
         */
        passOnStoreError: true,
        handler: refuse(budget.audited),
        limit: environmentNumber(budget.environmentVariable, budget.defaultMax, 1),
        skipSuccessfulRequests: budget.skipSuccessfulRequests ?? false,
        ...(budget.keyGenerator ? { keyGenerator: budget.keyGenerator } : {}),
        ...(budget.requestWasSuccessful
            ? { requestWasSuccessful: budget.requestWasSuccessful }
            : {}),
        ...(budget.requestPropertyName ? { requestPropertyName: budget.requestPropertyName } : {})
    });

/**
 * Who a credential attempt names, normalised the way the login lookup normalises it — otherwise
 * `Ada@Example.com` and `ada@example.com` are two budgets for one account.
 *
 * Hashed because the key reaches Redis, and a `KEYS *` or RDB dump should not hand over the user
 * list. An attempt naming nobody is bucketed as `anonymous`, which still costs something.
 *
 * Shared machinery: reused by `account`'s credential/signup/reset budgets and `feedback`'s
 * contact-identity budget — every budget keyed on a submitted email rather than the caller's
 * address.
 */
export const identityOf = (request: Request): string => {
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
 * The caller's address, WIDENED to the block it belongs to: an IPv4 /24, an IPv6 /64. A
 * residential-proxy pool costs about $20 for millions of addresses, and one IPv6 customer is
 * allocated 18 quintillion of them — bucketing on the single address lets either look like an
 * unbounded number of callers. IPv6 grouping reuses `express-rate-limit`'s own subnet helper,
 * `ipKeyGenerator` (the same one its default per-address keying calls internally, at a coarser
 * /56); IPv4 has no library equivalent to reuse, so the /24 mask is hand-rolled.
 *
 * Shared machinery, same reasoning as {@link identityOf}: reused by every module's own
 * address-block budget, and by `account`'s challenge-less MFA fallback.
 *
 * See: docs/tools/security.md#the-rate-limit-budgets
 */
export const addressBlockOf = (request: Request): string => {
    const { ip } = request;
    if (!ip) return 'unknown';
    return isIPv4(ip) ? `${ip.split('.').slice(0, 3).join('.')}.0/24` : ipKeyGenerator(ip, 64);
};

/** This file's own budget: the global browsing brake, mounted in `app/security.ts`. */
const GLOBAL_RATE_LIMIT_BUDGET: RateLimitBudget = {
    name: 'Browsing (global)',
    namespace: 'global',
    environmentVariable: 'NODE_RATE_LIMIT_MAX',
    defaultMax: DEFAULT_RATE_LIMIT_MAX,
    windowMs: 'shared',
    keyedBy: 'address',
    bounds:
        'Every request across the whole surface — a scanner sweeping for paths that do not exist ' +
        'is the traffic most worth braking, same as a browsing session.',
    audited: false
};

/**
 * The burst brake: requests per address per window, across the whole surface.
 *
 * Mounted globally in `app/security.ts` rather than per route, so a request that matches no route
 * counts too — see {@link GLOBAL_RATE_LIMIT_BUDGET}.
 */
export const rateLimiter: RequestHandler = buildRateLimiter(GLOBAL_RATE_LIMIT_BUDGET);

/** This file's own budget: `apiKeyLimiter`, run from inside `getAuth`'s credential branch. */
const API_KEY_RATE_LIMIT_BUDGET: RateLimitBudget = {
    name: 'Api-key requests',
    namespace: 'api-key',
    environmentVariable: 'NODE_API_KEY_RATE_LIMIT_MAX',
    defaultMax: DEFAULT_API_KEY_RATE_LIMIT_MAX,
    windowMs: 'shared',
    keyedBy: 'the api-key credential',
    bounds:
        'A request authenticated via an api-key — keyed on the CREDENTIAL, not the address: a ' +
        'partner behind one NAT is one caller, and ten partners behind one CDN are ten, which an ' +
        'address-keyed budget cannot tell apart.',
    audited: true,
    // `request.credentialId` is always present when this runs — `getAuth` only calls it after a
    // credential has resolved — so the `!` is safe, not a suppression.
    keyGenerator: (request) => request.credentialId!
};

/**
 * The budget for a request authenticated via an api-key. Run directly from `getAuth`'s credential
 * branch (`@kernel/middlewares/authorizations`) rather than mounted on any one route, so every
 * route reached through `getAuth` gets it for free. Layers on top of the global brake, never in
 * place of it — see {@link API_KEY_RATE_LIMIT_BUDGET}.
 */
export const apiKeyLimiter: RequestHandler = buildRateLimiter(API_KEY_RATE_LIMIT_BUDGET);

/** This file's own budget: `uploadLimiter`, shared by `account`, `products` and `users`. */
const UPLOAD_RATE_LIMIT_BUDGET: RateLimitBudget = {
    name: 'Image uploads',
    namespace: 'uploads',
    environmentVariable: 'NODE_UPLOAD_RATE_LIMIT_MAX',
    defaultMax: DEFAULT_UPLOAD_RATE_LIMIT_MAX,
    windowMs: 'shared',
    keyedBy: 'address',
    bounds:
        'Routes that accept an image upload. Image processing (the `worker.image.digest` ' +
        'pipeline) is CPU-bound, decoding and re-encoding real work whether it runs inline or in ' +
        'a worker consuming one job at a time — a burst of well-formed upload requests is a cheap ' +
        'way to saturate what the global brake alone was sized for ordinary browsing, not this.',
    audited: true
};

/**
 * The budget for routes that accept an image upload — `account`, `products` and `users` all mount
 * it, which is why it lives here rather than on any one of their manifests. See
 * {@link UPLOAD_RATE_LIMIT_BUDGET}.
 */
export const uploadLimiter: RequestHandler = buildRateLimiter(UPLOAD_RATE_LIMIT_BUDGET);

/**
 * This file's own {@link RateLimitBudget}s — the three declared just above, combined with every
 * module's `AppModule.rateLimits` (`resolveRateLimits` in `@kernel/registry`) by the docs
 * generator and `tests/cross-cutting/rate-limit-budgets.test.ts` for the complete list.
 */
export const INFRASTRUCTURE_RATE_LIMITS: readonly RateLimitBudget[] = [
    GLOBAL_RATE_LIMIT_BUDGET,
    API_KEY_RATE_LIMIT_BUDGET,
    UPLOAD_RATE_LIMIT_BUDGET
];

/**
 * Guards the Prometheus scrape endpoint with a static bearer credential — Prometheus cannot hold a
 * session, so the bearer token the other observability routes check
 * `platform.observability.any.read` on is not available to it.
 *
 * DENY by default when `NODE_METRICS_TOKEN` is unset, and `constantTimeEqual` rather than `===`,
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

    if (!constantTimeEqual(expected, provided)) {
        rejectResponse(response, 401, []);
        return;
    }

    next();
};
