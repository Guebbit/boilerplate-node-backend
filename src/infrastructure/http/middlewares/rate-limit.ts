/**
 * @module
 * Rate limiting's shared machinery, plus the three budgets no module owns.
 *
 * Owns:    the global burst brake (`rateLimiter`), the api-key budget (`apiKeyLimiter`,
 *          credential-keyed), and the image-upload budget (`uploadLimiter`, shared by `account`,
 *          `products` and `users`).
 * Shares:  {@link buildRateLimiter} — every module's own `rate-limits.ts` budget goes through the
 *          same factory as this file's three.
 * Backing: one Redis-or-memory store (`rate-limit-store.ts`) that falls back to counting in memory
 *          on a store error, answers through the shared error envelope, never express-rate-limit's
 *          own plain-text body.
 *
 * See: docs/tools/security.md#the-rate-limit-budgets
 */

import { isIPv4 } from 'node:net';
import type { Request, RequestHandler, Response } from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import type { RateLimitInfo, Store } from 'express-rate-limit';
import { t } from '@infrastructure/i18n';
import { logger } from '@infrastructure/adapters/logger';
import { recordAudit, coreAuditActions } from '@infrastructure/observability/audit';
import { rateLimitRefusalsTotal } from '@infrastructure/observability/metrics-rate-limit';
import { rateLimitStore } from '@infrastructure/http/middlewares/rate-limit-store';
import { rateLimitBudgetConfig, rateLimitConfig } from '@infrastructure/http/config';
import { callerContextOf } from '@infrastructure/http/request';
import { refuseAntibot } from '@infrastructure/http/middlewares/antibot-log';
import { normalizeEmail } from '@infrastructure/persistence/normalize-email';
import { pseudonymise } from '@infrastructure/security/pseudonymise';
import type { RateLimitBudget } from '@types';
import { ERROR_CODES } from '@api/error-codes';

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
 * `audited` is opt-in per budget. The credential budgets record every refusal — a burst of them IS
 * what credential stuffing looks like, and the one signal that arrives before an account is taken.
 * The global brake does not: a port scan would just bury the trail in noise.
 */
export const refuseRateLimited =
    (budget: Pick<RateLimitBudget, 'namespace' | 'audited'>) =>
    (request: Request, response: Response): Response => {
        rateLimitRefusalsTotal.inc({ budget: budget.namespace });
        if (budget.audited)
            recordAudit(callerContextOf(request), {
                action: coreAuditActions.SECURITY_RATE_LIMIT_HIT,
                outcome: 'failure',
                metadata: { route: request.path, method: request.method }
            });

        /*
         * Every refusal, audited or not — `installSecurity` mounts these limiters before
         * `installRequestContext` mounts the request logger, so a 429 short-circuits before
         * anything else would record it, leaving the global brake with no trace at all.
         */
        return refuseAntibot('rate-limit', request, response, 429, [
            { code: ERROR_CODES.RATE_LIMITED, message: t('generic.error-rate-limited') }
        ]);
    };

/**
 * Where express-rate-limit's own configuration checks report, in place of its default `console`.
 *
 * The one that matters is an `X-Forwarded-For` arriving while `trust proxy` is off: a proxy sits in
 * front and nobody counted it, so every caller shares one bucket. The library checks once per
 * limiter, on its first request.
 * https://express-rate-limit.mintlify.app/reference/error-codes
 */
const limiterLogger = {
    warn: (problem: unknown): void =>
        logger.warn('rate-limit: express-rate-limit warns about this deployment', problem),
    error: (problem: unknown): void =>
        logger.error('rate-limit: express-rate-limit reports a misconfiguration', problem)
};

/**
 * The typed reader of one budget's variable, built once per namespace: defining a config slice
 * is not free, and a budget's limit is asked for more than once while its limiter is built.
 */
const limitReaders = new Map<string, ReturnType<typeof rateLimitBudgetConfig>>();

/**
 * The request ceiling a budget's variable configures, or its default. The variable is read at
 * call time, so an environment changed after the reader was built is honoured.
 *
 * @param budget - the budget to read
 */
const budgetLimit = (budget: RateLimitBudget): number => {
    const reader =
        limitReaders.get(budget.namespace) ?? rateLimitBudgetConfig(budget.namespace, [budget]);
    limitReaders.set(budget.namespace, reader);
    return reader()[budget.environmentVariable];
};

/**
 * A {@link RateLimitBudget}'s data, turned into the actual Express middleware — the single place
 * every module-owned and infrastructure-owned limiter alike is built from.
 */
export const buildRateLimiter = (budget: RateLimitBudget): RequestHandler =>
    rateLimit({
        store: rateLimitStore(
            budget.namespace,
            budget.onStoreError ?? 'memory',
            budget.escalation && { limit: budgetLimit(budget), ...budget.escalation }
        ),
        windowMs:
            budget.windowMs === 'shared'
                ? rateLimitConfig().NODE_RATE_LIMIT_WINDOW_MS
                : budget.windowMs,
        // draft-7 rate-limit headers (RateLimit-*), not the deprecated X-RateLimit-* set.
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        /*
         * Only a `pass` budget lets a request through when its store cannot answer. Every other
         * budget's store falls back to counting in this process (see `failoverStore`), so a Redis
         * blip is neither an authentication outage nor an open door. Logged once per outage.
         */
        passOnStoreError: budget.onStoreError === 'pass',
        handler: refuseRateLimited(budget),
        // `logger` shipped in express-rate-limit 8.5.0. https://github.com/express-rate-limit/express-rate-limit/releases
        logger: limiterLogger,
        limit: budgetLimit(budget),
        skipSuccessfulRequests: budget.skipSuccessfulRequests ?? false,
        ...(budget.keyGenerator ? { keyGenerator: budget.keyGenerator } : {}),
        ...(budget.requestWasSuccessful
            ? { requestWasSuccessful: budget.requestWasSuccessful }
            : {}),
        ...(budget.requestPropertyName ? { requestPropertyName: budget.requestPropertyName } : {}),
        ...(budget.skip ? { skip: budget.skip } : {})
    });

/**
 * One store per budget charged by hand, built on first use. A budget charged through
 * {@link chargeBudget} must count in ONE store whichever door charges it, or an in-process store
 * would hold a separate tally per door.
 */
const chargedStores = new Map<string, Store>();

/**
 * The store a hand-charged budget counts in, built and initialised once.
 *
 * @param budget - the budget whose window and failure policy the store takes
 */
const chargedStoreOf = (budget: RateLimitBudget): Store => {
    const existing = chargedStores.get(budget.namespace);
    if (existing) return existing;

    const store = rateLimitStore(budget.namespace, budget.onStoreError ?? 'memory');
    // The one option a store reads, replayed here because no `rateLimit()` instance calls `init`.
    void store.init?.({
        windowMs:
            budget.windowMs === 'shared'
                ? rateLimitConfig().NODE_RATE_LIMIT_WINDOW_MS
                : budget.windowMs
    } as Parameters<NonNullable<Store['init']>>[0]);
    chargedStores.set(budget.namespace, store);
    return store;
};

/** What {@link chargeBudget} answers: whether the charge fit, and how long until the window resets. */
export interface BudgetCharge {
    /** False once the key has spent the budget; the work it asked for must not run. */
    allowed: boolean;
    /** Whole seconds until the key's window resets, at least 1 — for a `Retry-After` header. */
    retryAfterSeconds: number;
}

/**
 * Spend one unit of a budget for `key`, from code that is not an Express route — the way a service
 * charges a recipient it chose itself. Counts in the same store, window and limit as the budget's
 * own middleware would, so one budget has one tally.
 *
 * @param budget - the declared budget (its limit is `budgetLimit`'s, env override included)
 * @param key - what is being counted, already pseudonymised if it names a person
 */
export const chargeBudget = async (budget: RateLimitBudget, key: string): Promise<BudgetCharge> => {
    // `await` rather than a chain: a rejection (a `pass` budget's store down) belongs to the caller,
    // who knows what refusing means for its own door.
    const { totalHits, resetTime } = await chargedStoreOf(budget).increment(key);

    return {
        allowed: totalHits <= budgetLimit(budget),
        retryAfterSeconds: Math.max(
            1,
            Math.ceil(((resetTime?.getTime() ?? Date.now()) - Date.now()) / 1000)
        )
    };
};

/**
 * `keyedBy` label for a budget bucketed on the caller's single address — shared so every such
 * budget's row in the generated table (`docs/tools/security.md#the-rate-limit-budgets`) reads as
 * the same sentence.
 */
export const KEYED_BY_ADDRESS = 'address';

/** `keyedBy` label for a budget bucketed on the caller's address BLOCK — see {@link addressBlockOf}. */
export const KEYED_BY_ADDRESS_BLOCK = 'address block (IPv4 /24, IPv6 /64)';

/** `keyedBy` label for a budget bucketed on a submitted email — see {@link identityOf}. */
export const KEYED_BY_SUBMITTED_EMAIL =
    'the submitted email, normalised and pseudonymised (falls back to address block when absent)';

/** `keyedBy` label for a budget bucketed on the caller's authenticated account. */
export const KEYED_BY_AUTHENTICATED_ACCOUNT = 'the authenticated account';

/**
 * The account-keyed budget's `keyGenerator`: the caller's account, resolved by `getAuth` before
 * any route that mounts such a budget runs — so `authContext` is always present and the `!` is a
 * fact `isAuth` already proved, not a suppression.
 */
export const accountIdOf = (request: Request): string => request.authContext!.id;

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
 * Pseudonymised (keyed HMAC, never a bare hash) because the key reaches Redis: a `KEYS *` or RDB
 * dump must not hand over the user list, and a bare `sha256(email)` is dictionary-attacked from a
 * breach list.
 *
 * An attempt naming nobody falls back to the caller's address block, not one shared bucket. A
 * multipart body is still unparsed when a limiter runs, so a shared bucket would let five junk
 * uploads lock every multipart signup out site-wide.
 *
 * Shared machinery: reused by every module's own budget keyed on a submitted email rather than
 * the caller's address.
 */
export const identityOf = (request: Request): string => {
    const named = readBodyField(request, 'email') ?? readBodyField(request, 'username');
    const identity = named ? normalizeEmail(named) : undefined;
    if (!identity) return `anon:${addressBlockOf(request)}`;

    return pseudonymise('rate-limit', identity);
};

/**
 * A budget's own {@link RateLimitInfo} off `request`, under the name its `requestPropertyName`
 * chose — `undefined` when the limiter never ran, or a `pass` budget's store error let the
 * request through without recording anything. A `memory` budget keeps counting through an outage,
 * so a gate reads the fallback's numbers; a gate must still treat `undefined` as "not yet", never
 * as the reason a request fails.
 *
 * @param property - the budget's own `requestPropertyName`
 */
export const rateLimitInfoOf = (request: Request, property: string): RateLimitInfo | undefined =>
    (request as Request & Record<string, RateLimitInfo | undefined>)[property];

/**
 * The caller's address, WIDENED to the block it belongs to: an IPv4 /24, an IPv6 /64. A
 * residential-proxy pool costs about $20 for millions of addresses, and one IPv6 customer is
 * allocated 18 quintillion of them — bucketing on the single address lets either look like an
 * unbounded number of callers.
 *
 * `ipKeyGenerator` runs FIRST because Node listens dual-stack, so a plain IPv4 caller arrives as
 * `::ffff:a.b.c.d`. The helper unmaps that form (to the bare IPv4 address) and masks a genuine
 * IPv6 address to its /64. Only then is an IPv4 result masked to its /24 by hand — the library has
 * no IPv4 block helper. Branching on `isIPv4(ip)` before the helper would send the mapped form
 * past the mask, one bucket per address.
 * https://express-rate-limit.mintlify.app/reference/ipv6
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
    // 64: the IPv6 prefix length kept. An IPv4 input is returned as is, an `::ffff:` one unmapped.
    const key = ipKeyGenerator(ip, 64);
    return isIPv4(key) ? `${key.split('.').slice(0, 3).join('.')}.0/24` : key;
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
    audited: false,
    // The one budget that lets a request through while the limits Redis is down: it guards
    // browsing, not a credential, and counting it per worker would only brake honest traffic.
    onStoreError: 'pass',
    // `GET /livez` and `GET /readyz` are an orchestrator's own probes, on a fixed interval — see
    // `RateLimitBudget.skip`.
    skip: (request) =>
        request.method === 'GET' && (request.path === '/livez' || request.path === '/readyz')
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
