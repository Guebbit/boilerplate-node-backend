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

import { randomBytes } from 'node:crypto';
import { t } from '@infrastructure/i18n';
import { logger } from '@infrastructure/adapters/logger';
import {
    userService,
    MFA_LOCK_MS,
    TokenType,
    type TwoFactorMethodRecord,
    type UserDocument
} from '@modules/users';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { rejectDatabaseEnvelope } from '@infrastructure/http/errors';
import { isLostRace } from '@infrastructure/persistence/versioning';
import type { CallerContext } from '@types';
import { recordAudit, type AuditAction } from '@infrastructure/observability/audit';
import { constantTimeEqual } from '@infrastructure/security/constant-time';
import type {
    MfaChallenge,
    TwoFactorBackupCodesRegenerated,
    TwoFactorConfirmed,
    TwoFactorDelivery,
    TwoFactorMethodSummary,
    TwoFactorSetup,
    TwoFactorStatus
} from '@types';
import { accountAuditActions } from '../audit';
import {
    twoFactorChangedEmail,
    twoFactorLockedEmail,
    recipientLocale,
    greetableName,
    type TwoFactorChange
} from '../emails';
import { sendAccountMail } from './mail';
import { revokeAllSessions } from './revocation';
import { findLiveTokenEntry, findLiveToken, spendLiveToken } from './tokens';
import { resendTooSoon } from '../cooldown';
import { ERROR_CODES } from '@api/error-codes';
import {
    DELIVERED_CODE_RESEND_SECONDS,
    availableTwoFactorMethods,
    clearDeliveredCode,
    deliveryCooldownRemaining,
    generateBackupCodes,
    generateBackupCodeSalt,
    hashBackupCode,
    hashBackupCodes,
    orderedEntries,
    twoFactorMethod,
    type TwoFactorMethodHandler
} from '../two-factor';

/**
 * The error code a client branches on to render a resend countdown rather than a generic 429.
 * Module-private like every other code in this app: a client reads it off the response, not off
 * an exported constant.
 */
const RESEND_TOO_SOON_CODE = ERROR_CODES.TWO_FACTOR_RESEND_TOO_SOON;

/**
 * Tell the account holder, out of band, that their second factors changed. Fire-and-forget: the
 * change already happened, and a queue that is briefly down must not turn it into an error.
 *
 * @param user - the account, carrying its address and locale
 * @param change - what happened
 * @param method - the factor concerned, for an add, replace or removal
 * @param context - the caller, whose locale is the fallback
 */
const notifyChange = (
    user: UserDocument,
    change: TwoFactorChange,
    method: string,
    context: CallerContext
): void => {
    void sendAccountMail(
        user.email,
        twoFactorChangedEmail(
            recipientLocale(user.locale, context),
            greetableName(user, user.email),
            change,
            method
        ),
        'normal'
    ).catch((error: unknown) => {
        logger.warn({ message: 'Could not queue a two-factor change notice.', error });
    });
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
        recordAudit(context, {
            action,
            outcome: result.success ? 'success' : 'failure',
            metadata: { method }
        });
        return result;
    });

/**
 * The rejection a wrong code earns, SAVED when it spent something: a miss can burn a delivered
 * code's attempt budget, and dropping that write is how an attempt ceiling silently becomes no
 * ceiling at all. A miss that changed nothing (a wrong or replayed TOTP) writes nothing, so a
 * burst of them cannot collide with each other or with the one right code among them.
 * A save that loses a race to a concurrent write is logged, not failed: the per-account
 * reservation, not this write, is what bounds the guessing.
 */
const rejectWrongCode = (user: UserDocument): Promise<ResponseReject> =>
    (user.isModified()
        ? userService.persistTwoFactorMethods(user).then(() => undefined)
        : Promise.resolve()
    )
        .catch((error: unknown) => {
            if (!isLostRace(error)) throw error;
            logger.warn({ message: 'A wrong-code write lost a race to a concurrent one.', error });
        })
        .then(() => generateReject(422, [t('account.two-factor.wrong-code')]));

/** The lock's length in minutes, for the notice's copy. */
const MFA_LOCK_MINUTES = MFA_LOCK_MS / 60_000;

/**
 * The rejection a locked account earns: 429, before any code was compared. The lock is the same
 * brake a login's own budgets use, so a client already renders it.
 */
const rejectLocked = (): ResponseReject => generateReject(429, [t('account.two-factor.locked')]);

/**
 * Tell the account holder, out of band, that wrong codes just locked their 2FA checks. Fire-and-
 * forget, like {@link notifyChange}: the lock already holds.
 */
const notifyLocked = (user: UserDocument, context: CallerContext): void => {
    void sendAccountMail(
        user.email,
        twoFactorLockedEmail(
            recipientLocale(user.locale, context),
            greetableName(user, user.email),
            MFA_LOCK_MINUTES
        ),
        'normal'
    ).catch((error: unknown) => {
        logger.warn({ message: 'Could not queue a two-factor lock notice.', error });
    });
};

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
 *
 * `code` is scrypt'd once, under the account's own salt, then checked against EVERY stored digest
 * — never returning as soon as one matches — so the loop's own running time never says which
 * position (if any) matched. Which code was spent is still recorded, in the write that follows.
 */
const consumeBackupCode = (user: UserDocument, code: string): boolean => {
    if (!user.twoFactorBackupCodeSalt) return false;

    const digest = hashBackupCode(code, user.twoFactorBackupCodeSalt);
    let matchIndex = -1;
    for (const [index, stored] of user.twoFactorBackupCodes.entries())
        if (constantTimeEqual(stored, digest)) matchIndex = index;
    if (matchIndex === -1) return false;

    user.twoFactorBackupCodes.splice(matchIndex, 1);
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
 * What checking a code against an ARMED factor answered: it matched, it did not, or the account
 * is locked and nothing was compared.
 */
type FactorVerdict = 'matched' | 'wrong' | 'locked';

/**
 * Check `code` against the account's armed factors, behind the per-account wrong-code cap.
 *
 * The attempt is RESERVED first (one atomic write), then compared: a parallel burst cannot read
 * "under the cap" together. No reservation means locked, and nothing is compared. A right code
 * hands the counter back. Enrolment `/confirm` never comes through here: it checks a factor that
 * is not armed yet, so a miss there guards nothing.
 *
 * @param user - the account, carrying its credential fields
 * @param code - a code from any armed method, or an unused backup code
 * @param context - the caller, whose locale is the fallback for the lock notice
 */
const verifyArmedFactor = (
    user: UserDocument,
    code: string,
    context: CallerContext
): Promise<FactorVerdict> =>
    userService.reserveMfaAttempt(user.id).then(({ reserved, lockedNow }) => {
        if (!reserved) return 'locked' as const;
        if (lockedNow) notifyLocked(user, context);

        return verifyAnyFactor(user, code).then((matched) =>
            matched
                ? userService.resetMfaAttempts(user.id).then(() => 'matched' as const)
                : ('wrong' as const)
        );
    });

/**
 * Turn a {@link FactorVerdict} into the response: run `onMatch` for a right code, refuse a locked
 * account without comparing, and save what a miss spent for a wrong one.
 */
const settleVerdict = <T>(
    verdict: FactorVerdict,
    user: UserDocument,
    onMatch: () => Promise<ResponseSuccess<T> | ResponseReject>
): Promise<ResponseSuccess<T> | ResponseReject> => {
    if (verdict === 'matched') return onMatch();
    return verdict === 'locked' ? Promise.resolve(rejectLocked()) : rejectWrongCode(user);
};

/**
 * Load the caller, run a caller-specific `precondition` against them, then verify `code` against
 * any armed factor. `precondition` returns a rejection to short-circuit before spending a verify
 * attempt, or `undefined` to proceed; `onMatch` runs only once `code` actually verifies. The
 * three 2FA actions gated on the caller's OWN code — remove a method, disable the whole feature,
 * regenerate backup codes — share exactly this shape; only the guard and the mutation differ.
 *
 * @param userId - the caller
 * @param code - a code from any armed method, or an unused backup code
 * @param context - the caller, for the lock notice
 * @param precondition - a check specific to the caller, run before spending a verify attempt
 * @param onMatch - the mutation to run once `code` verifies
 */
const withVerifiedCode = <T>(
    userId: string,
    code: string,
    context: CallerContext,
    precondition: (user: UserDocument) => ResponseReject | undefined,
    onMatch: (user: UserDocument) => Promise<ResponseSuccess<T> | ResponseReject>
): Promise<ResponseSuccess<T> | ResponseReject> =>
    userService
        .findByIdWithCredentials(userId)
        .then<ResponseSuccess<T> | ResponseReject>((user) => {
            if (!user) return generateReject(401, []);

            const rejection = precondition(user);
            if (rejection) return rejection;

            return verifyArmedFactor(user, code, context).then((verdict) =>
                settleVerdict(verdict, user, () => onMatch(user))
            );
        })
        .catch((error: unknown) => rejectDatabaseEnvelope('auth', error));

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
    if (user.twoFactorEnabledAt) {
        return;
    }

    user.twoFactorBackupCodes = [];
    user.twoFactorBackupCodeSalt = undefined;
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

/** How long an MFA login challenge lives when every armed factor is read off a device — long enough to type six digits, no more. */
const MFA_CHALLENGE_TTL_MS = 300_000;

/**
 * The same, for an account with a DELIVERED factor armed. Double, because the window now has to
 * cover an SMTP queue, a spam filter and a person switching apps — five minutes is a window a
 * legitimate user loses races against, and a challenge that expires mid-login reads as the app
 * being broken.
 *
 * Exported for `../rate-limits.ts`, which windows the two MFA challenge budgets to this same
 * lifetime — a window can never end before the challenge it bounds.
 */
export const MFA_CHALLENGE_DELIVERED_TTL_MS = 600_000;

/**
 * The `{ mfaRequired, challenge, ... }` body `POST /account/login` answers with, for an account
 * that has 2FA on. Built here rather than in the controller because the challenge's LIFETIME
 * depends on which methods are armed — a mailed code has to survive a round-trip that a code read
 * off a screen does not.
 *
 * The challenge itself is the SAME single-use, revocable, hashed-at-rest mechanism
 * `password-reset` and account-deletion confirmation use (`users/model.ts`'s `tokens[]`), not a
 * JWT: `verifyLoginChallenge` spends it via `spendLiveToken` on a right code, so a second
 * presentation of an already-answered challenge is refused outright, not merely re-checked.
 *
 * @param user - the account whose FIRST factor just checked out, with credentials loaded
 * @param amr - how that first factor was proven — `['pwd']` for a password login, `[provider]`
 *   for an OAuth one. Stored on the challenge so `verifyLoginChallenge` can hand it back once the
 *   second factor does too; see {@link Token.amr}.
 * @returns the challenge payload, ready to send
 */
export const buildLoginChallenge = (
    user: UserDocument,
    amr: readonly string[]
): Promise<MfaChallenge> => {
    const armed = armedEntries(user);
    const ttlMs = armed.some(({ handler }) => handler.delivers)
        ? MFA_CHALLENGE_DELIVERED_TTL_MS
        : MFA_CHALLENGE_TTL_MS;
    // 128 bits of entropy, same as every other one-time token this document holds — see
    // `hashToken`'s doc in `users/model.ts`.
    const challenge = randomBytes(16).toString('hex');

    return userService
        .tokenAdd(user, TokenType.MFA_CHALLENGE, ttlMs, challenge, [...amr])
        .then((token) => ({
            mfaRequired: true,
            challenge: token,
            expiresAt: new Date(Date.now() + ttlMs).toISOString(),
            methods: armed.map(({ handler }) => summarize(handler, user)),
            ...(armed[0] && { defaultMethod: armed[0].handler.name })
        }));
};

/**
 * `GET /account/2fa` — what this account has armed and what it could still add.
 *
 * @param userId - the caller
 */
export const twoFactorStatus = (
    userId: string
): Promise<ResponseSuccess<TwoFactorStatus> | ResponseReject> =>
    userService
        .findByIdWithCredentials(userId)
        .then<ResponseSuccess<TwoFactorStatus> | ResponseReject>((user) => {
            if (!user) return generateReject(401, []);

            // Armed ones only: an entry that has a pending code but no `enrolledAt` is an
            // enrollment in progress, and listing it would show a factor login does not ask for.
            const enrolled = armedEntries(user);
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
        .catch((error: unknown) => rejectDatabaseEnvelope('auth', error));

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
    code: string | undefined,
    context: CallerContext
): Promise<ResponseSuccess<TwoFactorSetup> | ResponseReject> => {
    const handler = twoFactorMethod(method);
    if (!handler)
        return Promise.resolve(generateReject(404, [t('account.two-factor.unknown-method')]));

    return userService
        .findByIdWithCredentials(userId)
        .then<ResponseSuccess<TwoFactorSetup> | ResponseReject>((user) => {
            if (!user) return generateReject(401, []);

            const eligibility = handler.eligibility(user);
            if (!eligibility.enrollable)
                return generateReject(422, [
                    eligibility.reason ?? t('account.two-factor.unknown-method')
                ]);

            // The first factor needs only the fresh password the route demands: there is nothing
            // to prove yet, and a backup code is what an account that lost its phone has.
            if (armedEntries(user).length === 0) return beginSetup(user, handler, context);

            // Once anything is armed, changing the factors needs a factor (or a backup code), so
            // a stolen-but-fresh session cannot swap out the very thing it would have to pass.
            if (!code) return generateReject(422, [t('account.two-factor.code-required')]);
            return verifyArmedFactor(user, code, context).then((verdict) =>
                settleVerdict(verdict, user, () => beginSetup(user, handler, context))
            );
        })
        .catch((error: unknown) => rejectDatabaseEnvelope('auth', error));
};

/**
 * The enrollment itself, once the caller is allowed to start one: honour the send cooldown,
 * disarm whatever this method had, and let the handler mint its pending secret or code.
 * Runs after a code was verified, so a cooldown left by the very code that proved the caller
 * (a mailed one, now spent) no longer counts.
 */
const beginSetup = (
    user: UserDocument,
    handler: TwoFactorMethodHandler,
    context: CallerContext
): Promise<ResponseSuccess<TwoFactorSetup> | ResponseReject> => {
    const entry = entryFor(user, handler.name);
    const wait = handler.delivers ? deliveryCooldownRemaining(entry) : 0;
    if (wait > 0) return Promise.resolve(tooSoon(wait));

    // Disarmed BEFORE the handler runs: a restart that fails halfway must not leave the
    // old secret armed next to a new pending one.
    entry.enrolledAt = undefined;
    clearDeliveredCode(entry);

    return handler.setup(user, entry, context).then((payload) => {
        syncArmedState(user);
        return userService.persistTwoFactorMethods(user).then(() => generateSuccess(payload));
    });
};

/**
 * `POST /account/2fa/methods/{method}/send` — delivers a code for one ARMED delivered method to a
 * signed-in caller, so an account whose only factor is delivered can prove itself before changing
 * its factors without spending a backup code.
 *
 * @param userId - the caller, already fresh-auth'd by the route guard
 * @param method - the wire name from the path
 * @param context - caller context; the mail needs its locale
 */
export const sendMethodCode = (
    userId: string,
    method: string,
    context: CallerContext
): Promise<ResponseSuccess<TwoFactorDelivery> | ResponseReject> => {
    if (!twoFactorMethod(method))
        return Promise.resolve(generateReject(404, [t('account.two-factor.unknown-method')]));

    const outcome = userService
        .findByIdWithCredentials(userId)
        .then<ResponseSuccess<TwoFactorDelivery> | ResponseReject>((user) => {
            if (!user) return generateReject(401, []);

            const armed = armedEntries(user).find(({ handler }) => handler.name === method);
            if (!armed?.handler.send)
                return generateReject(422, [t('account.two-factor.not-delivered')]);

            const wait = deliveryCooldownRemaining(armed.entry);
            if (wait > 0) return tooSoon(wait);

            return armed.handler
                .send(user, armed.entry, context)
                .then((delivery) =>
                    userService.persistTwoFactorMethods(user).then(() => generateSuccess(delivery))
                );
        })
        .catch((error: unknown) => rejectDatabaseEnvelope('auth', error));

    return audited(outcome, context, accountAuditActions.AUTH_2FA_CODE_SENT, method);
};

/** This flow's code and copy bound onto the shared builder, so both call sites stay one argument. */
const tooSoon = (seconds: number): ResponseReject =>
    resendTooSoon(RESEND_TOO_SOON_CODE, t('account.two-factor.resend-too-soon'), seconds);

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

    const outcome = userService
        .findByIdWithCredentials(userId)
        .then<ResponseSuccess<TwoFactorConfirmed> | ResponseReject>((user) => {
            if (!user) return generateReject(401, []);

            const entry = user.twoFactorMethods.find((candidate) => candidate.method === method);
            if (!entry || entry.enrolledAt)
                return generateReject(422, [t('account.two-factor.setup-not-started')]);

            return handler
                .verify(user, entry, code)
                .then<ResponseSuccess<TwoFactorConfirmed> | ResponseReject>((matched) =>
                    matched
                        ? armMethod(user, entry).then((armed) => {
                              notifyChange(user, 'enrolled', method, context);
                              return armed;
                          })
                        : rejectWrongCode(user)
                );
        })
        .catch((error: unknown) => rejectDatabaseEnvelope('auth', error));

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
    if (backupCodes) {
        const salt = generateBackupCodeSalt();
        user.twoFactorBackupCodeSalt = salt;
        user.twoFactorBackupCodes = hashBackupCodes(backupCodes, salt);
    }
    syncArmedState(user);

    return userService
        .persistTwoFactorMethods(user)
        .then(() => revokeAllSessions(user))
        .then(() =>
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
    // A method this deployment does not run is absent, not "not enabled" — the same 404 setup and
    // confirm answer, and the one the contract declares for this path.
    if (!twoFactorMethod(method))
        return Promise.resolve(generateReject(404, [t('account.two-factor.unknown-method')]));

    // Set by the precondition, consumed by onMatch: withVerifiedCode always runs the precondition
    // to completion before onMatch, so this is never read before it is written.
    let enrolledIndex = -1;

    const outcome = withVerifiedCode(
        userId,
        code,
        context,
        (user) => {
            enrolledIndex = user.twoFactorMethods.findIndex(
                (candidate) => candidate.method === method && candidate.enrolledAt
            );
            return enrolledIndex === -1
                ? generateReject(422, [t('account.two-factor.not-enabled')])
                : undefined;
        },
        (user) => {
            user.twoFactorMethods.splice(enrolledIndex, 1);
            discardIfDisarmed(user);
            return userService
                .persistTwoFactorMethods(user)
                .then(() => revokeAllSessions(user))
                .then(() => {
                    // Removing the last factor is 2FA going off: say that, not just "a method left".
                    notifyChange(
                        user,
                        user.twoFactorEnabledAt ? 'removed' : 'disabled',
                        method,
                        context
                    );
                    return generateSuccess(undefined);
                });
        }
    );

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
    const outcome = withVerifiedCode(
        userId,
        code,
        context,
        (user) =>
            user.twoFactorEnabledAt
                ? undefined
                : generateReject(422, [t('account.two-factor.not-enabled')]),
        (user) => {
            user.twoFactorMethods = [];
            discardIfDisarmed(user);
            return userService
                .persistTwoFactorMethods(user)
                .then(() => revokeAllSessions(user))
                .then(() => {
                    notifyChange(user, 'disabled', '', context);
                    return generateSuccess(undefined);
                });
        }
    );

    return audited(outcome, context, accountAuditActions.AUTH_2FA_DISABLED, 'all');
};

/**
 * `POST /account/2fa/backup-codes` — mints a fresh set of `BACKUP_CODE_COUNT` codes and discards
 * whatever was left of the old set, right down to a code {@link verifyAnyFactor} just spent to
 * prove the caller: the replacement makes that spend moot. Requires fresh critical auth (the route
 * guard) AND a valid code, same reasoning {@link disableTwoFactor} gives.
 *
 * @param userId - the caller
 * @param code - a code from any armed method, or an unused backup code
 */
export const regenerateBackupCodes = (
    userId: string,
    code: string,
    context: CallerContext
): Promise<ResponseSuccess<TwoFactorBackupCodesRegenerated> | ResponseReject> => {
    const outcome = withVerifiedCode(
        userId,
        code,
        context,
        (user) =>
            user.twoFactorEnabledAt
                ? undefined
                : generateReject(422, [t('account.two-factor.not-enabled')]),
        (user) => {
            const backupCodes = generateBackupCodes();
            const salt = generateBackupCodeSalt();
            user.twoFactorBackupCodeSalt = salt;
            user.twoFactorBackupCodes = hashBackupCodes(backupCodes, salt);
            return userService.persistTwoFactorMethods(user).then(() =>
                generateSuccess({
                    backupCodes,
                    backupCodesRemaining: user.twoFactorBackupCodes.length
                })
            );
        }
    );

    return audited(outcome, context, accountAuditActions.AUTH_2FA_BACKUP_CODES_REGENERATED, 'all');
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
    const outcome = findLiveToken(TokenType.MFA_CHALLENGE, challenge)
        .then<ResponseSuccess<TwoFactorDelivery> | ResponseReject>((user) => {
            if (!user) return generateReject(401, [t('account.two-factor.challenge-invalid')]);

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
                    userService.persistTwoFactorMethods(user).then(() => generateSuccess(delivery))
                );
        })
        .catch((error: unknown) => rejectDatabaseEnvelope('auth', error));

    return audited(outcome, context, accountAuditActions.AUTH_2FA_CODE_SENT, method);
};

/** What a verified challenge hands back to `postLoginTwoFactor` — the account, and how its FIRST factor was proven, for the session about to be minted. */
export interface VerifiedChallenge {
    user: UserDocument;
    amr: readonly string[];
}

/**
 * `POST /account/login/2fa` — the second step of a 2FA login. Verifies the challenge and the code
 * against the account it names, but does NOT mint a session — see the module doc. A challenge
 * that fails to verify (missing, wrong type, expired) and an account with no 2FA enabled both
 * answer 401: neither should tell a caller which one they hit.
 *
 * @param challenge - the challenge token from the first login step
 * @param code - a code from any armed method, or an unused backup code
 */
export const verifyLoginChallenge = (
    challenge: string,
    code: string,
    context: CallerContext
): Promise<ResponseSuccess<VerifiedChallenge> | ResponseReject> => {
    const outcome = findLiveTokenEntry(TokenType.MFA_CHALLENGE, challenge)
        .then<ResponseSuccess<VerifiedChallenge> | ResponseReject>((found) => {
            if (!found) return generateReject(401, [t('account.two-factor.challenge-invalid')]);
            const { user, entry } = found;
            if (!user.twoFactorEnabledAt) return generateReject(401, []);

            return verifyArmedFactor(user, code, context).then((verdict) =>
                settleVerdict(verdict, user, () =>
                    // Right code: spend the challenge before minting anything. A wrong code leaves
                    // it live — `mfaChallengeLimiter` bounds how often it can be tried. Only the
                    // request whose own write removed it may mint: a concurrent twin is refused
                    // like a challenge that never existed.
                    spendLiveToken(user, challenge).then((spentByThisRequest) =>
                        spentByThisRequest
                            ? userService
                                  .persistTwoFactorMethods(user)
                                  .then((saved) =>
                                      generateSuccess({ user: saved, amr: entry.amr ?? ['pwd'] })
                                  )
                            : generateReject(401, [t('account.two-factor.challenge-invalid')])
                    )
                )
            );
        })
        .catch((error: unknown) => rejectDatabaseEnvelope('auth', error));

    // Failure only: a successful challenge is not itself a completed login — `postLoginTwoFactor`
    // fires `AUTH_LOGIN` once a session actually exists. Auditing success here too would claim a
    // login happened before it has.
    return outcome.then((result) => {
        if (!result.success)
            recordAudit(context, {
                action: accountAuditActions.AUTH_2FA_CHALLENGE_FAILED,
                outcome: 'failure'
            });
        return result;
    });
};
