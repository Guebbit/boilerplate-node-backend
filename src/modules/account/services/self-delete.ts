/**
 * @module
 * Hard-deleting one's own account, once the confirmation link was spent.
 */

import { deleteConfirmEmail, greetableName, recipientLocale } from '../emails';
import { sendAccountMail } from './mail';
import { userService, type UserDocument } from '@modules/users';
import type { CallerContext } from '@types';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { recordAudit } from '@infrastructure/observability/audit';
import { accountAnalyticsEvents } from '../analytics';
import { accountAuditActions } from '../audit';
import { isUnrestrictedCaller } from '../roles';
import { t } from '@infrastructure/i18n';
import {
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { redeemLiveToken, refuseLink } from './tokens';
import { ACCOUNT_DELETE_TOKEN_TYPE } from '../token-types';

/**
 * Hard-delete the caller's own account, confirmed by a one-time token.
 * Wraps `userService.eraseOwnAccount` rather than emitting inside it: the admin `DELETE /users/:id`
 * reports its own `ADMIN_USER_ERASED`, and this event's `actorUserId`/`actorRole` are the deleted
 * account's own, correct for a self-delete but backwards for an admin's. No context is passed on
 * for the same reason: the row it would record is the admin one.
 */
export const removeOwnAccount = (
    user: UserDocument,
    context: CallerContext
): ReturnType<typeof userService.eraseOwnAccount> => {
    /*
     * Read before the write. This is a hard delete, so after the erase resolves there is no
     * document left to take an address, a name or a language from — the goodbye mail has to be
     * addressed from a copy taken while the account still existed. The role is read the same way,
     * from the membership store rather than the document, which holds none — the
     * erasure cascade may already have revoked the membership by the time this resolves.
     */
    const { email, locale, _id } = user;
    // The name only if this is the verified address, decided now, while the document exists.
    const goodbyeName = greetableName(user, email);

    return isUnrestrictedCaller(String(_id)).then((unrestricted) =>
        userService.eraseOwnAccount(user).then((result) => {
            if (result.success) {
                recordAudit(context, {
                    action: accountAuditActions.AUTH_ACCOUNT_DELETE_COMPLETED,
                    actorUserId: String(_id),
                    actorRole: unrestricted ? 'admin' : 'user',
                    outcome: 'success'
                });
                emitAnalyticsEvent({
                    ...buildAnalyticsBase(context),
                    distinctId: String(_id),
                    event: accountAnalyticsEvents.ACCOUNT_DELETED
                });

                // The recipient's own language first, the request's as fallback — see
                // {@link completePasswordReset} for why the request is only ever the fallback.
                const mail = deleteConfirmEmail(recipientLocale(locale, context), goodbyeName);
                // Normal priority: a goodbye, not a link or code anyone is blocked on.
                void sendAccountMail(email, mail, 'normal');
            }
            return result;
        })
    );
};

/**
 * `DELETE /account/delete-confirm` — spend the deletion link and hard-delete the account. The
 * goodbye mail is published by {@link removeOwnAccount}, the only layer that can still read the
 * address once the document is gone.
 *
 * @param token - the token from the mailed link
 * @param context - the caller
 * @returns success, or a 422 for a link that is unknown, expired or already used
 */
export const confirmAccountDeletion = (
    token: string,
    context: CallerContext
): Promise<ResponseSuccess<undefined> | ResponseReject> =>
    redeemLiveToken(ACCOUNT_DELETE_TOKEN_TYPE, token).then((user) =>
        user
            ? removeOwnAccount(user, context).then(() =>
                  generateSuccess(undefined, 200, t('account.delete.success'))
              )
            : refuseLink(context, 'account_delete', 'account.delete.token-not-found')
    );
