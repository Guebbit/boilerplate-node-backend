/**
 * @module
 * Requesting and cancelling an email change. Which event applies in which state is
 * `../domain/email-change`; confirming and undoing are `./verification`.
 */

import { t } from '@infrastructure/i18n';
import { emailChangeNoticeEmail, greetableName, recipientLocale } from '../emails';
import { sendAccountMail } from './mail';
import { emailChangeNext, emailChangeStateOf } from '../domain';
import { sendVerificationEmail, EMAIL_CHANGE_TOKEN_TYPE } from './verification';
import { EMAIL_CHANGE_UNDO_TOKEN_TYPE, EMAIL_CHANGE_UNDO_TTL_MS } from '../token-types';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { rejectDatabaseEnvelope } from '@infrastructure/http/errors';
import { userService, type UserDocument } from '@modules/users';
import { normalizeEmail } from '@infrastructure/persistence/normalize-email';
import type { CallerContext } from '@types';
import { recordAudit } from '@infrastructure/observability/audit';
import { accountAuditActions } from '../audit';
import { issueToken, removeTokens } from './tokens';

/**
 * Result of evaluating `PUT/PATCH /account`'s `email` field against the pending-change rules — see
 * {@link applyEmailChangeRequest}. `requested` is true only when THIS call is what set
 * `pendingEmail`, which is what gates the old-address notice and the new verification link: a
 * plain cancellation or a profile update that never touched `email` sends neither.
 */
export interface EmailChangeOutcome {
    conflict: boolean;
    requested: boolean;
}

/**
 * Applies `PUT/PATCH /account`'s `email` field to `user.pendingEmail` — never straight to
 * `user.email`. The account keeps its current, PROVEN address until the new one is confirmed
 * through `POST /account/email-change-confirm` — docs/modules/account.md#proving-an-address.
 *
 * Outcomes:
 * - Absent field:    leaves everything alone.
 * - CURRENT address: a no-op. A `PUT` (`email` required), or a save that merely didn't change it,
 *                    must not silently cancel a pending change the caller never asked to cancel —
 *                    see {@link cancelPendingEmailChange} for that explicit action.
 * - PENDING address: a no-op too. A retried or double-submitted save would otherwise mail both
 *                    addresses again and replace the link already delivered.
 * - Any OTHER address: checked against every account's `email` AND `pendingEmail` first — the
 *                    REQUEST-TIME half of the collision rule. `users_pending_email` and
 *                    `users_email` (both unique) are the swap-time half, since the two are up to
 *                    24 hours apart and only the indexes are still there for both.
 *
 * Mutates `user` in place; the caller's own `save()` (inside `userService.update`) persists it.
 * @param user - the loaded document; must carry `pendingEmail` (`findByIdWithCredentials`)
 * @param requestedEmail - `parseResult.data.email`, or `undefined` when the field was omitted
 */
export const applyEmailChangeRequest = (
    user: UserDocument,
    requestedEmail: string | undefined
): Promise<EmailChangeOutcome> => {
    if (
        requestedEmail === undefined ||
        normalizeEmail(requestedEmail) === normalizeEmail(user.email) ||
        (user.pendingEmail !== undefined &&
            normalizeEmail(requestedEmail) === normalizeEmail(user.pendingEmail))
    )
        return Promise.resolve({ conflict: false, requested: false });

    return userService.emailOrPendingEmailTaken(requestedEmail, user.id).then((taken) => {
        if (taken) return { conflict: true, requested: false };
        user.pendingEmail = requestedEmail;
        return { conflict: false, requested: true };
    });
};

/**
 * `DELETE /account/pending-email` — the explicit cancel. Resending the current address through
 * {@link applyEmailChangeRequest} never performs one as a side effect. A no-op when nothing is
 * pending, so a client can call it without checking `GET /account` first — but when something WAS
 * pending, the live `email-change` link is revoked in the same call, so it cannot still swap in
 * the address this cancel just gave up on.
 */
export const cancelPendingEmailChange = (
    userId: string,
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> =>
    userService
        .findByIdWithPendingEmail(userId)
        .then<ResponseSuccess<UserDocument> | ResponseReject>((user) => {
            if (!user) return generateReject(401, []);
            // Only `pendingEmail` is loaded here: enough to tell whether `cancel` applies, which
            // is all the table is asked for.
            const hadPending = emailChangeNext(emailChangeStateOf(user), 'cancel') !== undefined;
            return userService
                .cancelPendingEmail(user)
                .then((saved) => revokeCancelledChange(hadPending, saved, context))
                .then((saved) => generateSuccess(saved, 200, t('account.email-change.cancelled')));
        })
        .catch((error: unknown) => rejectDatabaseEnvelope('auth', error));

/**
 * Revoke the now-pointless `email-change` token and audit the cancel — only when a change was
 * actually pending, so a no-op cancel doesn't claim (or log) one that never happened.
 */
const revokeCancelledChange = (
    hadPending: boolean,
    user: UserDocument,
    context: CallerContext
): Promise<UserDocument> => {
    if (!hadPending) return Promise.resolve(user);
    return removeTokens(user.id, [EMAIL_CHANGE_TOKEN_TYPE]).then(() => {
        recordAudit(context, {
            action: accountAuditActions.AUTH_EMAIL_CHANGE_CANCELLED,
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
export const notifyEmailChangeRequested = (
    user: UserDocument,
    context: CallerContext
): Promise<void> =>
    sendEmailChangeMail(user, context).then(() => {
        recordAudit(context, {
            action: accountAuditActions.AUTH_EMAIL_CHANGE_REQUESTED,
            outcome: 'success'
        });
    });
