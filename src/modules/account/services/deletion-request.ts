/**
 * @module
 * Asking to delete the account: the confirmation link, mailed. Spending it is `./self-delete`.
 */

import { deleteRequestEmail, greetableName, recipientLocale } from '../emails';
import { sendAccountMail } from './mail';
import { ACCOUNT_DELETE_TOKEN_TYPE } from './token-types';
import { type UserDocument } from '@modules/users';
import type { CallerContext } from '@types';
import { recordAudit } from '@infrastructure/observability/audit';
import { accountAuditActions } from '../audit';
import { tokenAdd } from './tokens';

/**
 * Issue a delete-confirmation token, deliver it, and record the request. Wraps `tokenAdd`
 * rather than emitting inside it, since `tokenAdd`'s other caller (`sendVerificationEmail`)
 * must stay silent. The token value never leaves this file — returning it would hand a live
 * delete credential to a layer that has no business holding one.
 */
export const requestAccountDeletion = (user: UserDocument, context: CallerContext): Promise<void> =>
    tokenAdd(user, ACCOUNT_DELETE_TOKEN_TYPE, 3_600_000).then((token) => {
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
    });
