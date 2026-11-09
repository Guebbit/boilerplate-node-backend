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
import { logger } from '@infrastructure/adapters/logger';
import { rejectDatabaseEnvelope } from '@infrastructure/http/errors';
import { assertPasswordNotBreached } from '@infrastructure/security/breached-passwords';
import { SignupBody } from '@api/schemas.zod';
import { type UserDocument } from '@modules/users';
import { accountUserService } from '@modules/users/friends/account';
import type { CallerContext } from '@types';
import { recordAudit } from '@infrastructure/observability/audit';
import { accountAuditActions } from '../audit';
import { greetableName, passwordChangedEmail, recipientLocale } from '../emails';
import { verifyOwnPassword } from './login';
import { sendAccountMail } from './mail';

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
 * The authenticated change's check-then-write: validate the new pair, refuse a breached password,
 * then hand the write to {@link writePassword}, which also revokes every refresh token.
 * Order matters — save first, revoke second: a revoke landing against a password write that then
 * fails would log everyone out for nothing.
 * `passwordChangeWithCurrent`'s caller re-mints its own session on top — see `postPasswordChange`
 * and `../session/session`'s `issueSession`.
 *
 * @param user - the account, carrying its credential fields
 * @param password - the new password, as typed
 * @param passwordConfirm - the repeat, which must match
 * @internal Writes a new password with no check of the current one; only `passwordChangeWithCurrent` may reach it.
 */
export const passwordChange = (
    user: UserDocument,
    password: string,
    passwordConfirm: string
): Promise<ResponseSuccess<UserDocument> | ResponseReject> => {
    const errors = validatePasswordChange(password, passwordConfirm);

    if (errors.length > 0) return Promise.resolve(generateReject(422, errors));

    // The reset runs its own breach check in `resetWith`, so this one belongs to the change alone.
    return assertPasswordNotBreached(password).then((breachErrors) => {
        if (breachErrors.length > 0) return generateReject(422, breachErrors);

        return writePassword(user, password, undefined, 'password-change');
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
        accountUserService
            .setPassword(user, password, session)
            .then((saved) =>
                accountUserService.bumpSessionEpoch(saved.id, undefined, session).then(() => saved)
            );

/**
 * The shared final write of a new password: {@link passwordChange} and the reset both end here.
 * Every check on the password itself — shape, match, breach — is the caller's, done before.
 * The revoke lives here, so a caller cannot forget it.
 *
 * One transaction holds the new password, the session epoch and, when the cause announces, the
 * `account.sessions_revoked` outbox row: the credential cannot change while old sessions stay live,
 * and the event exists exactly when the change does. The purge that follows is housekeeping
 * (the epoch already refuses every old token), so `revokeFor` logs its failure, not a 500.
 *
 * @param user - the account, carrying its credential fields
 * @param password - the new password, already accepted
 * @param beforeSave - a caller's own mutation to ride along in the same write, or `undefined`
 * @param cause - which password event this is, and so what it announces and purges
 * @internal No shape, breach or current-password check; only `passwordChange` and the reset's `resetWith` may reach it.
 */
export const writePassword = (
    user: UserDocument,
    password: string,
    beforeSave: ((user: UserDocument) => void) | undefined,
    cause: PasswordCause
): Promise<ResponseSuccess<UserDocument> | ResponseReject> =>
    Promise.resolve()
        .then(() => {
            beforeSave?.(user);
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
 * Tell the account holder, out of band, that their password just changed. Fire-and-forget: the
 * change already happened, and a queue that is briefly down must not turn it into an error.
 */
const notifyPasswordChanged = (user: UserDocument, context: CallerContext): void => {
    void sendAccountMail(
        user.email,
        passwordChangedEmail(
            recipientLocale(user.locale, context),
            greetableName(user, user.email)
        ),
        'normal'
    ).catch((error: unknown) => {
        logger.warn({ message: 'Could not queue a password-change notice.', error });
    });
};

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
        if (result.success) notifyPasswordChanged(result.data, context);
        return result;
    });
};
