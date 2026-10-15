/**
 * @module
 * Changing the password: the shared write every flow ends at, and the signed-in change that
 * proves the current password first. Reset links are `./password-reset`.
 */

import { z } from 'zod';
import type { ClientSession } from 'mongoose';
import { t } from '@infrastructure/i18n';
import { announceInTransaction } from '@kernel/outbox';
import { withTransaction } from '@infrastructure/runtime/database';
import { announces, type RevocationCause } from '../domain/revocation';
import { revokeFor, sessionsRevokedAnnouncement } from './revocation';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject,
    type ResponseErrorItem,
    validationErrors
} from '@infrastructure/http/response';
import { rejectDatabaseEnvelope } from '@infrastructure/http/errors';
import { assertPasswordNotBreached } from '@infrastructure/security/breached-passwords';
import { SignupBody } from '@api/schemas.zod';
import { userService, type UserDocument } from '@modules/users';
import type { CallerContext } from '@types';
import { recordAudit } from '@infrastructure/observability/audit';
import { accountAuditActions } from '../audit';
import { verifyOwnPassword } from './login';

/**
 * Validate a new-password pair without touching the user.
 * Split out of {@link passwordChange} so `reset-confirm` can validate BEFORE spending the
 * one-time token — consuming it is what resolves two simultaneous uses of one reset link, so
 * only a well-formed request should get the chance to spend it.
 * @returns the UI-facing messages, empty when the pair is acceptable
 */
export const validatePasswordChange = (
    password = '',
    passwordConfirm = ''
): ResponseErrorItem[] => {
    // `password` carries the contract's own bounds (the one every set-password body shares);
    // only the match between the two is ours to say.
    const parseResult = z
        .object({
            password: SignupBody.shape.password,
            passwordConfirm: z.string()
        })
        .superRefine(({ passwordConfirm, password }, context) => {
            if (passwordConfirm !== password) {
                context.addIssue({
                    code: 'custom',
                    message: t('account.signup.password-dont-match'),
                    path: ['passwordConfirm']
                });
            }
        })
        .safeParse({
            password,
            passwordConfirm
        });

    if (parseResult.success) return [];
    return validationErrors(parseResult.error);
};

/** The causes a password write can have: the two that end sessions by changing the credential. */
type PasswordCause = Extract<RevocationCause, 'password-change' | 'password-reset'>;

/**
 * Change user password with validation, then revoke every refresh token on the account.
 * The funnel both `completePasswordReset` and `passwordChangeWithCurrent` end at, so a future
 * third caller gets the revoke for free. Order
 * matters — save first, revoke second: a revoke landing against a password write that then fails
 * would log everyone out for nothing. The revoke's own failure is swallowed rather than turned
 * into a rejection: the password write already succeeded, and a lost revoke is defense in depth
 * this codebase can afford to lose once, not a reason to tell the caller their change failed.
 * `passwordChangeWithCurrent`'s caller re-mints its own session on top of this — see
 * `postPasswordChange` and `../session/session`'s `issueSession`.
 *
 * @param user - the account, carrying its credential fields
 * @param password - the new password, as typed
 * @param passwordConfirm - the repeat, which must match
 * @param beforeSave - a caller's own mutation to ride along in the same write, run only once
 *   every refusal is behind us. A parameter rather than a mutation the caller makes first: a
 *   refused password must not leave a half-applied change on the document, and the only place
 *   that can be guaranteed is here, next to the `save`. May return a `Promise` — `markVerified`'s
 *   role promotion is a membership write, not a field mutation, so it cannot be purely synchronous.
 * @param cause - which password event this is; a cause that announces also writes
 *   `account.sessions-revoked` through the outbox, in the write's own transaction
 */
export const passwordChange = (
    user: UserDocument,
    password = '',
    passwordConfirm = '',
    beforeSave?: (user: UserDocument) => void | Promise<void>,
    cause: PasswordCause = 'password-change'
): Promise<ResponseSuccess<UserDocument> | ResponseReject> => {
    const errors = validatePasswordChange(password, passwordConfirm);

    if (errors.length > 0) return Promise.resolve(generateReject(422, errors));

    // One check for both callers: `completePasswordReset` and `passwordChangeWithCurrent` both
    // funnel through this function.
    return assertPasswordNotBreached(password).then((breachErrors) => {
        if (breachErrors.length > 0) return generateReject(422, breachErrors);

        return writePassword(user, password, beforeSave, cause);
    });
};

/**
 * The state change of {@link writePassword}: password and session epoch, on one session.
 *
 * @param user - the account, carrying its credential fields
 * @param password - the new password, already accepted
 * @returns a write to hand to a transaction
 */
const passwordAndEpochWrite =
    (user: UserDocument, password: string) =>
    (session: ClientSession): Promise<UserDocument> =>
        userService
            .setPassword(user, password, session)
            .then((saved) =>
                userService.bumpSessionEpoch(saved.id, undefined, session).then(() => saved)
            );

/**
 * The write half of {@link passwordChange}, for a caller that has already run every check on the
 * password itself — shape, match, breach — and must not run the breach lookup a second time.
 *
 * One transaction holds the new password, the session epoch and, when the cause announces, the
 * `account.sessions-revoked` outbox row: the credential cannot change while old sessions stay live,
 * and the event exists exactly when the change does. The purge that follows is housekeeping
 * (the epoch already refuses every old token), so `revokeFor` logs its failure, not a 500.
 *
 * @param user - the account, carrying its credential fields
 * @param password - the new password, already accepted
 * @param beforeSave - a caller's own mutation to ride along in the same write
 * @param cause - which password event this is, and so what it announces and purges
 */
export const writePassword = (
    user: UserDocument,
    password: string,
    beforeSave?: (user: UserDocument) => void | Promise<void>,
    cause: PasswordCause = 'password-change'
): Promise<ResponseSuccess<UserDocument> | ResponseReject> =>
    Promise.resolve(beforeSave?.(user))
        .then(() => {
            const write = passwordAndEpochWrite(user, password);
            return announces(cause)
                ? announceInTransaction(write, (saved) =>
                      sessionsRevokedAnnouncement(saved.id, cause)
                  )
                : withTransaction(write);
        })
        .then((savedUser) =>
            revokeFor(cause, savedUser.id).then(() => generateSuccess<UserDocument>(savedUser))
        )
        .catch((error: unknown) => rejectDatabaseEnvelope('auth', error));

/**
 * Change the password of a live session, gated on the current one.
 * A wrong current password is a 422 with translated copy, NOT a 401 — a 401 here reads as
 * "session expired" to client interceptors and would log out a perfectly valid session.
 * The new pair is validated BEFORE the current password is checked (both are pure reads): a
 * mistyped confirmation then costs one round-trip instead of a round-trip plus a bcrypt compare.
 */
export const passwordChangeWithCurrent = (
    userId: string,
    currentPassword: string,
    password: string,
    passwordConfirm: string,
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> => {
    const errors = validatePasswordChange(password, passwordConfirm);

    const outcome: Promise<ResponseSuccess<UserDocument> | ResponseReject> =
        errors.length > 0
            ? Promise.resolve(generateReject(422, errors))
            : verifyOwnPassword(userId, currentPassword, 'account.password-change.wrong-current')
                  .then((verified) =>
                      verified.success
                          ? passwordChange(verified.data, password, passwordConfirm)
                          : verified
                  )
                  .catch((error: unknown) => rejectDatabaseEnvelope('auth', error));

    return outcome.then((result) => {
        recordAudit(context, {
            action: accountAuditActions.AUTH_PASSWORD_CHANGED,
            outcome: result.success ? 'success' : 'failure'
        });
        return result;
    });
};
