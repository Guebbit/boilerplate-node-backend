/**
 * @module
 * Requesting and cancelling an email change (`POST` / `DELETE /account/email-change`). Which event applies in which state is
 * `../domain/email-change`; confirming and undoing are `./verification`.
 */

import { emailChangeNoticeEmail, greetableName, recipientLocale } from '../emails';
import { sendAccountMail } from './mail';
import { emailChangeNext, emailChangeStateOf } from '../domain';
import { sendVerificationEmail, resendCooldownRemaining } from './verification';
import {
    EMAIL_CHANGE_TOKEN_TYPE,
    EMAIL_CHANGE_UNDO_TOKEN_TYPE,
    EMAIL_CHANGE_UNDO_TTL_MS
} from '../token-types';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { rejectDatabaseEnvelope } from '@infrastructure/http/errors';
import { type UserDocument } from '@modules/users';
import { accountUserService } from '@modules/users/friends/account';
import { normalizeEmail } from '@infrastructure/persistence/normalize-email';
import type { CallerContext } from '@types';
import { recordAudit } from '@infrastructure/observability/audit';
import { accountAuditActions } from '../audit';
import { issueToken, removeTokens } from './tokens';
import { withOwnAccount } from './caller';
import { mailRecipientRefusal } from '../mail-budget';
import { resendTooSoon } from '../cooldown';
import { ERROR_CODES, type ErrorCode } from '@api/error-codes';
import { t } from '@infrastructure/i18n';

/**
 * `POST /account/email-change` — parks the requested address as `pendingEmail`, never as `email`.
 * The account keeps its current, PROVEN address until the new one is confirmed through
 * `POST /account/email-change/confirm` — docs/modules/account.md#proving-an-address.
 *
 * Outcomes, in the order they are judged:
 * - CURRENT address: 409 `EMAIL_ALREADY_CURRENT`, nothing changes.
 * - PENDING address: 409 `EMAIL_CHANGE_ALREADY_PENDING`, nothing mailed (`/resend` mails again).
 * - Held by ANOTHER account (its `email` or `pendingEmail`): 409 `EMAIL_ALREADY_USED` — the
 *   REQUEST-TIME half of the collision rule. `users_pending_email` and `users_email` (both unique)
 *   are the swap-time half, since the two are up to 24 hours apart and only indexes are still there.
 * - Inside the minute after the last request: 429 `EMAIL_CHANGE_TOO_SOON`. A genuine change mails
 *   two addresses, so it is paced like the resend button. Answered before the mailbox budget is
 *   touched, so a paced request spends nothing.
 * - The new mailbox's budget spent: refused BEFORE the save, so `pendingEmail` stays as it was.
 * - Otherwise: saved, then both mails sent. A different address replaces a pending one, and the
 *   newest link is the only live one.
 *
 * @param userId - the authenticated caller
 * @param requestedEmail - the validated address
 * @param context - the caller
 */
export const requestEmailChange = (
    userId: string,
    requestedEmail: string,
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> =>
    withOwnAccount(userId, (user) => {
        const wanted = normalizeEmail(requestedEmail);
        if (wanted === normalizeEmail(user.email))
            return alreadyHeld(
                ERROR_CODES.EMAIL_ALREADY_CURRENT,
                'account.email-change.already-current'
            );
        if (user.pendingEmail !== undefined && wanted === normalizeEmail(user.pendingEmail))
            return alreadyHeld(
                ERROR_CODES.EMAIL_CHANGE_ALREADY_PENDING,
                'account.email-change.already-pending'
            );

        return accountUserService
            .emailOrPendingEmailTaken(requestedEmail, user.id)
            .then((taken) =>
                taken
                    ? alreadyHeld(
                          ERROR_CODES.EMAIL_ALREADY_USED,
                          'account.email-change.already-used'
                      )
                    : saveRequestedEmail(user, requestedEmail, context)
            );
    })
        .catch((error: unknown) => rejectDatabaseEnvelope('auth', error))
        .then((result) => (result.success ? generateSuccess(result.data, 200) : result));

/**
 * A 409 for an address the request cannot take: the account's own, the one already pending, or one
 * another account holds.
 */
const alreadyHeld = (code: ErrorCode, messageKey: string): ResponseReject =>
    generateReject(409, [{ code, message: t(messageKey) }]);

/**
 * The pacing, the mailbox budget, the write and the two mails of a genuine request — everything
 * after {@link requestEmailChange} has decided the address is free to ask for.
 */
const saveRequestedEmail = (
    user: UserDocument,
    requestedEmail: string,
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> =>
    resendCooldownRemaining(user, EMAIL_CHANGE_TOKEN_TYPE).then((wait) => {
        if (wait > 0)
            return resendTooSoon(
                ERROR_CODES.EMAIL_CHANGE_TOO_SOON,
                t('account.email-change.too-soon'),
                wait
            );

        return mailRecipientRefusal(requestedEmail, context).then(
            (refusal) =>
                refusal ??
                accountUserService
                    .setPendingEmail(user, requestedEmail)
                    .then((saved) =>
                        notifyEmailChangeRequested(saved, context).then(() =>
                            generateSuccess(saved, 200)
                        )
                    )
        );
    });

/**
 * `DELETE /account/email-change` — the explicit cancel. Resending the current address through
 * {@link applyEmailChangeRequest} never performs one as a side effect. A no-op when nothing is
 * pending, so a client can call it without checking `GET /account` first — but when something WAS
 * pending, the live `email-change` link is revoked in the same call, so it cannot still swap in
 * the address this cancel just gave up on.
 */
export const cancelPendingEmailChange = (
    userId: string,
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> =>
    accountUserService
        .findByIdWithPendingEmail(userId)
        .then<ResponseSuccess<UserDocument> | ResponseReject>((user) => {
            if (!user) return generateReject(401, []);
            // Only `pendingEmail` is loaded here: enough to tell whether `cancel` applies, which
            // is all the table is asked for.
            const hadPending = emailChangeNext(emailChangeStateOf(user), 'cancel') !== undefined;
            return accountUserService
                .cancelPendingEmail(user)
                .then((saved) => revokeCanceledChange(hadPending, saved, context))
                .then((saved) => generateSuccess(saved, 200));
        })
        .catch((error: unknown) => rejectDatabaseEnvelope('auth', error));

/**
 * Revoke the now-pointless `email-change` token and audit the cancel — only when a change was
 * actually pending, so a no-op cancel doesn't claim (or log) one that never happened.
 */
const revokeCanceledChange = (
    hadPending: boolean,
    user: UserDocument,
    context: CallerContext
): Promise<UserDocument> => {
    if (!hadPending) return Promise.resolve(user);
    return removeTokens(user.id, [EMAIL_CHANGE_TOKEN_TYPE]).then(() => {
        recordAudit(context, {
            action: accountAuditActions.AUTH_EMAIL_CHANGE_CANCELED,
            outcome: 'success'
        });
        return user;
    });
};

/**
 * The two mails a genuine `pendingEmail` request sends: a notice to the OLD address carrying a
 * 7-day undo link, see {@link emailChangeNoticeEmail}, and the verification link to the new one.
 * Only the newest request's undo link lives: issuing replaces an older one, since it would restore
 * an address this change no longer leaves behind.
 * AWAITED, unlike most account mail: the verification half issues its token first
 * (`sendVerificationEmail`'s own `issueToken`), matching `requestEmailVerificationFor`'s treatment
 * of the identical function — responding before either finishes would race the token with
 * whatever the client does next.
 */
const sendEmailChangeMail = (user: UserDocument, context: CallerContext): Promise<void> =>
    issueToken(user.id, EMAIL_CHANGE_UNDO_TOKEN_TYPE, EMAIL_CHANGE_UNDO_TTL_MS)
        .then((undoToken) =>
            sendAccountMail(
                user.email,
                emailChangeNoticeEmail(
                    recipientLocale(user.locale, context),
                    greetableName(user, user.email),
                    user.pendingEmail ?? '',
                    undoToken
                )
            )
        )
        .then(() => sendVerificationEmail(user, context, EMAIL_CHANGE_TOKEN_TYPE));

/**
 * Sends the two mails a genuine change owes, then records that it was requested. The audit event
 * follows the mail rather than the write: what is worth auditing is that a confirmation is now in
 * someone's inbox, not that a field was set.
 */
const notifyEmailChangeRequested = (user: UserDocument, context: CallerContext): Promise<void> =>
    sendEmailChangeMail(user, context).then(() => {
        recordAudit(context, {
            action: accountAuditActions.AUTH_EMAIL_CHANGE_REQUESTED,
            outcome: 'success'
        });
    });
