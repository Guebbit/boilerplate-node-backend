/**
 * @module
 * Email verification — issuing the token and sending the mail, in one place. Three flows start a
 * verification (signup, a profile update that changes the address, and the explicit re-send) and
 * must not drift, so each calls this and nothing else. Old tokens are removed before the new one
 * is issued — not for security, since spending any of them proves the same mailbox, but so "the
 * newest email is the one that works" and a re-send never confuses the user.
 */

import { getDefaultLocale, t } from '@infrastructure/i18n';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { userRepository, type UserDocument } from '@modules/users';
import { tokenAdd } from './authentication';
import { verifyRequestEmail } from '../emails';
import { generateSuccess, generateReject } from '@infrastructure/http/response';
import type { ResponseSuccess, ResponseReject } from '@infrastructure/http/response';
import type { CallerContext } from '@infrastructure/http/request';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { accountAuditActions } from '../audit';

/**
 * The `tokens.type` under which verification tokens are stored.
 *
 * A string like `'password'` and `'delete'`, not an `TokenType` member: the enum names the two
 * types the JWT layer knows about, and this one belongs to the account endpoints alone — see the
 * note on `UserMethods.tokenAdd`.
 */
export const EMAIL_VERIFY_TOKEN_TYPE = 'verify';

/** How long a verification link works: 24 hours, in milliseconds. */
export const EMAIL_VERIFY_TOKEN_TTL_MS = 86_400_000;

/**
 * Issue a fresh verification token for `user` and enqueue the email carrying it.
 * @param user - the account to verify; must carry its credential fields (`tokens`)
 * @param context - caller context; its `locale` is the fallback when the account has none
 * @returns resolves when the job is queued — the send itself happens in the email worker
 */
export const sendVerificationEmail = (user: UserDocument, context: CallerContext): Promise<void> =>
    user
        .tokenRemoveAll(EMAIL_VERIFY_TOKEN_TYPE)
        .then(() => tokenAdd(user, EMAIL_VERIFY_TOKEN_TYPE, EMAIL_VERIFY_TOKEN_TTL_MS))
        .then((token) => {
            /*
             * The recipient's OWN language, exactly as the reset and delete emails choose
             * theirs: the copy is finished before the job is published, so the worker needs no
             * locale at all.
             */
            const mail = verifyRequestEmail(
                user.locale ?? context.locale ?? getDefaultLocale(),
                user.username,
                token
            );
            // High priority: a token-bearing link the user is actively waiting on, not a notification.
            return enqueueEmail(
                { to: user.email, subject: mail.subject },
                mail.template,
                mail.data,
                'high'
            );
        });

/**
 * The explicit re-send, `POST /account/verify-request` — the one of this function's three
 * callers that is a user asking for something, not a side effect of signup or an email change.
 * A wrapper around {@link sendVerificationEmail} rather than an emit inside it: signup and the
 * email-change path call that function too, and neither counts as "a request" for this audit action.
 */
export const requestEmailVerification = (
    user: UserDocument,
    context: CallerContext
): Promise<void> =>
    sendVerificationEmail(user, context).then(() => {
        emitAuditEvent(
            buildAuditEvent(context, {
                action: accountAuditActions.AUTH_EMAIL_VERIFY_REQUESTED,
                outcome: 'success'
            })
        );
    });

/**
 * `POST /account/verify-request` end to end: loads the caller's own account, refuses the two
 * states that can't be verified, and sends. The refusals live here since
 * `requestEmailVerification` takes an already-loaded user and can't enforce its own precondition.
 * Unlike the reset request, there's no enumeration surface to blur: the caller is authenticated
 * and asking about their own account, so an already-verified one gets an honest 409, not a
 * soothing 200 that re-sends nothing.
 */
export const requestEmailVerificationFor = (
    userId: string,
    context: CallerContext
): Promise<ResponseSuccess<undefined> | ResponseReject> =>
    // Credentials included: issuing the token pushes onto this document's `tokens`.
    userRepository.findByIdWithCredentials(userId).then((user) => {
        if (!user) return generateReject(404, [t('users.not-found')]);
        if (user.verified) return generateReject(409, [t('account.verify.already-verified')]);

        return requestEmailVerification(user, context).then(() =>
            generateSuccess(undefined, 200, t('account.verify.email-sent'))
        );
    });

/**
 * Spend a verification token and mark the account verified.
 * `postVerifyConfirm` already found and spent the token — the race is settled by the atomic
 * `$pull` in `spendLiveToken` — so this is deliberately just the write and its emit, not a
 * second copy of that check. See `./tokens` for why finding and spending are two calls.
 */
export const completeEmailVerification = (
    user: UserDocument,
    context: CallerContext
): Promise<UserDocument> => {
    user.verified = true;
    return userRepository.save(user).then((saved) => {
        emitAuditEvent(
            buildAuditEvent(context, {
                action: accountAuditActions.AUTH_EMAIL_VERIFY_COMPLETED,
                actor_user_id: saved.id,
                actor_role: saved.admin ? 'admin' : 'user',
                outcome: 'success'
            })
        );
        return saved;
    });
};
