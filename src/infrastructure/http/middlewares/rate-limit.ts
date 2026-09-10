/**
 * @module
 * Rate limiting: a global burst brake across the whole surface, budgets for the routes that accept
 * a credential, an email address (signup, password reset, the contact form) or an image upload —
 * each keyed on identity AND address AND address BLOCK (an IPv4 /24, an IPv6 /64), since a proxy
 * pool or a single IPv6 customer defeats a single-address budget alone. Every limiter shares one
 * Redis-or-memory store (see `rate-limit-store.ts`), fails open on a store error, and answers
 * through the shared error envelope rather than express-rate-limit's own plain-text body.
 */

import { createHash } from 'node:crypto';
import { isIPv4 } from 'node:net';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { rateLimit, ipKeyGenerator, type Store, type RateLimitInfo } from 'express-rate-limit';
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
import { humanChallengeGate } from '@infrastructure/http/middlewares/human-challenge';
import { refuseAntibot } from '@infrastructure/http/middlewares/antibot-log';

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
 * Failed credential attempts allowed per window, per ADDRESS BLOCK (an IPv4 /24, an IPv6 /64).
 *
 * The largest and coarsest of the three credential budgets — see `credentialLimiters`. Sized above
 * {@link DEFAULT_AUTH_RATE_LIMIT_ADDRESS_MAX} because a block is shared by many honest callers (an
 * office, a CGNAT pool, one IPv6 customer's whole allocation), not by one.
 */
export const DEFAULT_AUTH_RATE_LIMIT_BLOCK_MAX = 100;

/**
 * Signups allowed per window, per submitted EMAIL ADDRESS, normalised like `identityOf`.
 *
 * Signup has no account yet to key a failure budget on, so this — spent by SUCCESS, like
 * `DEFAULT_SUBMISSION_RATE_LIMIT_MAX` — is the whole of its identity budget. See `signupLimiters`.
 */
export const DEFAULT_SIGNUP_RATE_LIMIT_MAX = 5;

/** Signups allowed per window, per single caller ADDRESS. Spent by success, like the email budget. */
export const DEFAULT_SIGNUP_RATE_LIMIT_ADDRESS_MAX = 15;

/** Signups allowed per window, per caller ADDRESS BLOCK — see `DEFAULT_AUTH_RATE_LIMIT_BLOCK_MAX`. */
export const DEFAULT_SIGNUP_RATE_LIMIT_BLOCK_MAX = 40;

/**
 * Password-reset requests allowed per window, per submitted EMAIL ADDRESS.
 *
 * `postResetRequest` always answers 200, to prevent account enumeration — so, like signup, only a
 * budget spent by SUCCESS bounds anything here. See `resetRequestLimiters`.
 */
export const DEFAULT_RESET_RATE_LIMIT_MAX = 5;

/** Password-reset requests allowed per window, per single caller ADDRESS. */
export const DEFAULT_RESET_RATE_LIMIT_ADDRESS_MAX = 15;

/** Password-reset requests allowed per window, per caller ADDRESS BLOCK. */
export const DEFAULT_RESET_RATE_LIMIT_BLOCK_MAX = 40;

/**
 * Contact-form submissions allowed per window, per ADDRESS.
 *
 * A person files a contact request once; five a minute from one address is already generous,
 * against a global brake of {@link DEFAULT_RATE_LIMIT_MAX}. See `submissionLimiter` for why this
 * budget is spent by success rather than failure.
 */
export const DEFAULT_SUBMISSION_RATE_LIMIT_MAX = 5;

/** Contact-form submissions allowed per window, per submitted EMAIL ADDRESS. See `contactLimiters`. */
export const DEFAULT_SUBMISSION_RATE_LIMIT_EMAIL_MAX = 5;

/** Contact-form submissions allowed per window, per caller ADDRESS BLOCK. */
export const DEFAULT_SUBMISSION_RATE_LIMIT_BLOCK_MAX = 20;

/**
 * Image uploads allowed per window, per ADDRESS.
 *
 * Sized well above what one legitimate session needs (bulk product-image edits included) and well
 * below the global brake — see `uploadLimiter` for why this budget exists at all.
 */
export const DEFAULT_UPLOAD_RATE_LIMIT_MAX = 20;

/**
 * Payment webhook deliveries allowed per window, per ADDRESS.
 *
 * The provider is one caller, but its address is not this application's to size a global budget
 * around — see `webhookLimiter`. Sized for a burst of genuine deliveries (several events per order,
 * a sale driving many orders at once) well below the global brake, not for the one-per-order steady
 * state.
 */
export const DEFAULT_PAYMENT_WEBHOOK_RATE_LIMIT_MAX = 60;

/**
 * Requests allowed per window, per api-key CREDENTIAL — see `apiKeyLimiter`.
 *
 * Sized like `DEFAULT_PAYMENT_WEBHOOK_RATE_LIMIT_MAX`: well above one legitimate integration's
 * steady state, well below the global brake, so it bounds a misbehaving or compromised credential
 * without a partner ever noticing it during normal use.
 */
export const DEFAULT_API_KEY_RATE_LIMIT_MAX = 120;

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
 * The options every limiter shares, with the store and the audit choice as the only per-limiter
 * variables.
 *
 * @param store - where this limiter's counters live — see `rate-limit-store.ts`
 * @param audit - whether a refusal emits an audit event — see {@link refuse}
 */
const limiterOptions = (store: Store, audit: boolean) => ({
    store,
    windowMs: environmentNumber('NODE_RATE_LIMIT_WINDOW_MS', DEFAULT_RATE_LIMIT_WINDOW_MS, 1),
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
 * The caller's address, WIDENED to the block it belongs to: an IPv4 /24, an IPv6 /64. A
 * residential-proxy pool costs about $20 for millions of addresses, and one IPv6 customer is
 * allocated 18 quintillion of them — bucketing on the single address lets either look like an
 * unbounded number of callers. IPv6 grouping reuses `express-rate-limit`'s own subnet helper,
 * `ipKeyGenerator` (the same one its default per-address keying calls internally, at a coarser
 * /56); IPv4 has no library equivalent to reuse, so the /24 mask is hand-rolled.
 *
 * See: docs/tools/security.md#the-rate-limit-budgets
 */
const addressBlockOf = (request: Request): string => {
    const { ip } = request;
    if (!ip) return 'unknown';
    return isIPv4(ip) ? `${ip.split('.').slice(0, 3).join('.')}.0/24` : ipKeyGenerator(ip, 64);
};

/**
 * One rate-limit dimension built on this file's shared store/window/audit conventions — only the
 * namespace, budget, key and skip choice vary between callers. `credentialLimiters`' first two
 * entries and `submissionLimiter` predate this and stay hand-written; every other limiter below
 * composes it, so a new dimension on an existing budget, or a whole new budget, is one call rather
 * than a copy of the `rateLimit()` block.
 *
 * @param namespace - this dimension's Redis key prefix — see `rateLimitStore`
 * @param environmentVariable - the environment variable that overrides `defaultMax`
 * @param defaultMax - the budget when `environmentVariable` is unset
 * @param options.keyGenerator - what a request is bucketed by; omitted means the caller's single address
 * @param options.skipSuccessfulRequests - true bounds only FAILURES, like `credentialLimiters`
 */
const rateLimitOn = (
    namespace: string,
    environmentVariable: string,
    defaultMax: number,
    options: {
        keyGenerator?: (request: Request) => string;
        skipSuccessfulRequests?: boolean;
    } = {}
): RequestHandler =>
    rateLimit({
        ...limiterOptions(rateLimitStore(namespace), true),
        limit: environmentNumber(environmentVariable, defaultMax, 1),
        skipSuccessfulRequests: options.skipSuccessfulRequests ?? false,
        ...(options.keyGenerator ? { keyGenerator: options.keyGenerator } : {})
    });

/**
 * Where express-rate-limit stores the identity limiter's counter on `request` — a distinct name
 * because `credentialLimiters` chains three limiters and, by default, each one's info overwrites
 * the last. `loginChallengeGate` is the only reader.
 * https://express-rate-limit.mintlify.app/reference/configuration#requestpropertyname
 */
const IDENTITY_RATE_LIMIT_PROPERTY = 'credentialIdentityRateLimit';

/**
 * The credential budgets, for the routes that accept a password or mint a token.
 *
 * THREE independent limiters: one bounds failed attempts against ONE account (defeats a botnet
 * spreading guesses), one bounds attempts from ONE host (defeats spraying a user list), and one
 * bounds attempts from ONE address BLOCK (defeats a proxy pool or an IPv6 allocation spreading
 * across addresses within it). Keying on any pair instead is weaker still — a bucket refreshes
 * the moment any one key of the tuple changes.
 *
 * `skipSuccessfulRequests` on all three: only FAILURES spend the budget, so a shared address (an
 * office, CI, the e2e suite) is never locked out by people getting it right. Exported as an array
 * because Express flattens one, so a route cannot apply part of the set.
 *
 * See: docs/tools/security.md#the-rate-limit-budgets
 */
export const credentialLimiters: RequestHandler[] = [
    rateLimit({
        ...limiterOptions(rateLimitStore('credentials-identity'), true),
        limit: environmentNumber('NODE_AUTH_RATE_LIMIT_MAX', DEFAULT_AUTH_RATE_LIMIT_MAX, 1),
        skipSuccessfulRequests: true,
        keyGenerator: identityOf,
        requestPropertyName: IDENTITY_RATE_LIMIT_PROPERTY
    }),
    rateLimit({
        ...limiterOptions(rateLimitStore('credentials-address'), true),
        limit: environmentNumber(
            'NODE_AUTH_RATE_LIMIT_ADDRESS_MAX',
            DEFAULT_AUTH_RATE_LIMIT_ADDRESS_MAX,
            1
        ),
        skipSuccessfulRequests: true
    }),
    rateLimitOn(
        'credentials-block',
        'NODE_AUTH_RATE_LIMIT_BLOCK_MAX',
        DEFAULT_AUTH_RATE_LIMIT_BLOCK_MAX,
        { keyGenerator: addressBlockOf, skipSuccessfulRequests: true }
    )
];

/**
 * Fraction of the per-account failure budget that must already be spent before an otherwise
 * honest login attempt starts carrying rung 3's challenge. Never on a first, or even second,
 * mistyped password — but before a script gets to spend the rest of the budget unchallenged.
 */
const CHALLENGE_AFTER_IDENTITY_BUDGET_SPENT = 0.5;

/**
 * Whether this login attempt has already burned enough of its account's failure budget that
 * rung 3's challenge should apply. Missing rate-limit info (the identity limiter didn't run, or a
 * store error let the request through) reads as "not yet": this gate must never be the reason a
 * login fails when the budget it reads already failed open.
 */
const identityBudgetMostlySpent = (request: Request): boolean => {
    // The cast is the only way to read it: express-rate-limit stashes the info under a name chosen
    // at RUNTIME (`requestPropertyName`), which its `Request` augmentation cannot describe.
    const info = (request as Request & Record<string, RateLimitInfo | undefined>)[
        IDENTITY_RATE_LIMIT_PROPERTY
    ];
    if (!info) return false;
    return info.remaining <= info.limit * (1 - CHALLENGE_AFTER_IDENTITY_BUDGET_SPENT);
};

/**
 * Mounted between `credentialLimiters` and the login handler: passes through while the account's
 * failure budget is mostly unspent, delegates to `humanChallengeGate` once it is not. Keeps rung 3
 * off an honest first attempt while still gating a credential-stuffing run before it exhausts the
 * budget rung 1 already bounds.
 */
export const loginChallengeGate: RequestHandler = (request, response, next) =>
    identityBudgetMostlySpent(request) ? humanChallengeGate(request, response, next) : next();

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
 * The signup budgets — identity, address and address-block, none of them skipping success.
 *
 * `credentialLimiters` is the wrong shape for `POST /account/signup`: `skipSuccessfulRequests`
 * spends nothing on the 201s that ARE the abuse (Sybil accounts), so a determined caller spent
 * this route's whole budget on requests that never counted. Shaped like `submissionLimiter`
 * instead — every request counts — with `identityOf` added as a second dimension, since a
 * proxy pool cannot vary the mailbox it is registering.
 *
 * See: docs/tools/security.md#the-rate-limit-budgets
 */
export const signupLimiters: RequestHandler[] = [
    rateLimitOn('signup-identity', 'NODE_SIGNUP_RATE_LIMIT_MAX', DEFAULT_SIGNUP_RATE_LIMIT_MAX, {
        keyGenerator: identityOf
    }),
    rateLimitOn(
        'signup-address',
        'NODE_SIGNUP_RATE_LIMIT_ADDRESS_MAX',
        DEFAULT_SIGNUP_RATE_LIMIT_ADDRESS_MAX
    ),
    rateLimitOn(
        'signup-block',
        'NODE_SIGNUP_RATE_LIMIT_BLOCK_MAX',
        DEFAULT_SIGNUP_RATE_LIMIT_BLOCK_MAX,
        { keyGenerator: addressBlockOf }
    )
];

/**
 * The password-reset-request budgets — same three dimensions and the same reasoning as
 * `signupLimiters`. `postResetRequest` always answers 200 to avoid revealing whether an account
 * exists, which makes it, like signup, a route whose abuse is entirely on the success path.
 *
 * See: docs/tools/security.md#the-rate-limit-budgets
 */
export const resetRequestLimiters: RequestHandler[] = [
    rateLimitOn('reset-identity', 'NODE_RESET_RATE_LIMIT_MAX', DEFAULT_RESET_RATE_LIMIT_MAX, {
        keyGenerator: identityOf
    }),
    rateLimitOn(
        'reset-address',
        'NODE_RESET_RATE_LIMIT_ADDRESS_MAX',
        DEFAULT_RESET_RATE_LIMIT_ADDRESS_MAX
    ),
    rateLimitOn(
        'reset-block',
        'NODE_RESET_RATE_LIMIT_BLOCK_MAX',
        DEFAULT_RESET_RATE_LIMIT_BLOCK_MAX,
        {
            keyGenerator: addressBlockOf
        }
    )
];

/**
 * The contact-form budgets: `submissionLimiter` (address) plus the two dimensions Rung 1 adds —
 * identity and address-block. The form carries no identity beyond free text EXCEPT the sender's
 * own email, which `identityOf` reads exactly like the credential and signup budgets do.
 *
 * See: docs/tools/security.md#the-rate-limit-budgets
 */
export const contactLimiters: RequestHandler[] = [
    submissionLimiter,
    rateLimitOn(
        'submission-identity',
        'NODE_SUBMISSION_RATE_LIMIT_EMAIL_MAX',
        DEFAULT_SUBMISSION_RATE_LIMIT_EMAIL_MAX,
        { keyGenerator: identityOf }
    ),
    rateLimitOn(
        'submission-block',
        'NODE_SUBMISSION_RATE_LIMIT_BLOCK_MAX',
        DEFAULT_SUBMISSION_RATE_LIMIT_BLOCK_MAX,
        { keyGenerator: addressBlockOf }
    )
];

/**
 * Default attempts allowed against ONE login MFA challenge, used when `NODE_MFA_CHALLENGE_MAX`
 * is unset. Six digits is a million guesses; this is what stops a single challenge from being the
 * thing an attacker gets to try them against.
 */
const DEFAULT_MFA_CHALLENGE_MAX = 5;

/**
 * The bucket key both challenge limiters use: the challenge string itself, hashed so a credential
 * never becomes a store key. A request naming no challenge at all buckets together under one
 * shared key — still a real budget, just not a useful one to read individually.
 */
const challengeKey = (request: Request): string => {
    const body: unknown = request.body;
    const challenge =
        typeof body === 'object' && body !== null
            ? (body as Record<string, unknown>).challenge
            : undefined;
    return createHash('sha256')
        .update(typeof challenge === 'string' ? challenge : 'anonymous')
        .digest('hex');
};

/**
 * The budget for one login's second-factor challenge (`POST /account/login/2fa`) —
 * keyed on the CHALLENGE STRING itself, not the account or the address, and windowed to the
 * challenge's own lifetime rather than the shared `NODE_RATE_LIMIT_WINDOW_MS`. `credentialLimiters`
 * bounds guesses per account/address across every login attempt; this bounds guesses against ONE
 * still-live challenge, which an IP/account limit alone does not: a distributed attacker rotating
 * IPs is still capped per challenge, and six digits is only a million guesses to exhaust.
 *
 * See: docs/tools/security.md#the-rate-limit-budgets
 */
export const mfaChallengeLimiter: RequestHandler = rateLimit({
    store: rateLimitStore('mfa-challenge'),
    // account/services/two-factor.ts#MFA_CHALLENGE_DELIVERED_TTL_MS, restated rather than
    // imported: `account` depends on `infrastructure`, never the other way around. The LONGER of
    // the two challenge tiers, so a window can never end before the challenge it is bounding.
    windowMs: 600 * 1000,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    passOnStoreError: true,
    handler: refuse(true),
    limit: environmentNumber('NODE_MFA_CHALLENGE_MAX', DEFAULT_MFA_CHALLENGE_MAX, 1),
    keyGenerator: challengeKey
});

/**
 * Default deliveries allowed against ONE login challenge, used when `NODE_MFA_SEND_MAX` is unset.
 * Three is a first code plus two resends — enough for a slow mailbox, short of a useful cannon.
 */
const DEFAULT_MFA_SEND_MAX = 3;

/**
 * The budget for delivering login codes (`POST /account/login/2fa/send`) — keyed on the challenge
 * exactly like {@link mfaChallengeLimiter}, and separate from it because the two bound different
 * costs: that one bounds GUESSES, this one bounds outbound mail. Sharing a budget would let a
 * caller who typed three wrong codes lose the ability to be sent a right one.
 *
 * The service enforces a per-code cooldown on top of this. Both exist: the cooldown paces one
 * account's own resend button, this caps the total a single challenge can ever cause.
 *
 * See: docs/tools/security.md#the-rate-limit-budgets
 */
export const mfaSendLimiter: RequestHandler = rateLimit({
    store: rateLimitStore('mfa-send'),
    // Matched to the challenge's own longest lifetime, same reasoning as the limiter above.
    windowMs: 600 * 1000,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    passOnStoreError: true,
    handler: refuse(true),
    limit: environmentNumber('NODE_MFA_SEND_MAX', DEFAULT_MFA_SEND_MAX, 1),
    keyGenerator: challengeKey
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
 * The budget for `POST /payments/webhook` — the only unauthenticated WRITE surface this API has.
 *
 * A signature check is what actually authenticates a delivery, and an unsigned flood is cheap
 * (one HMAC each, then a 400) — this budget is not the defence against that. It exists because the
 * route is otherwise unbounded: the global brake covers routes it does not know are here for a
 * machine, not a browser, and every route this application answers deserves a stated ceiling rather
 * than a silent one. Shaped like `submissionLimiter`: `skipSuccessfulRequests` off, keyed on the
 * caller's address, because a genuine delivery (a `200`) is the traffic being bounded, not a
 * rejected one.
 *
 * See: docs/tools/security.md#the-rate-limit-budgets
 */
export const webhookLimiter: RequestHandler = rateLimit({
    ...limiterOptions(rateLimitStore('payment-webhook'), true),
    limit: environmentNumber(
        'NODE_PAYMENT_WEBHOOK_RATE_LIMIT_MAX',
        DEFAULT_PAYMENT_WEBHOOK_RATE_LIMIT_MAX,
        1
    )
});

/**
 * The budget for a request authenticated via an api-key — keyed on the CREDENTIAL, not the
 * address: a partner behind one NAT is one caller, and ten partners behind one CDN are ten, which
 * an address-keyed budget (the global brake) cannot tell apart. Run directly from `getAuth`'s
 * credential branch (`@kernel/middlewares/authorizations`) rather than mounted on any one route,
 * so every route reached through `getAuth` gets it for free. Layers on top of the global brake,
 * never in place of it.
 *
 * `request.credentialId` is always present when this runs — `getAuth` only calls it after a
 * credential has resolved — so the `!` is safe, not a suppression.
 *
 * See: docs/tools/security.md#the-rate-limit-budgets
 */
export const apiKeyLimiter: RequestHandler = rateLimitOn(
    'api-key',
    'NODE_API_KEY_RATE_LIMIT_MAX',
    DEFAULT_API_KEY_RATE_LIMIT_MAX,
    { keyGenerator: (request) => request.credentialId! }
);

/**
 * Guards the Prometheus scrape endpoint with a static bearer credential — Prometheus cannot hold a
 * session, so the admin JWT the other observability routes use is not available to it.
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
