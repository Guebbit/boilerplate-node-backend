/**
 * Email verification — issuing the token and sending the mail, in one place.
 *
 * Three flows start a verification and they must not drift: signup (the first send), a profile
 * update that changes the address (the old confirmation no longer vouches for the new address),
 * and `POST /account/verify-request` (the re-send for the mail that never arrived). Each of them
 * calls this and nothing else.
 *
 * The old tokens are removed before the new one is issued, so at any moment exactly one
 * verification link works. Not for security — spending any of them proves the same mailbox — but
 * because a re-send exists for the user whose first mail vanished, and "the newest email is the
 * one that works" is the only behaviour that never confuses them.
 */

import { getDefaultLocale } from '@infrastructure/i18n';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { userRepository, type UserDocument } from '@modules/users';
import { tokenAdd } from './authentication';
import { verifyRequestEmail } from '../emails';
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
 *
 * @param user - the account to verify; must carry its credential fields (`tokens`)
 * @param requestLocale - fallback language when the account has no stored preference
 * @returns resolves when the job is queued — the send itself happens in the email worker
 */
export const sendVerificationEmail = (user: UserDocument, requestLocale?: string): Promise<void> =>
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
                user.locale ?? requestLocale ?? getDefaultLocale(),
                user.username,
                token
            );
            return enqueueEmail(
                { to: user.email, subject: mail.subject },
                mail.template,
                mail.data
            );
        });

/**
 * The explicit re-send, `POST /account/verify-request` — the one of this function's three callers
 * that is a user asking for something, rather than a side effect of signup or an email change.
 *
 * A wrapper around {@link sendVerificationEmail} rather than an emit inside it: signup and the
 * email-change path in `./profile` call that function too, and neither is "a request" in the
 * sense this audit action means — an emit inside the shared function would count both of them.
 */
export const requestEmailVerification = (
    user: UserDocument,
    context: CallerContext,
    requestLocale?: string
): Promise<void> =>
    sendVerificationEmail(user, requestLocale).then(() => {
        emitAuditEvent(
            buildAuditEvent(context, {
                action: accountAuditActions.AUTH_EMAIL_VERIFY_REQUESTED,
                outcome: 'success'
            })
        );
    });

/**
 * Spend a verification token and mark the account verified.
 *
 * `postVerifyConfirm` has already found the user and checked the token itself — the race between
 * two simultaneous clicks is settled by `userService.consumeToken`'s atomic `$pull`, one layer up
 * — so this is deliberately just the write and its emit, not a second copy of that check.
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
