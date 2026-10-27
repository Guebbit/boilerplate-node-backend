/**
 * @module
 * Account's own rate-limit budgets: the four credential-guess dimensions
 * (`credentialLimiters`), the two Sybil-shaped budgets spent by SUCCESS rather than failure
 * (`signupLimiters`, `resetRequestLimiters`), the password-strength advisory
 * (`passwordCheckLimiters`), and the two MFA challenge budgets (`mfaChallengeLimiter`,
 * `mfaSendLimiter`). Each is data (`RateLimitBudget`, declared on `./module.ts`'s `rateLimits`)
 * turned into middleware by `buildRateLimiter` (`@infrastructure/http/middlewares/rate-limit`),
 * the same factory every other module's budgets go through.
 *
 * See: docs/tools/security.md#the-rate-limit-budgets
 */

import type { Request, RequestHandler } from 'express';
import type { RateLimitBudget } from '@types';
import {
    buildRateLimiter,
    identityOf,
    addressBlockOf,
    readBodyField,
    rateLimitInfoOf,
    priorHits,
    KEYED_BY_ADDRESS,
    KEYED_BY_ADDRESS_BLOCK,
    KEYED_BY_SUBMITTED_EMAIL,
    KEYED_BY_CHALLENGE,
    KEYED_BY_AUTHENTICATED_ACCOUNT,
    accountIdOf
} from '@infrastructure/http/middlewares/rate-limit';
import { humanChallengeGate } from '@infrastructure/http/middlewares/human-challenge';
import { MAIL_RECIPIENT_BUDGET } from './mail-budget';
import { readMfaChallengeCookie } from './oauth/mfa-redirect';
import { holdsDeviceCookie, presentsFailingDeviceCookie } from './session/device-cookie';
import { pseudonymise } from '@infrastructure/security/pseudonymise';
import { accountRateLimitData } from './rate-limits.generated';

/**
 * Where express-rate-limit stores the identity limiter's counter on `request` — a distinct name
 * because `credentialLimiters` chains four limiters and, by default, each one's info overwrites
 * the last. `loginChallengeGate` is the only reader.
 * https://express-rate-limit.mintlify.app/reference/configuration#requestpropertyname
 */
const IDENTITY_RATE_LIMIT_PROPERTY = 'credentialIdentityRateLimit';

/** The same, for the address-block limiter — `loginChallengeGate` reads it too (credential stuffing). */
const BLOCK_RATE_LIMIT_PROPERTY = 'credentialBlockRateLimit';

/** `keyedBy` label for the public routes' identity budget — see {@link namesAnAccount}. */
const KEYED_BY_SUBMITTED_ACCOUNT =
    'the submitted email or username (normalised and pseudonymised); not counted when the body ' +
    'names none';

/**
 * Whether a request's body names the account it is aimed at — an `email` or a `username`. The
 * per-account budget exists for exactly that case: guessing at ONE account. A blank value names
 * nobody — `identityOf` files it under the address block too. A confirm that carries
 * only a token (a reset link, a 2FA code, an OAuth callback) names nobody, and keying it anyway
 * would put every neighbour in one /24 into one shared bucket; the address and block budgets
 * already bound those routes.
 */
const namesAnAccount = (request: Request): boolean =>
    Boolean(readBodyField(request, 'email') ?? readBodyField(request, 'username'));

/** Failed attempts against ONE named account — the smallest of the credential budgets. */
const CREDENTIAL_IDENTITY_BUDGET: RateLimitBudget = {
    ...accountRateLimitData.credentialsIdentity,
    keyedBy: KEYED_BY_SUBMITTED_ACCOUNT,
    keyGenerator: identityOf,
    skipSuccessfulRequests: true,
    requestPropertyName: IDENTITY_RATE_LIMIT_PROPERTY,
    escalation: { doublings: 3 },
    skip: (request) => !namesAnAccount(request) || holdsDeviceCookie(request)
};

/**
 * Failed attempts a SIGNED-IN caller makes on the routes that re-prove them (`POST /account/password`,
 * `/reauth`, `/email-verification/resend`, `/email-change/resend`). Those bodies name no account, so the key
 * is the session's own: a hijacked session guessing the password cannot spread across addresses.
 * Never keyed on a body field — those routes validate after their limiter, so an injected `email`
 * would rotate the bucket — and never excused by a device cookie: the session is the proof here.
 */
const SESSION_CREDENTIAL_BUDGET: RateLimitBudget = {
    ...accountRateLimitData.credentialsSession,
    keyedBy: KEYED_BY_AUTHENTICATED_ACCOUNT,
    keyGenerator: accountIdOf,
    skipSuccessfulRequests: true
};

/**
 * Failed attempts that carried a familiar-device cookie which does not vouch for the account they
 * name — a forged or stale one. Bounds guessing the cookie itself separately from the password it
 * would excuse; a request without a cookie, or with a valid one, is never counted here.
 */
const CREDENTIAL_DEVICE_BUDGET: RateLimitBudget = {
    ...accountRateLimitData.credentialsDevice,
    keyedBy: KEYED_BY_ADDRESS,
    skipSuccessfulRequests: true,
    skip: (request) => !presentsFailingDeviceCookie(request)
};

/** Failed attempts from ONE address — defeats spraying a user list. */
const CREDENTIAL_ADDRESS_BUDGET: RateLimitBudget = {
    ...accountRateLimitData.credentialsAddress,
    keyedBy: KEYED_BY_ADDRESS,
    skipSuccessfulRequests: true
};

/** Failed attempts from ONE address block — defeats a proxy pool or an IPv6 allocation. */
const CREDENTIAL_BLOCK_BUDGET: RateLimitBudget = {
    ...accountRateLimitData.credentialsBlock,
    keyedBy: KEYED_BY_ADDRESS_BLOCK,
    keyGenerator: addressBlockOf,
    skipSuccessfulRequests: true,
    requestPropertyName: BLOCK_RATE_LIMIT_PROPERTY
};

/**
 * The limiters every credential route shares, built once so an address or block spends ONE counter
 * whichever route it fails on: a forged device cookie, one address, one address BLOCK. Keying on any
 * pair instead is weaker still — a bucket refreshes the moment any one key of the tuple changes.
 */
const SHARED_CREDENTIAL_LIMITERS: RequestHandler[] = [
    buildRateLimiter(CREDENTIAL_DEVICE_BUDGET),
    buildRateLimiter(CREDENTIAL_ADDRESS_BUDGET),
    buildRateLimiter(CREDENTIAL_BLOCK_BUDGET)
];

/**
 * The credential budgets for the PUBLIC routes that accept a password or mint a token: login, the
 * token confirms, the second-factor login, OAuth. The per-account budget counts only a request
 * whose body names an account.
 *
 * `skipSuccessfulRequests` on all of them: only FAILURES spend the budget, so a shared address (an
 * office, CI, the e2e suite) is never locked out by people getting it right. Exported as an array
 * because Express flattens one, so a route cannot apply part of the set.
 *
 * See: docs/tools/security.md#the-rate-limit-budgets
 */
export const credentialLimiters: RequestHandler[] = [
    buildRateLimiter(CREDENTIAL_IDENTITY_BUDGET),
    ...SHARED_CREDENTIAL_LIMITERS
];

/**
 * {@link credentialLimiters} for the routes that run `isAuth` FIRST and re-prove the signed-in
 * caller: the per-account budget is the session's own, not a body field.
 */
export const sessionCredentialLimiters: RequestHandler[] = [
    buildRateLimiter(SESSION_CREDENTIAL_BUDGET),
    ...SHARED_CREDENTIAL_LIMITERS
];

/**
 * Fraction of a failure budget that must already be spent before an otherwise honest login
 * attempt starts carrying rung 3's challenge. Never on a first, or even second, mistyped password
 * — but before a script gets to spend the rest of the budget unchallenged.
 */
const CHALLENGE_AFTER_BUDGET_SPENT = 0.5;

/**
 * Whether the budget behind `property` has at least half its failures on record. Missing
 * rate-limit info (that limiter didn't run) reads as "not yet". During a Redis outage the budget
 * counts in memory (`failoverStore`), so this reads the fallback's numbers rather than going blind.
 */
const budgetMostlySpent = (request: Request, property: string): boolean => {
    const info = rateLimitInfoOf(request, property);
    return info !== undefined && priorHits(info) >= info.limit * CHALLENGE_AFTER_BUDGET_SPENT;
};

/**
 * Mounted between `credentialLimiters` and the login handler: passes through while neither the
 * named account's failure budget nor the caller's address block's is half spent, delegates to
 * `humanChallengeGate` once either is. The block half is what meets credential stuffing: one guess
 * per account never spends any single account's budget, but it does spend the block's.
 */
export const loginChallengeGate: RequestHandler = (request, response, next) =>
    budgetMostlySpent(request, IDENTITY_RATE_LIMIT_PROPERTY) ||
    budgetMostlySpent(request, BLOCK_RATE_LIMIT_PROPERTY)
        ? humanChallengeGate(request, response, next)
        : next();

/**
 * `POST /account/password/check`'s per-address budget — unauthenticated, and every call may trigger
 * an outbound HIBP lookup, so without one it is a free CPU sink and a way to spend the shared
 * lookup quota. Every request counts — a validation-only 200 is exactly what a farm wants, so
 * `skipSuccessfulRequests` would bound nothing.
 */
const PASSWORD_CHECK_BUDGET: RateLimitBudget = {
    ...accountRateLimitData.passwordCheck,
    keyedBy: KEYED_BY_ADDRESS
};

/**
 * `POST /account/password/check`'s per-block budget: a caller rotating addresses inside one block
 * spends one counter, so the per-address one alone does not bound the outbound lookups.
 */
const PASSWORD_CHECK_BLOCK_BUDGET: RateLimitBudget = {
    ...accountRateLimitData.passwordCheckBlock,
    keyedBy: KEYED_BY_ADDRESS_BLOCK,
    keyGenerator: addressBlockOf
};

/** The budgets for `POST /account/password/check` — see {@link PASSWORD_CHECK_BUDGET}. */
export const passwordCheckLimiters: RequestHandler[] = [
    buildRateLimiter(PASSWORD_CHECK_BUDGET),
    buildRateLimiter(PASSWORD_CHECK_BLOCK_BUDGET)
];

/** Signups allowed per window, per submitted EMAIL ADDRESS, spent by SUCCESS. */
const SIGNUP_IDENTITY_BUDGET: RateLimitBudget = {
    ...accountRateLimitData.signupIdentity,
    keyedBy: KEYED_BY_SUBMITTED_EMAIL,
    keyGenerator: identityOf
};

/** Signups allowed per window, per single caller ADDRESS. Spent by success, like the email budget. */
const SIGNUP_ADDRESS_BUDGET: RateLimitBudget = {
    ...accountRateLimitData.signupAddress,
    keyedBy: KEYED_BY_ADDRESS
};

/** Signups allowed per window, per caller ADDRESS BLOCK. */
const SIGNUP_BLOCK_BUDGET: RateLimitBudget = {
    ...accountRateLimitData.signupBlock,
    keyedBy: KEYED_BY_ADDRESS_BLOCK,
    keyGenerator: addressBlockOf
};

/**
 * The signup budgets — identity, address and address-block, none of them skipping success.
 *
 * `credentialLimiters` is the wrong shape for `POST /account/signup`: `skipSuccessfulRequests`
 * spends nothing on the 201s that ARE the abuse (Sybil accounts), so a determined caller spent
 * this route's whole budget on requests that never counted. Every request counts here instead,
 * with `identityOf` added as a second dimension. It keys on the submitted string, so a `+tag`
 * gives a fresh bucket here; the address and block budgets, and the canonical-mailbox budget
 * (`mail-budget.ts`), still bound it.
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
    ...accountRateLimitData.resetIdentity,
    keyedBy: KEYED_BY_SUBMITTED_EMAIL,
    keyGenerator: identityOf
};

/** Password-reset requests allowed per window, per single caller ADDRESS. */
const RESET_ADDRESS_BUDGET: RateLimitBudget = {
    ...accountRateLimitData.resetAddress,
    keyedBy: KEYED_BY_ADDRESS
};

/** Password-reset requests allowed per window, per caller ADDRESS BLOCK. */
const RESET_BLOCK_BUDGET: RateLimitBudget = {
    ...accountRateLimitData.resetBlock,
    keyedBy: KEYED_BY_ADDRESS_BLOCK,
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

/**
 * The bucket key both challenge limiters use: the challenge string itself (from the body, else the
 * OAuth continuation's cookie), hashed so a credential
 * never becomes a store key. A request naming no challenge at all — a forged or malformed body —
 * has nothing to hash, so it falls back to the caller's address BLOCK (`addressBlockOf`) rather
 * than one shared key: a shared key let any two such callers exhaust the same budget, which
 * bounds neither of them against a live challenge the way this limiter exists to.
 */
const challengeKey = (request: Request): string => {
    // An OAuth continuation never sends the challenge in the body: it rides in a cookie.
    const fromBody = readBodyField(request, 'challenge');
    const challenge = fromBody ? fromBody : readMfaChallengeCookie(request);
    return challenge ? pseudonymise('rate-limit', challenge) : `block:${addressBlockOf(request)}`;
};

/**
 * Attempts allowed against ONE login MFA challenge. Six digits is a million guesses; this is what
 * stops a single challenge from being the thing an attacker gets to try them against. Windowed to
 * the challenge's own lifetime (`MFA_CHALLENGE_DELIVERED_TTL_MS`) rather than the shared
 * browsing window, so a window can never end before the challenge it bounds.
 */
const MFA_CHALLENGE_BUDGET: RateLimitBudget = {
    ...accountRateLimitData.mfaChallenge,
    keyedBy: KEYED_BY_CHALLENGE,
    keyGenerator: challengeKey,
    // Deliberately NOT raised in `tests/support/setup-environment.ts` — see that file for why.
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
    ...accountRateLimitData.mfaSend,
    keyedBy: KEYED_BY_CHALLENGE,
    keyGenerator: challengeKey
};

/** The budget for `POST /account/login/2fa/send` — see {@link MFA_SEND_BUDGET}. */
export const mfaSendLimiter: RequestHandler = buildRateLimiter(MFA_SEND_BUDGET);

/**
 * Codes delivered to a SIGNED-IN account so it can prove a factor (`POST /account/2fa/methods/
 * {method}/send`) or pass step-up (`POST /account/reauth/methods/{method}/send`) — one budget for
 * both, since both spend the same mailbox. Keyed on the account, not the challenge: there is no challenge here, and an
 * address key would let one stolen session mail the owner from many places. The per-code cooldown
 * still paces a single button; this caps the total one account's mailbox can be made to receive.
 */
const ACCOUNT_CODE_SEND_BUDGET: RateLimitBudget = {
    ...accountRateLimitData.mfaAccountSend,
    keyedBy: KEYED_BY_AUTHENTICATED_ACCOUNT,
    keyGenerator: accountIdOf
};

/** The budget for both signed-in code sends — see {@link ACCOUNT_CODE_SEND_BUDGET}. */
export const accountCodeSendLimiter: RequestHandler = buildRateLimiter(ACCOUNT_CODE_SEND_BUDGET);

/** This module's declared budgets — listed on `./module.ts`'s `rateLimits`. */
export const accountRateLimits: readonly RateLimitBudget[] = [
    MAIL_RECIPIENT_BUDGET,
    CREDENTIAL_IDENTITY_BUDGET,
    CREDENTIAL_DEVICE_BUDGET,
    CREDENTIAL_ADDRESS_BUDGET,
    CREDENTIAL_BLOCK_BUDGET,
    SESSION_CREDENTIAL_BUDGET,
    PASSWORD_CHECK_BUDGET,
    PASSWORD_CHECK_BLOCK_BUDGET,
    SIGNUP_IDENTITY_BUDGET,
    SIGNUP_ADDRESS_BUDGET,
    SIGNUP_BLOCK_BUDGET,
    RESET_IDENTITY_BUDGET,
    RESET_ADDRESS_BUDGET,
    RESET_BLOCK_BUDGET,
    MFA_CHALLENGE_BUDGET,
    MFA_SEND_BUDGET,
    ACCOUNT_CODE_SEND_BUDGET
];
