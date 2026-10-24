/**
 * @module
 * Asking to delete the account: the confirmation link, mailed. Spending it is `./self-delete`.
 */

import { deleteRequestEmail, greetableName, recipientLocale } from '../emails';
import { sendAccountMail } from './mail';
import { ACCOUNT_DELETE_TOKEN_TYPE } from '../token-types';
import { type UserDocument } from '@modules/users';
import type { CallerContext } from '@types';
import { recordAudit } from '@infrastructure/observability/audit';
import { accountAuditActions } from '../audit';
import { issueToken } from './tokens';
import { mailRecipientRefusal } from '../mail-budget';
import type { ResponseReject } from '@infrastructure/http/response';

/**
 * Issue a delete-confirmation token, deliver it, and record the request. Wraps `issueToken`
 * rather than emitting inside it, since `issueToken`'s other callers (`sendVerificationEmail`)
 * must stay silent. The token value never leaves this file — returning it would hand a live
 * delete credential to a layer that has no business holding one.
 *
 * The mailbox budget is spent first, so a refused request mints no token and sends no mail.
 *
 * @param user - the account asking to be deleted
 * @param context - who asked; a refusal is counted and audited against them
 * @returns the budget's 429 to answer, or `undefined` once the link is on its way
 */
export const requestAccountDeletion = (
    user: UserDocument,
    context: CallerContext
): Promise<ResponseReject | undefined> =>
    mailRecipientRefusal(user.email, context).then((refusal) => {
        if (refusal) return refusal;

        return issueToken(user.id, ACCOUNT_DELETE_TOKEN_TYPE, 3_600_000).then((token) => {
            recordAudit(context, {
                action: accountAuditActions.AUTH_ACCOUNT_DELETE_REQUESTED,
                actorUserId: user.id,
                outcome: 'success'
            });

            /*
             * The recipient's OWN language, the request's only as fallback. What reaches the queue is
             * finished text, so the worker that sends it has no locale to work from and needs none.
             */
            const mail = deleteRequestEmail(
                recipientLocale(user.locale, context),
                greetableName(user, user.email),
                token
            );
            // High priority: a token-bearing link the user is actively waiting on, not a notification.
            void sendAccountMail(user.email, mail);
            return undefined;
        });
    });
