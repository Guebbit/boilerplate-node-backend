/**
 * @module
 * Two-factor authentication — enrollment, removal, and verifying a code against a live account.
 * Every method-specific decision is delegated to a handler from `../two-factor/registry`; what
 * stays here is the part that is the same for all of them: which entry to load, in what order to
 * try them, when the account flag flips, and when backup codes are minted or discarded.
 *
 * The login half (`sendLoginCode`, `verifyLoginChallenge`) stops short of minting a session, same
 * reasoning `login()` follows in `./authentication` — `../controllers/post-login-2fa.ts` is the
 * one caller that turns a verified challenge into cookies.
 */

import { t } from '@infrastructure/i18n';
import type { CastError } from 'mongoose';
import { userRepository, type TwoFactorMethodRecord, type UserDocument } from '@modules/users';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { rejectDatabaseEnvelope } from '@infrastructure/http/errors';
import type { CallerContext } from '@infrastructure/http/request';
import {
    emitAuditEvent,
    buildAuditEvent,
    type AuditAction
} from '@infrastructure/observability/audit';
import type {
    MfaChallenge,
    TwoFactorConfirmed,
    TwoFactorDelivery,
    TwoFactorMethodSummary,
    TwoFactorSetup,
    TwoFactorStatus
} from '@types';
import { accountAuditActions } from '../audit';
import {
    createMfaChallenge,
    verifyMfaChallenge,
    MFA_CHALLENGE_DELIVERED_TTL_SECONDS,
    MFA_CHALLENGE_TTL_SECONDS
} from '../session/jwt';
import {
    DELIVERED_CODE_RESEND_SECONDS,
    availableTwoFactorMethods,
    clearDeliveredCode,
    deliveryCooldownRemaining,
    generateBackupCodes,
    hashBackupCode,
    orderedEntries,
    twoFactorMethod,
    type TwoFactorMethodHandler
} from '../two-factor';

/**
 * The error code a client branches on to render a resend countdown rather than a generic 429.
 * Module-private like every other code in this app: a client reads it off the response, not off
 * an exported constant.
 */
const RESEND_TOO_SOON_CODE = 'TWO_FACTOR_RESEND_TOO_SOON';

/**
 * Persist a document whose method array was mutated in place.
 *
 * `markModified` is not belt-and-braces here: several of these paths UNSET fields on a
 * subdocument (a spent code, a replaced secret), and Mongoose does not always see a delete inside
 * an array element as a change — the write would silently do nothing.
 */
const saveMethods = (user: UserDocument): Promise<UserDocument> => {
    user.markModified('twoFactorMethods');
    return userRepository.save(user);
};

/**
 * Record one method-scoped 2FA action and pass the outcome through untouched. Both halves are
 * kept: a failed enrollment or disable is exactly what a stolen session looks like from here.
 */
const audited = <T>(
    outcome: Promise<ResponseSuccess<T> | ResponseReject>,
    context: CallerContext,
    action: AuditAction,
    method: string
): Promise<ResponseSuccess<T> | ResponseReject> =>
    outcome.then((result) => {
        emitAuditEvent(
            buildAuditEvent(context, {
                action,
                outcome: result.success ? 'success' : 'failure',
                metadata: { method }
            })
        );
        return result;
    });

/**
 * The rejection a wrong code earns, SAVED rather than discarded: a miss spends something — a
 * delivered code's attempt budget — and dropping that write is how an attempt ceiling silently
 * becomes no ceiling at all.
 */
const rejectWrongCode = (user: UserDocument): Promise<ResponseReject> =>
    saveMethods(user).then(() => generateReject(422, [t('account.two-factor.wrong-code')]));

/** The account's armed factors, in the registry's own order rather than enrollment order. */
const armedEntries = (user: UserDocument) =>
    orderedEntries(user.twoFactorMethods).filter(({ entry }) => entry.enrolledAt);

/** This account's entry for one method, created empty if it has never had one. */
const entryFor = (user: UserDocument, method: string): TwoFactorMethodRecord => {
    const existing = user.twoFactorMethods.find((candidate) => candidate.method === method);
    if (existing) return existing;
    user.twoFactorMethods.push({ method });
    // Read back rather than reusing the literal: Mongoose hydrates a pushed entry into a
    // subdocument, and the handler about to mutate it needs that one, not the plain object.
    return user.twoFactorMethods.at(-1)!;
};

/**
 * Spend a backup code, if the digits are one. Backup codes recover the ACCOUNT, so they are
 * tried after every armed factor has declined — never before, or a stolen list would shadow a
 * working authenticator.
 */
const consumeBackupCode = (user: UserDocument, code: string): boolean => {
    const index = user.twoFactorBackupCodes.indexOf(hashBackupCode(code));
    if (index === -1) return false;
    user.twoFactorBackupCodes.splice(index, 1);
    return true;
};

/**
 * Walk the armed factors in order, stopping at the first that accepts `code`.
 * Recursive rather than a loop so the chain stays a chain — and strictly sequential either way,
 * because each handler mutates its own entry (a replay high-water mark, a burned code) and a
 * losing branch must not spend anything.
 */
const verifyInOrder = (
    user: UserDocument,
    code: string,
    pending: { entry: TwoFactorMethodRecord; handler: TwoFactorMethodHandler }[]
): Promise<boolean> => {
    if (pending.length === 0) return Promise.resolve(false);
    const [next, ...rest] = pending;
    return next.handler
        .verify(user, next.entry, code)
        .then((matched) => matched || verifyInOrder(user, code, rest));
};

/**
 * Try `code` against every armed factor, then against the backup codes — in that order, never the
 * other way round, or a stolen backup list would shadow a working authenticator.
 */
const verifyAnyFactor = (user: UserDocument, code: string): Promise<boolean> =>
    verifyInOrder(user, code, armedEntries(user)).then(
        (matched) => matched || consumeBackupCode(user, code)
    );

/**
 * Re-derive the account-level flag from the entries, after any change to them.
 *
 * The flag only: backup codes are NOT touched here. `setupTwoFactorMethod` disarms a factor
 * mid-re-enrollment, and discarding the codes there would mean an abandoned "I lost my phone"
 * attempt silently invalidated the list the user wrote down — the one thing they have left.
 * Dropping them belongs to the two calls that DELIBERATELY end 2FA; see {@link discardIfDisarmed}.
 */
const syncArmedState = (user: UserDocument): void => {
    user.twoFactorEnabledAt = user.twoFactorMethods.some((entry) => entry.enrolledAt)
        ? (user.twoFactorEnabledAt ?? new Date())
        : undefined;
};

/**
 * Turning 2FA off deliberately takes the backup codes with it: they recover a second factor that
 * no longer exists, and leaving them behind would arm the next enrollment with someone's old list.
 */
const discardIfDisarmed = (user: UserDocument): void => {
    syncArmedState(user);
    if (!user.twoFactorEnabledAt) user.twoFactorBackupCodes = [];
};

/**
 * One method's public description — what a caller holding only a challenge is allowed to know.
 * Deliberately no `enrolledAt`: the login step is answered by someone who has proved a password
 * and nothing else, and when an account armed a factor is none of their business. `twoFactorStatus`
 * adds it for the authenticated owner.
 */
const summarize = (handler: TwoFactorMethodHandler, user: UserDocument): TwoFactorMethodSummary => {
    const target = handler.target(user);
    return {
        method: handler.name,
        delivers: handler.delivers,
        ...(target && { target }),
        ...(handler.delivers && { resendAfter: DELIVERED_CODE_RESEND_SECONDS })
    };
};

/**
 * The `{ mfaRequired, challenge, ... }` body `POST /account/login` answers with, for an account
 * that has 2FA on. Built here rather than in the controller because the challenge's LIFETIME
 * depends on which methods are armed — a mailed code has to survive a round-trip that a code read
 * off a screen does not.
 *
 * @param user - the account whose password just checked out, with credentials loaded
 * @returns the challenge payload, ready to send
 */
export const buildLoginChallenge = (user: UserDocument): MfaChallenge => {
    const armed = armedEntries(user);
    const ttl = armed.some(({ handler }) => handler.delivers)
        ? MFA_CHALLENGE_DELIVERED_TTL_SECONDS
        : MFA_CHALLENGE_TTL_SECONDS;

    return {
        mfaRequired: true,
        challenge: createMfaChallenge(user._id.toString(), ttl),
        expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
        methods: armed.map(({ handler }) => summarize(handler, user)),
        ...(armed[0] && { defaultMethod: armed[0].handler.name })
    };
};

/**
 * `GET /account/2fa` — what this account has armed and what it could still add.
 *
 * @param userId - the caller
 */
export const twoFactorStatus = (
    userId: string
): Promise<ResponseSuccess<TwoFactorStatus> | ResponseReject> =>
    userRepository
        .findByIdWithCredentials(userId)
        .then<ResponseSuccess<TwoFactorStatus> | ResponseReject>((user) => {
            if (!user) return generateReject(401, []);

            const enrolled = orderedEntries(user.twoFactorMethods);
            const enrolledNames = new Set(enrolled.map(({ handler }) => handler.name));

            return generateSuccess({
                enabled: Boolean(user.twoFactorEnabledAt),
                methods: enrolled.map(({ handler, entry }) => ({
                    ...summarize(handler, user),
                    ...(entry.enrolledAt && { enrolledAt: entry.enrolledAt.toISOString() })
                })),
                available: availableTwoFactorMethods()
                    .filter((handler) => !enrolledNames.has(handler.name))
                    .map((handler) => ({
                        ...summarize(handler, user),
                        ...handler.eligibility(user)
                    })),
                backupCodesRemaining: user.twoFactorBackupCodes.length
            });
        })
        .catch((error: CastError | Error) => rejectDatabaseEnvelope('auth', error));

/**
 * `POST /account/2fa/methods/{method}/setup` — starts, or restarts, one method's enrollment.
 * Restarting DISARMS a method that was already confirmed: this is the "lost my phone but still
 * have my session" path, which is why the route demands fresh critical auth.
 *
 * @param userId - the caller, already fresh-auth'd by the route guard
 * @param method - the wire name from the path
 * @param context - caller context; a delivered method needs its locale for the mail
 */
export const setupTwoFactorMethod = (
    userId: string,
    method: string,
    context: CallerContext
): Promise<ResponseSuccess<TwoFactorSetup> | ResponseReject> => {
    const handler = twoFactorMethod(method);
    if (!handler)
        return Promise.resolve(generateReject(404, [t('account.two-factor.unknown-method')]));

    return userRepository
        .findByIdWithCredentials(userId)
        .then<ResponseSuccess<TwoFactorSetup> | ResponseReject>((user) => {
            if (!user) return generateReject(401, []);

            const eligibility = handler.eligibility(user);
            if (!eligibility.enrollable)
                return generateReject(422, [
                    eligibility.reason ?? t('account.two-factor.unknown-method')
                ]);

            const entry = entryFor(user, method);
            const wait = handler.delivers ? deliveryCooldownRemaining(entry) : 0;
            if (wait > 0) return tooSoon(wait);

            // Disarmed BEFORE the handler runs: a restart that fails halfway must not leave the
            // old secret armed next to a new pending one.
            entry.enrolledAt = undefined;
            clearDeliveredCode(entry);

            return handler.setup(user, entry, context).then((payload) => {
                syncArmedState(user);
                return saveMethods(user).then(() => generateSuccess(payload));
            });
        })
        .catch((error: CastError | Error) => rejectDatabaseEnvelope('auth', error));
};

/** The 429 a client turns into a countdown — `details.retryAfter` is the same number `resendAfter` promised. */
const tooSoon = (seconds: number): ResponseReject =>
    generateReject(429, [
        {
            code: RESEND_TOO_SOON_CODE,
            message: t('account.two-factor.resend-too-soon'),
            details: { retryAfter: seconds }
        }
    ]);

/**
 * `POST /account/2fa/methods/{method}/confirm` — arms the pending method against a code the
 * caller has demonstrably received. The FIRST factor an account arms also mints its backup codes,
 * returned in the clear exactly once; a second factor mints none, since they recover the account
 * rather than the method.
 *
 * @param userId - the caller
 * @param method - the wire name from the path
 * @param code - the code for this method; a backup code is not accepted here
 */
export const confirmTwoFactorMethod = (
    userId: string,
    method: string,
    code: string,
    context: CallerContext
): Promise<ResponseSuccess<TwoFactorConfirmed> | ResponseReject> => {
    const handler = twoFactorMethod(method);
    if (!handler)
        return Promise.resolve(generateReject(404, [t('account.two-factor.unknown-method')]));

    const outcome = userRepository
        .findByIdWithCredentials(userId)
        .then<ResponseSuccess<TwoFactorConfirmed> | ResponseReject>((user) => {
            if (!user) return generateReject(401, []);

            const entry = user.twoFactorMethods.find((candidate) => candidate.method === method);
            if (!entry || entry.enrolledAt)
                return generateReject(422, [t('account.two-factor.setup-not-started')]);

            return handler
                .verify(user, entry, code)
                .then<
                    ResponseSuccess<TwoFactorConfirmed> | ResponseReject
                >((matched) => (matched ? armMethod(user, entry) : rejectWrongCode(user)));
        })
        .catch((error: CastError | Error) => rejectDatabaseEnvelope('auth', error));

    return audited(outcome, context, accountAuditActions.AUTH_2FA_ENROLLED, method);
};

/**
 * Mark one verified entry as armed and answer with what the caller gets to see once.
 * Split out of `confirmTwoFactorMethod` only to keep that function's nesting inside three levels.
 */
const armMethod = (
    user: UserDocument,
    entry: TwoFactorMethodRecord
): Promise<ResponseSuccess<TwoFactorConfirmed>> => {
    // "The account has no recovery left", not "this is the first factor" — the two differ after a
    // re-enrollment, and after the tenth code has been spent. Either way the answer is the same:
    // an account with a second factor and no way back in is the state to avoid.
    const backupCodes = user.twoFactorBackupCodes.length === 0 ? generateBackupCodes() : undefined;

    entry.enrolledAt = new Date();
    if (backupCodes) user.twoFactorBackupCodes = backupCodes.map((code) => hashBackupCode(code));
    syncArmedState(user);

    return saveMethods(user).then(() =>
        generateSuccess({
            method: entry.method,
            ...(backupCodes && { backupCodes }),
            backupCodesRemaining: user.twoFactorBackupCodes.length
        })
    );
};

/**
 * `DELETE /account/2fa/methods/{method}` — drops one factor and leaves the rest armed. Removing
 * the last one turns 2FA off, backup codes included, exactly as {@link disableTwoFactor} would.
 *
 * @param userId - the caller
 * @param method - the wire name from the path
 * @param code - a code from any armed method, or an unused backup code
 */
export const removeTwoFactorMethod = (
    userId: string,
    method: string,
    code: string,
    context: CallerContext
): Promise<ResponseSuccess<undefined> | ResponseReject> => {
    const outcome = userRepository
        .findByIdWithCredentials(userId)
        .then<ResponseSuccess<undefined> | ResponseReject>((user) => {
            if (!user) return generateReject(401, []);

            const index = user.twoFactorMethods.findIndex(
                (candidate) => candidate.method === method && candidate.enrolledAt
            );
            if (index === -1) return generateReject(422, [t('account.two-factor.not-enabled')]);

            return verifyAnyFactor(user, code).then((matched) => {
                if (!matched) return rejectWrongCode(user);

                user.twoFactorMethods.splice(index, 1);
                discardIfDisarmed(user);
                return saveMethods(user).then(() => generateSuccess(undefined));
            });
        })
        .catch((error: CastError | Error) => rejectDatabaseEnvelope('auth', error));

    return audited(outcome, context, accountAuditActions.AUTH_2FA_DISABLED, method);
};

/**
 * `DELETE /account/2fa` — turns the whole feature off. Requires fresh critical auth (the route
 * guard) AND a valid code: disabling from a stolen-but-fresh session is otherwise the cheapest
 * way around the whole feature.
 *
 * @param userId - the caller
 * @param code - a code from any armed method, or an unused backup code
 */
export const disableTwoFactor = (
    userId: string,
    code: string,
    context: CallerContext
): Promise<ResponseSuccess<undefined> | ResponseReject> => {
    const outcome = userRepository
        .findByIdWithCredentials(userId)
        .then<ResponseSuccess<undefined> | ResponseReject>((user) => {
            if (!user) return generateReject(401, []);
            if (!user.twoFactorEnabledAt)
                return generateReject(422, [t('account.two-factor.not-enabled')]);

            return verifyAnyFactor(user, code).then((matched) => {
                if (!matched) return rejectWrongCode(user);

                user.twoFactorMethods = [];
                discardIfDisarmed(user);
                return saveMethods(user).then(() => generateSuccess(undefined));
            });
        })
        .catch((error: CastError | Error) => rejectDatabaseEnvelope('auth', error));

    return audited(outcome, context, accountAuditActions.AUTH_2FA_DISABLED, 'all');
};

/**
 * `POST /account/login/2fa/send` — delivers a code for one armed method, against a live
 * challenge. Public, like the rest of the login flow, which is exactly why the cooldown is
 * enforced here and not only in the route's limiter: this endpoint sends mail on an
 * unauthenticated caller's say-so.
 *
 * @param challenge - the challenge token from the first login step
 * @param method - which armed delivered method to send through
 */
export const sendLoginCode = (
    challenge: string,
    method: string,
    context: CallerContext
): Promise<ResponseSuccess<TwoFactorDelivery> | ResponseReject> => {
    // Two-argument `.then`, not a trailing `.catch`: a rejected challenge and a database error
    // further down are different failures and must not share one handler.
    const outcome = verifyMfaChallenge(challenge).then(
        (claims) =>
            userRepository
                .findByIdWithCredentials(claims.id)
                .then<ResponseSuccess<TwoFactorDelivery> | ResponseReject>((user) => {
                    if (!user) return generateReject(401, []);

                    const armed = armedEntries(user).find(({ handler }) => handler.name === method);
                    // An unarmed method and an unknown one answer alike: a caller holding only a
                    // challenge must not be able to enumerate what an account has enrolled
                    // beyond what the challenge itself already told them.
                    if (!armed?.handler.send)
                        return generateReject(422, [t('account.two-factor.not-delivered')]);

                    const wait = deliveryCooldownRemaining(armed.entry);
                    if (wait > 0) return tooSoon(wait);

                    return armed.handler
                        .send(user, armed.entry, context)
                        .then((delivery) =>
                            saveMethods(user).then(() => generateSuccess(delivery))
                        );
                })
                .catch((error: CastError | Error) => rejectDatabaseEnvelope('auth', error)),
        () => generateReject(401, [t('account.two-factor.challenge-invalid')])
    );

    return audited(outcome, context, accountAuditActions.AUTH_2FA_CODE_SENT, method);
};

/**
 * `POST /account/login/2fa` — the second step of a 2FA login. Verifies the challenge and the code
 * against the account it names, but does NOT mint a session — see the module doc. A challenge
 * that fails to verify (expired, wrong signature, wrong `purpose`) and an account with no 2FA
 * enabled both answer 401: neither should tell a caller which one they hit.
 *
 * @param challenge - the challenge token from the first login step
 * @param code - a code from any armed method, or an unused backup code
 */
export const verifyLoginChallenge = (
    challenge: string,
    code: string,
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> => {
    const outcome = verifyMfaChallenge(challenge).then(
        (claims) =>
            userRepository
                .findByIdWithCredentials(claims.id)
                .then<ResponseSuccess<UserDocument> | ResponseReject>((user) => {
                    if (!user?.twoFactorEnabledAt) return generateReject(401, []);

                    return verifyAnyFactor(user, code).then((matched) =>
                        matched
                            ? saveMethods(user).then((saved) => generateSuccess(saved))
                            : rejectWrongCode(user)
                    );
                })
                .catch((error: CastError | Error) => rejectDatabaseEnvelope('auth', error)),
        () => generateReject(401, [t('account.two-factor.challenge-invalid')])
    );

    // Failure only: a successful challenge is not itself a completed login — `postLoginTwoFactor`
    // fires `AUTH_LOGIN` once a session actually exists. Auditing success here too would claim a
    // login happened before it has.
    return outcome.then((result) => {
        if (!result.success)
            emitAuditEvent(
                buildAuditEvent(context, {
                    action: accountAuditActions.AUTH_2FA_CHALLENGE_FAILED,
                    outcome: 'failure'
                })
            );
        return result;
    });
};
