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

/**
 * Hard-delete the caller's own account, confirmed by a one-time token.
 * Wraps `userService.remove` rather than emitting inside it: `remove` is also `removeById`'s
 * last step for the admin `DELETE /users/:id`, which already reports its own
 * `ADMIN_USER_ERASED`/`ADMIN_USER_SOFT_DELETED`. Emitting inside `remove` would double up there,
 * and — worse — misattribute
 * it: this event's `actorUserId`/`actorRole` are the deleted account's own, correct for a
 * self-delete but backwards for an admin's.
 */
export const removeOwnAccount = (
    user: UserDocument,
    context: CallerContext
): ReturnType<typeof userService.remove> => {
    /*
     * Read before the write. This is a hard delete, so after `remove` resolves there is no
     * document left to take an address, a name or a language from — the goodbye mail has to be
     * addressed from a copy taken while the account still existed. The role is read the same way,
     * from the membership store rather than the document, which holds none — `remove`'s own
     * erasure cascade may already have revoked the membership by the time this resolves.
     */
    const { email, locale, _id } = user;
    // The name only if this is the verified address, decided now, while the document exists.
    const goodbyeName = greetableName(user, email);

    return isUnrestrictedCaller(String(_id)).then((unrestricted) =>
        userService.remove(user, true).then((result) => {
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
