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
import type { Request, RequestHandler, Response } from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import type { RateLimitInfo } from 'express-rate-limit';
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
 * `keyedBy` label for a budget bucketed on the caller's single address — shared so every such
 * budget's row in the generated table (`docs/tools/security.md#the-rate-limit-budgets`) reads as
 * the same sentence.
 */
export const KEYED_BY_ADDRESS = 'address';

/** `keyedBy` label for a budget bucketed on the caller's address BLOCK — see {@link addressBlockOf}. */
export const KEYED_BY_ADDRESS_BLOCK = 'address block (IPv4 /24, IPv6 /64)';

/** `keyedBy` label for a budget bucketed on a submitted email — see {@link identityOf}. */
export const KEYED_BY_SUBMITTED_EMAIL = 'the submitted email, normalised and hashed';

/** `keyedBy` label for a budget bucketed on the caller's authenticated account. */
export const KEYED_BY_AUTHENTICATED_ACCOUNT = 'the authenticated account';

/** `keyedBy` label for a budget bucketed on a hashed challenge string, falling back to the address block. */
export const KEYED_BY_CHALLENGE =
    'the challenge string, hashed (falls back to address block when absent)';

/**
 * One string field off a JSON request body — undefined when the body isn't an object, the field
 * is absent, or it isn't a string. The shape every keying function that reads a submitted value
 * (rather than the caller's address) goes through, so that shape check exists exactly once.
 *
 * @param field - the body property to read
 */
export const readBodyField = (request: Request, field: string): string | undefined => {
    const body: unknown = request.body;
    const value =
        typeof body === 'object' && body !== null
            ? (body as Record<string, unknown>)[field]
            : undefined;
    return typeof value === 'string' ? value : undefined;
};

/**
 * Who a credential attempt names, normalised the way the login lookup normalises it — otherwise
 * `Ada@Example.com` and `ada@example.com` are two budgets for one account.
 *
 * Hashed because the key reaches Redis, and a `KEYS *` or RDB dump should not hand over the user
 * list. An attempt naming nobody is bucketed as `anonymous`, which still costs something.
 *
 * Shared machinery: reused by every module's own budget keyed on a submitted email rather than
 * the caller's address.
 */
export const identityOf = (request: Request): string => {
    const named = readBodyField(request, 'email') ?? readBodyField(request, 'username');
    const identity = named?.trim().toLowerCase() ?? '';

    return createHash('sha256')
        .update(identity || 'anonymous')
        .digest('hex');
};

/**
 * A budget's own {@link RateLimitInfo} off `request`, under the name its `requestPropertyName`
 * chose — `undefined` when the limiter never ran, or a store error let the request through
 * without recording anything. Every gate built on this must fail open on that `undefined`: it
 * must never be the reason a request fails when the budget it reads already failed open.
 *
 * @param property - the budget's own `requestPropertyName`
 */
export const rateLimitInfoOf = (request: Request, property: string): RateLimitInfo | undefined =>
    (request as Request & Record<string, RateLimitInfo | undefined>)[property];

/**
 * The caller's address, WIDENED to the block it belongs to: an IPv4 /24, an IPv6 /64. A
 * residential-proxy pool costs about $20 for millions of addresses, and one IPv6 customer is
 * allocated 18 quintillion of them — bucketing on the single address lets either look like an
 * unbounded number of callers. IPv6 grouping reuses `express-rate-limit`'s own subnet helper,
 * `ipKeyGenerator` (the same one its default per-address keying calls internally, at a coarser
 * /56); IPv4 has no library equivalent to reuse, so the /24 mask is hand-rolled.
 *
 * Shared machinery, same reasoning as {@link identityOf}: reused by every module's own
 * address-block budget, and by any keying function that needs a fallback for a caller supplying
 * no identifying value of its own.
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
    keyedBy: KEYED_BY_ADDRESS,
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

/** This file's own budget: `uploadLimiter`, shared by every module whose routes accept an image upload. */
const UPLOAD_RATE_LIMIT_BUDGET: RateLimitBudget = {
    name: 'Image uploads',
    namespace: 'uploads',
    environmentVariable: 'NODE_UPLOAD_RATE_LIMIT_MAX',
    defaultMax: DEFAULT_UPLOAD_RATE_LIMIT_MAX,
    windowMs: 'shared',
    keyedBy: KEYED_BY_ADDRESS,
    bounds:
        'Routes that accept an image upload. Image processing (the `worker.image.digest` ' +
        'pipeline) is CPU-bound, decoding and re-encoding real work whether it runs inline or in ' +
        'a worker consuming one job at a time — a burst of well-formed upload requests is a cheap ' +
        'way to saturate what the global brake alone was sized for ordinary browsing, not this.',
    audited: true
};

/**
 * The budget for routes that accept an image upload — mounted by more than one module, which is
 * why it lives here rather than on any one of their manifests. See {@link UPLOAD_RATE_LIMIT_BUDGET}.
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
