/**
 * @module
 * Asking for a password-set link: the public reset request, and the setup link an admin-created
 * account gets. Spending the link is `./password-reset`.
 */

import { accountConfig } from '../config';
import { cooldownRemaining } from '../cooldown';
import { resetRequestEmail, setupRequestEmail, greetableName, recipientLocale } from '../emails';
import { sendAccountMail } from './mail';
import { PASSWORD_RESET_TOKEN_TYPE } from '../token-types';
import { userService, type UserDocument } from '@modules/users';
import type { CallerContext } from '@types';
import { recordAudit } from '@infrastructure/observability/audit';
import { accountAuditActions } from '../audit';
import { authPasswordResetTotal } from '../metrics';
import { logger } from '@infrastructure/adapters/logger';
import { issueToken, tokenSentAt } from './tokens';

/**
 * How long a reset link works — how long a stolen mailbox stays useful. Tunable because the safe
 * direction is SHORTER, and that trade against a user who reads mail on a delay is a
 * deployment's call, not this file's.
 */
const passwordResetTokenTtlMs = (): number => accountConfig().NODE_PASSWORD_RESET_TTL_MS;

/**
 * Seconds between two reset mails for one account. A second request inside the window is skipped
 * SILENTLY (see {@link requestPasswordReset}): the same 200, nothing sent.
 */
export const RESET_REQUEST_SECONDS = 60;

/**
 * Whether this account was mailed a reset link inside the last {@link RESET_REQUEST_SECONDS}. The
 * anchor is the live reset token's own `sentAt`: {@link issueResetToken} keeps exactly one, minted
 * by the last send.
 *
 * @param user - the account
 */
const resetRecentlySent = (user: UserDocument): Promise<boolean> =>
    tokenSentAt(user.id, PASSWORD_RESET_TOKEN_TYPE).then(
        (sentAt) => cooldownRemaining(sentAt, RESET_REQUEST_SECONDS) > 0
    );

/**
 * Issue the account's ONE live password-reset token. Issuing replaces the previous one in a single
 * atomic upsert: without that, every request left another working link behind (5 a minute, about
 * 300 an hour for a victim), each valid for its full TTL, and two simultaneous requests could
 * leave two. Any other token (a session, an email-change link) is untouched.
 *
 * @param user - the account
 * @returns the plaintext token, for the emailed link only
 */
const issueResetToken = (user: UserDocument): Promise<string> =>
    issueToken(user.id, PASSWORD_RESET_TOKEN_TYPE, passwordResetTokenTtlMs());

/**
 * Mint a reset link for a known account and queue its mail, unless one went out inside
 * {@link RESET_REQUEST_SECONDS}. Paced silently: a 429 would tell a stranger which addresses have
 * an account, the one thing the route's uniform 200 exists to hide. Nothing is sent and nothing is
 * minted on a skip, so the link already mailed stays the live one.
 *
 * @param user - the account the address belongs to
 * @param context - the caller, for the mail's locale fallback
 * @returns `true` when a mail was queued
 */
const mailResetLink = (user: UserDocument, context: CallerContext): Promise<boolean> =>
    resetRecentlySent(user).then((recent) => {
        if (recent) return false;

        return issueResetToken(user).then((token) => {
            /*
             * The account's own language, so the email matches the rest of what this user
             * receives from us rather than the browser that happened to submit the form. The
             * copy is finished before the job is published, so the worker needs no locale.
             */
            const mail = resetRequestEmail(
                recipientLocale(user.locale, context),
                greetableName(user, user.email),
                token
            );
            // High priority: a token-bearing link the user is actively waiting on.
            void sendAccountMail(user.email, mail);
            return true;
        });
    });

/**
 * Issue a password-reset token and deliver it — or silently do nothing for an unregistered
 * address. The silence is the feature: `POST /account/reset-request` always answers 200, so the
 * response can't be used to enumerate registered addresses.
 *
 * Audit:    `AUTH_PASSWORD_RESET_REQUESTED` fires unconditionally, for the same reason. A row
 *           present only for a real address would leak what the response hides, and a DB
 *           failure below still counts as an attempt.
 * Paced:    a request within {@link RESET_REQUEST_SECONDS} of the last mail to the same account
 *           is skipped the same way: same 200, no mail, no new token, `false` for the metric.
 * Metric:   counted here, because the controller does not wait for the outcome. The boolean
 *           return serves tests and is never a client-visible refusal.
 * Token:    like `requestAccountDeletion` (`./deletion-request.ts`), its value never leaves
 *           its own file.
 *
 * @returns `true` when a mail was queued, `false` when the address has no account or the lookup failed
 */
export const requestPasswordReset = (
    email: string | undefined,
    context: CallerContext
): Promise<boolean> => {
    const attempt = email
        ? userService
              .findByEmail(email)
              .then((user) => (user ? mailResetLink(user, context) : false))
        : Promise.resolve(false);

    // Fail closed: a rejected lookup still answers `false` and still records the attempt, so
    // neither the response nor the trail can be used to tell "no such account" from "something
    // broke" apart.
    return attempt
        .catch((error: unknown) => {
            // Swallowed from the CLIENT's side on purpose, never from the operator's: this runs
            // detached from the response, so a log line is the only place a broken reset path shows.
            logger.error({ message: 'A password reset request failed.', error });
            return false;
        })
        .then((sent) => {
            authPasswordResetTotal.inc({ status: sent ? 'success' : 'failure' });
            recordAudit(context, {
                action: accountAuditActions.AUTH_PASSWORD_RESET_REQUESTED,
                actorUserId: 'anonymous',
                actorRole: 'anonymous',
                outcome: 'success'
            });
            return sent;
        });
};

/**
 * Issue a password-set token for an admin-created user with no password, and deliver it. Only
 * caller: `users`' `USER_SETUP_REQUESTED` event — no `CallerContext`, so nothing to audit here
 * (already recorded as `ADMIN_USER_CREATED` in `users/services/create.ts`). Reuses the reset token
 * type/TTL; only the mail copy differs, see {@link setupRequestEmail}.
 */
export const requestAccountSetup = (user: UserDocument): Promise<void> =>
    issueResetToken(user).then((token) => {
        const mail = setupRequestEmail(
            recipientLocale(user.locale),
            greetableName(user, user.email),
            token
        );
        // High priority: a token-bearing link the user is actively waiting on, not a notification.
        void sendAccountMail(user.email, mail);
    });
