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
import type { UserDocument } from '@modules/users';
import { authService } from './service';
import { verifyRequestEmail } from './emails';

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
        .then(() => authService.tokenAdd(user, EMAIL_VERIFY_TOKEN_TYPE, EMAIL_VERIFY_TOKEN_TTL_MS))
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
