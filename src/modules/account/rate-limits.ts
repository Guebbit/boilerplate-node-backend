/**
 * @module
 * Account's own rate-limit budgets: the three credential-guess dimensions
 * (`credentialLimiters`), the two Sybil-shaped budgets spent by SUCCESS rather than failure
 * (`signupLimiters`, `resetRequestLimiters`), the password-strength advisory
 * (`passwordCheckLimiter`), and the two MFA challenge budgets (`mfaChallengeLimiter`,
 * `mfaSendLimiter`). Each is data (`RateLimitBudget`, declared on `./module.ts`'s `rateLimits`)
 * turned into middleware by `buildRateLimiter` (`@infrastructure/http/middlewares/rate-limit`),
 * the same factory every other module's budgets go through.
 *
 * See: docs/tools/security.md#the-rate-limit-budgets
 */

import { createHash } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import type { RateLimitBudget } from '@types';
import {
    buildRateLimiter,
    identityOf,
    addressBlockOf,
    readBodyField,
    rateLimitInfoOf,
    KEYED_BY_ADDRESS,
    KEYED_BY_ADDRESS_BLOCK,
    KEYED_BY_SUBMITTED_EMAIL,
    KEYED_BY_CHALLENGE
} from '@infrastructure/http/middlewares/rate-limit';
import { humanChallengeGate } from '@infrastructure/http/middlewares/human-challenge';
import { MFA_CHALLENGE_DELIVERED_TTL_MS } from './services/two-factor';

/**
 * Where express-rate-limit stores the identity limiter's counter on `request` — a distinct name
 * because `credentialLimiters` chains three limiters and, by default, each one's info overwrites
 * the last. `loginChallengeGate` is the only reader.
 * https://express-rate-limit.mintlify.app/reference/configuration#requestpropertyname
 */
const IDENTITY_RATE_LIMIT_PROPERTY = 'credentialIdentityRateLimit';

/** Failed attempts against ONE account — the smallest of the three credential budgets. */
const CREDENTIAL_IDENTITY_BUDGET: RateLimitBudget = {
    name: 'Credential guesses — per account',
    namespace: 'credentials-identity',
    environmentVariable: 'NODE_AUTH_RATE_LIMIT_MAX',
    defaultMax: 10,
    windowMs: 'shared',
    keyedBy: 'the named account, hashed',
    bounds:
        'Failed attempts against ONE account — defeats a botnet spreading guesses. The smallest ' +
        'of the three, since guessing at one account is the attack and someone signing in on ' +
        'several devices is not.',
    audited: true,
    keyGenerator: identityOf,
    skipSuccessfulRequests: true,
    requestPropertyName: IDENTITY_RATE_LIMIT_PROPERTY
};

/** Failed attempts from ONE address — defeats spraying a user list. */
const CREDENTIAL_ADDRESS_BUDGET: RateLimitBudget = {
    name: 'Credential guesses — per address',
    namespace: 'credentials-address',
    environmentVariable: 'NODE_AUTH_RATE_LIMIT_ADDRESS_MAX',
    defaultMax: 30,
    windowMs: 'shared',
    keyedBy: KEYED_BY_ADDRESS,
    bounds: 'Failed attempts from ONE address — defeats spraying a user list.',
    audited: true,
    skipSuccessfulRequests: true
};

/** Failed attempts from ONE address block — defeats a proxy pool or an IPv6 allocation. */
const CREDENTIAL_BLOCK_BUDGET: RateLimitBudget = {
    name: 'Credential guesses — per address block',
    namespace: 'credentials-block',
    environmentVariable: 'NODE_AUTH_RATE_LIMIT_BLOCK_MAX',
    defaultMax: 100,
    windowMs: 'shared',
    keyedBy: KEYED_BY_ADDRESS_BLOCK,
    bounds:
        'Failed attempts from ONE address block — the largest and coarsest of the three, sized ' +
        'above the address budget because a block is shared by many honest callers (an office, a ' +
        "CGNAT pool, one IPv6 customer's whole allocation), not by one.",
    audited: true,
    keyGenerator: addressBlockOf,
    skipSuccessfulRequests: true
};

/**
 * The credential budgets, for the routes that accept a password or mint a token.
 *
 * THREE independent limiters: one bounds failed attempts against ONE account, one bounds attempts
 * from ONE address, one bounds attempts from ONE address BLOCK. Keying on any pair instead is
 * weaker still — a bucket refreshes the moment any one key of the tuple changes.
 *
 * `skipSuccessfulRequests` on all three: only FAILURES spend the budget, so a shared address (an
 * office, CI, the e2e suite) is never locked out by people getting it right. Exported as an array
 * because Express flattens one, so a route cannot apply part of the set.
 *
 * See: docs/tools/security.md#the-rate-limit-budgets
 */
export const credentialLimiters: RequestHandler[] = [
    buildRateLimiter(CREDENTIAL_IDENTITY_BUDGET),
    buildRateLimiter(CREDENTIAL_ADDRESS_BUDGET),
    buildRateLimiter(CREDENTIAL_BLOCK_BUDGET)
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
    const info = rateLimitInfoOf(request, IDENTITY_RATE_LIMIT_PROPERTY);
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
 * `POST /account/password/check`'s own budget — unauthenticated, and every call may trigger an
 * outbound HIBP lookup, so it is an amplifier against HIBP and a free CPU sink without one. Every
 * request counts — a validation-only 200 is exactly what an amplifier farms, so
 * `skipSuccessfulRequests` would bound nothing.
 */
const PASSWORD_CHECK_BUDGET: RateLimitBudget = {
    name: 'Password-strength checks',
    namespace: 'password-check',
    environmentVariable: 'NODE_PASSWORD_CHECK_RATE_LIMIT_MAX',
    defaultMax: 20,
    windowMs: 'shared',
    keyedBy: KEYED_BY_ADDRESS,
    bounds:
        'A live meter fires on every debounced keystroke pause, so this is sized for a real ' +
        'typing session (a handful of edits) rather than a single submission.',
    audited: true
};

/** The budget for `POST /account/password/check` — see {@link PASSWORD_CHECK_BUDGET}. */
export const passwordCheckLimiter: RequestHandler = buildRateLimiter(PASSWORD_CHECK_BUDGET);

/** Signups allowed per window, per submitted EMAIL ADDRESS, spent by SUCCESS. */
const SIGNUP_IDENTITY_BUDGET: RateLimitBudget = {
    name: 'Signups — per email',
    namespace: 'signup-identity',
    environmentVariable: 'NODE_SIGNUP_RATE_LIMIT_MAX',
    defaultMax: 5,
    windowMs: 'shared',
    keyedBy: KEYED_BY_SUBMITTED_EMAIL,
    bounds:
        'Signup has no account yet to key a failure budget on, so this — spent by SUCCESS — is ' +
        'the whole of its identity budget.',
    audited: true,
    keyGenerator: identityOf
};

/** Signups allowed per window, per single caller ADDRESS. Spent by success, like the email budget. */
const SIGNUP_ADDRESS_BUDGET: RateLimitBudget = {
    name: 'Signups — per address',
    namespace: 'signup-address',
    environmentVariable: 'NODE_SIGNUP_RATE_LIMIT_ADDRESS_MAX',
    defaultMax: 15,
    windowMs: 'shared',
    keyedBy: KEYED_BY_ADDRESS,
    bounds: 'Signups from ONE address, spent by success.',
    audited: true
};

/** Signups allowed per window, per caller ADDRESS BLOCK. */
const SIGNUP_BLOCK_BUDGET: RateLimitBudget = {
    name: 'Signups — per address block',
    namespace: 'signup-block',
    environmentVariable: 'NODE_SIGNUP_RATE_LIMIT_BLOCK_MAX',
    defaultMax: 40,
    windowMs: 'shared',
    keyedBy: KEYED_BY_ADDRESS_BLOCK,
    bounds: 'Signups from ONE address block, spent by success.',
    audited: true,
    keyGenerator: addressBlockOf
};

/**
 * The signup budgets — identity, address and address-block, none of them skipping success.
 *
 * `credentialLimiters` is the wrong shape for `POST /account/signup`: `skipSuccessfulRequests`
 * spends nothing on the 201s that ARE the abuse (Sybil accounts), so a determined caller spent
 * this route's whole budget on requests that never counted. Every request counts here instead,
 * with `identityOf` added as a second dimension, since a proxy pool cannot vary the mailbox it is
 * registering.
 *
 * See: docs/tools/security.md#the-rate-limit-budgets
 */
export const signupLimiters: RequestHandler[] = [
    buildRateLimiter(SIGNUP_IDENTITY_BUDGET),
    buildRateLimiter(SIGNUP_ADDRESS_BUDGET),
    buildRateLimiter(SIGNUP_BLOCK_BUDGET)
];

/** Password-reset requests allowed per window, per submitted EMAIL ADDRESS. */
const RESET_IDENTITY_BUDGET: RateLimitBudget = {
    name: 'Password resets — per email',
    namespace: 'reset-identity',
    environmentVariable: 'NODE_RESET_RATE_LIMIT_MAX',
    defaultMax: 5,
    windowMs: 'shared',
    keyedBy: KEYED_BY_SUBMITTED_EMAIL,
    bounds:
        '`postResetRequest` always answers 200, to prevent account enumeration — so, like ' +
        'signup, only a budget spent by SUCCESS bounds anything here.',
    audited: true,
    keyGenerator: identityOf
};

/** Password-reset requests allowed per window, per single caller ADDRESS. */
const RESET_ADDRESS_BUDGET: RateLimitBudget = {
    name: 'Password resets — per address',
    namespace: 'reset-address',
    environmentVariable: 'NODE_RESET_RATE_LIMIT_ADDRESS_MAX',
    defaultMax: 15,
    windowMs: 'shared',
    keyedBy: KEYED_BY_ADDRESS,
    bounds: 'Password-reset requests from ONE address, spent by success.',
    audited: true
};

/** Password-reset requests allowed per window, per caller ADDRESS BLOCK. */
const RESET_BLOCK_BUDGET: RateLimitBudget = {
    name: 'Password resets — per address block',
    namespace: 'reset-block',
    environmentVariable: 'NODE_RESET_RATE_LIMIT_BLOCK_MAX',
    defaultMax: 40,
    windowMs: 'shared',
    keyedBy: KEYED_BY_ADDRESS_BLOCK,
    bounds: 'Password-reset requests from ONE address block, spent by success.',
    audited: true,
    keyGenerator: addressBlockOf
};

/**
 * The password-reset-request budgets — same three dimensions and the same reasoning as
 * `signupLimiters`. `postResetRequest` always answers 200 to avoid revealing whether an account
 * exists, which makes it, like signup, a route whose abuse is entirely on the success path.
 *
 * See: docs/tools/security.md#the-rate-limit-budgets
 */
export const resetRequestLimiters: RequestHandler[] = [
    buildRateLimiter(RESET_IDENTITY_BUDGET),
    buildRateLimiter(RESET_ADDRESS_BUDGET),
    buildRateLimiter(RESET_BLOCK_BUDGET)
];

/** Both challenge budgets bucket on this — the LONGER of the two challenge tiers. */
const MFA_CHALLENGE_WINDOW_MS = MFA_CHALLENGE_DELIVERED_TTL_MS;

/**
 * The bucket key both challenge limiters use: the challenge string itself, hashed so a credential
 * never becomes a store key. A request naming no challenge at all — a forged or malformed body —
 * has nothing to hash, so it falls back to the caller's address BLOCK (`addressBlockOf`) rather
 * than one shared key: a shared key let any two such callers exhaust the same budget, which
 * bounds neither of them against a live challenge the way this limiter exists to.
 */
const challengeKey = (request: Request): string => {
    const challenge = readBodyField(request, 'challenge');
    return challenge
        ? createHash('sha256').update(challenge).digest('hex')
        : `block:${addressBlockOf(request)}`;
};

/**
 * Attempts allowed against ONE login MFA challenge. Six digits is a million guesses; this is what
 * stops a single challenge from being the thing an attacker gets to try them against. Windowed to
 * the challenge's own lifetime ({@link MFA_CHALLENGE_DELIVERED_TTL_MS}) rather than the shared
 * browsing window, so a window can never end before the challenge it bounds.
 */
const MFA_CHALLENGE_BUDGET: RateLimitBudget = {
    name: 'MFA challenge guesses',
    namespace: 'mfa-challenge',
    environmentVariable: 'NODE_MFA_CHALLENGE_MAX',
    defaultMax: 5,
    windowMs: MFA_CHALLENGE_WINDOW_MS,
    keyedBy: KEYED_BY_CHALLENGE,
    bounds:
        'Guesses against ONE live challenge (`POST /account/login/2fa`) — `credentialLimiters` ' +
        'bounds guesses per account/address across every login attempt; this bounds guesses ' +
        'against ONE still-live challenge, which an IP/account limit alone does not: a ' +
        'distributed attacker rotating IPs is still capped per challenge.',
    audited: true,
    keyGenerator: challengeKey,
    // Deliberately NOT raised in `tests/support/setup.ts` — see that file for why.
    testExemption:
        'two-factor.test.ts\'s "kills the challenge after too many wrong attempts" case fires 6 ' +
        "concurrent guesses at ONE challenge specifically to prove this budget's tight production " +
        'default still catches them regardless of how generous the credential budgets are.'
};

/** The budget for `POST /account/login/2fa` — see {@link MFA_CHALLENGE_BUDGET}. */
export const mfaChallengeLimiter: RequestHandler = buildRateLimiter(MFA_CHALLENGE_BUDGET);

/**
 * Deliveries allowed against ONE login challenge. Three is a first code plus two resends — enough
 * for a slow mailbox, short of a useful cannon. Separate from the guess budget above because the
 * two bound different costs: that one bounds GUESSES, this one bounds outbound mail. Sharing a
 * budget would let a caller who typed three wrong codes lose the ability to be sent a right one.
 *
 * The service enforces a per-code cooldown on top of this. Both exist: the cooldown paces one
 * account's own resend button, this caps the total a single challenge can ever cause.
 */
const MFA_SEND_BUDGET: RateLimitBudget = {
    name: 'MFA code deliveries',
    namespace: 'mfa-send',
    environmentVariable: 'NODE_MFA_SEND_MAX',
    defaultMax: 3,
    windowMs: MFA_CHALLENGE_WINDOW_MS,
    keyedBy: KEYED_BY_CHALLENGE,
    bounds: 'Deliveries against ONE login challenge (`POST /account/login/2fa/send`).',
    audited: true,
    keyGenerator: challengeKey
};

/** The budget for `POST /account/login/2fa/send` — see {@link MFA_SEND_BUDGET}. */
export const mfaSendLimiter: RequestHandler = buildRateLimiter(MFA_SEND_BUDGET);

/** This module's declared budgets — listed on `./module.ts`'s `rateLimits`. */
export const accountRateLimits: readonly RateLimitBudget[] = [
    CREDENTIAL_IDENTITY_BUDGET,
    CREDENTIAL_ADDRESS_BUDGET,
    CREDENTIAL_BLOCK_BUDGET,
    PASSWORD_CHECK_BUDGET,
    SIGNUP_IDENTITY_BUDGET,
    SIGNUP_ADDRESS_BUDGET,
    SIGNUP_BLOCK_BUDGET,
    RESET_IDENTITY_BUDGET,
    RESET_ADDRESS_BUDGET,
    RESET_BLOCK_BUDGET,
    MFA_CHALLENGE_BUDGET,
    MFA_SEND_BUDGET
];
