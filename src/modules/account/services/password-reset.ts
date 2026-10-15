/**
 * @module
 * Completing a password reset from its mailed link: find the link, check the password, spend the
 * link, write, then tell the owner. Asking for the link is `./password-reset-request`.
 */

import { logger } from '@infrastructure/adapters/logger';
import { resetConfirmEmail, greetableName, recipientLocale } from '../emails';
import { sendAccountMail } from './mail';
import { markVerified } from './verification';
import { findLiveToken, spendLiveToken, refuseLink } from './tokens';
import {
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { rejectDatabaseEnvelope } from '@infrastructure/http/errors';
import { assertPasswordNotBreached } from '@infrastructure/security/breached-passwords';
import { type UserDocument } from '@modules/users';
import type { CallerContext } from '@types';
import { accountAuditActions } from '../audit';
import { recordAccountAudit } from './caller';
import { validatePasswordChange, writePassword } from './password';
import { PASSWORD_RESET_TOKEN_TYPE } from '../token-types';

/**
 * The write a completed reset rides along on: the proven mailbox verifies the address, and the
 * 2FA wrong-code counter and lock clear. Someone who can read the mailbox has the account's own
 * recovery path, so the lock holds nothing back from them.
 */
const markResetCompleted = (user: UserDocument): void => {
    user.mfaFailures = 0;
    user.mfaLockedUntil = undefined;
    markVerified(user);
};

/**
 * What follows a finished reset: on success, the audit row, the confirmation mail and the
 * audit row and the confirmation mail (the `account.sessions-revoked` event already left with the
 * password write). `resetWith` is the one caller.
 *
 * @param result - what writing the password answered
 * @param user - the account
 * @param context - the caller, for the audit row and the mail's language fallback
 */
const afterReset = (
    result: ResponseSuccess<UserDocument> | ResponseReject,
    user: UserDocument,
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> => {
    if (!result.success) return Promise.resolve(result);

    // Same fire-and-forget shape as the mail below: the password change already succeeded, so a lookup hiccup here must not
    // turn a successful reset into an error — worst case, this one audit row is missing.
    void recordAccountAudit(context, String(user._id), {
        action: accountAuditActions.AUTH_PASSWORD_RESET_COMPLETED,
        outcome: 'success'
    }).catch((error: unknown) => {
        // Still just a missing audit row, not a reset failure — see the comment
        // above — but a swallowed lookup failure had no trail at all before this.
        logger.warn({
            message: 'Could not audit a completed password reset.',
            userId: String(user._id),
            error
        });
    });

    /*
     * The recipient's OWN language first. These links are clicked from an email client,
     * possibly on a shared or borrowed device, so the request's `Accept-Language` says
     * very little about who the message is for — it is the fallback, not the answer. The
     * copy is finished before the job is published, so the worker needs no locale at all.
     *
     * Fire-and-forget: the password has already changed, and a queue that is briefly
     * unavailable must not turn a successful reset into an error.
     */
    const mail = resetConfirmEmail(
        recipientLocale(user.locale, context),
        greetableName(user, user.email),
        // `oauthAccounts` is `select: false`: present on a holder loaded for the reset, absent on
        // one that was not, which is then simply "no providers to name".
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- the schema types claim `oauthAccounts` is always loaded; `select: false` makes that a lie
        (user.oauthAccounts ?? []).map(({ provider }) => provider)
    );
    // Normal priority: a confirmation, not a link or code anyone is blocked on.
    void sendAccountMail(user.email, mail, 'normal');

    return Promise.resolve(result);
};

/**
 * The 422 every dead reset link answers with, and its audit trail. Unknown, expired and already
 * used read alike on purpose.
 *
 * @param context - the caller
 */
const resetLinkRefused = (context: CallerContext): ResponseReject =>
    refuseLink(context, 'password_reset', 'account.reset.token-not-found');

/**
 * The tail of {@link completePasswordReset} once the link is FOUND: breach check, then the
 * atomic spend, then the write. The spend stays last so a refused password never burns the link.
 *
 * @param user - the holder of the live token
 * @param token - the token from the mailed link
 * @param password - the new password
 * @param context - the caller
 */
const resetWith = (
    user: UserDocument,
    token: string,
    password: string,
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> =>
    assertPasswordNotBreached(password).then((breachErrors) => {
        if (breachErrors.length > 0) return generateReject(422, breachErrors);

        return spendLiveToken(PASSWORD_RESET_TOKEN_TYPE, token).then((spentByThisRequest) =>
            spentByThisRequest
                ? writePassword(user, password, markResetCompleted, 'password-reset').then(
                      (result) => afterReset(result, user, context)
                  )
                : resetLinkRefused(context)
        );
    });

/**
 * `POST /account/reset-confirm` — the whole reset, in the order that never burns a link for a
 * password that was going to be refused: shape and match, then the live token is FOUND, then the
 * breach check, and only then is the token SPENT. The spend is the atomic delete that settles two
 * simultaneous uses of one link, so it stays last; everything before it is a read.
 *
 * The same find/spend split `two-factor-challenge.ts` uses for a login challenge.
 *
 * @param token - the token from the mailed link
 * @param password - the new password
 * @param passwordConfirm - the repeat
 * @param context - the caller
 * @returns the account on success; a 422 for a bad password pair, a breached password, or a link
 *   that is unknown, expired or already used — the last three read alike on purpose
 */
export const completePasswordReset = (
    token: string,
    password: string,
    passwordConfirm: string,
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> => {
    const errors = validatePasswordChange(password, passwordConfirm);
    if (errors.length > 0) return Promise.resolve(generateReject(422, errors));

    return findLiveToken(PASSWORD_RESET_TOKEN_TYPE, token)
        .then((user) =>
            user ? resetWith(user, token, password, context) : resetLinkRefused(context)
        )
        .catch((error: unknown) => rejectDatabaseEnvelope('auth', error));
};
