/**
 * @module
 * Checking a code against an account's armed factors, behind the per-account wrong-code cap.
 * Every flow that asks for a code goes through here.
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
import { constantTimeEqual } from '@infrastructure/security/constant-time';
import {
    MFA_LOCK_MS,
    MFA_MAX_FAILURES,
    hashBackupCode,
    orderedEntries,
    type TwoFactorMethodHandler
} from '../two-factor';
import { rejectWrongCode, rejectLocked, notifyLocked } from './two-factor-outcomes';

/** The account's armed factors, in the registry's own order rather than enrollment order. */
export const armedEntries = (user: UserDocument) =>
    orderedEntries(user.twoFactorMethods).filter(({ entry }) => entry.enrolledAt);

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
export type FactorVerdict = 'matched' | 'wrong' | 'locked';

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
export const verifyArmedFactor = (
    user: UserDocument,
    code: string,
    context: CallerContext
): Promise<FactorVerdict> =>
    userService
        .reserveMfaAttempt(user.id, MFA_MAX_FAILURES, MFA_LOCK_MS)
        .then(({ reserved, lockedNow }) => {
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
export const settleVerdict = <T>(
    verdict: FactorVerdict,
    user: UserDocument,
    onMatch: () => Promise<ResponseSuccess<T> | ResponseReject>
): Promise<ResponseSuccess<T> | ResponseReject> => {
    if (verdict === 'matched') return onMatch();
    return verdict === 'locked' ? Promise.resolve(rejectLocked()) : rejectWrongCode(user);
};

/**
 * Prove a second-factor code for a signed-in caller who is re-authenticating — the `otp` half of
 * `POST /account/reauth`. Behind the same per-account cap as every other check of an armed factor.
 * A right code is persisted here (a spent backup code, a TOTP step), so the caller has nothing
 * left to write.
 *
 * @param user - the account, carrying its credential fields
 * @param code - a code from any armed method, or an unused backup code
 * @param context - the caller, whose locale is the fallback for the lock notice
 * @returns success when the code verified; 422 for a wrong code or an account with no factor armed,
 *   429 when the account is locked
 */
export const proveSecondFactor = (
    user: UserDocument,
    code: string,
    context: CallerContext
): Promise<ResponseSuccess<undefined> | ResponseReject> => {
    if (!user.twoFactorEnabledAt)
        return Promise.resolve(generateReject(422, [t('account.two-factor.not-enabled')]));

    return verifyArmedFactor(user, code, context).then((verdict) =>
        settleVerdict(verdict, user, () =>
            userService.persistTwoFactorMethods(user).then(() => generateSuccess(undefined))
        )
    );
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
export const withVerifiedCode = <T>(
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
