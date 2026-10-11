/**
 * @module
 * Managing second factors: status, enrolling a method, arming it, removing one or all, and
 * minting backup codes. Which entry to load and when the account flag flips live here;
 * each method's own rules are `../two-factor/registry`.
 */

import { t } from '@infrastructure/i18n';
import { userService, type TwoFactorMethodRecord, type UserDocument } from '@modules/users';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { rejectDatabaseEnvelope } from '@infrastructure/http/errors';
import type { CallerContext } from '@types';
import type {
    TwoFactorBackupCodesRegenerated,
    TwoFactorConfirmed,
    TwoFactorDelivery,
    TwoFactorSetup,
    TwoFactorStatus
} from '@types';
import { accountAuditActions } from '../audit';
import { dropRefreshTokens } from './revocation';
import {
    availableTwoFactorMethods,
    clearDeliveredCode,
    deliveryCooldownRemaining,
    generateBackupCodes,
    generateBackupCodeSalt,
    hashBackupCodes,
    twoFactorMethod,
    type TwoFactorMethodHandler
} from '../two-factor';
import { audited, notifyChange, rejectWrongCode, summarize, tooSoon } from './two-factor-outcomes';
import {
    armedEntries,
    verifyArmedFactor,
    settleVerdict,
    withVerifiedCode
} from './two-factor-lockout';

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

    // The epoch rides in the factor's own save: a second write failing cannot leave old sessions live.
    userService.markSessionsEnded(user);
    return userService
        .persistTwoFactorMethods(user)
        .then(() => dropRefreshTokens(user))
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
            userService.markSessionsEnded(user);
            return (
                userService
                    // Named, because the copy no longer holds the entry the write has to remove.
                    .persistTwoFactorMethods(user, [method])
                    .then(() => dropRefreshTokens(user))
                    .then(() => {
                        // Removing the last factor is 2FA going off: say that, not just "a method left".
                        notifyChange(
                            user,
                            user.twoFactorEnabledAt ? 'removed' : 'disabled',
                            method,
                            context
                        );
                        return generateSuccess(undefined);
                    })
            );
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
            userService.markSessionsEnded(user);
            return userService
                .persistTwoFactorMethods(user, 'all')
                .then(() => dropRefreshTokens(user))
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
