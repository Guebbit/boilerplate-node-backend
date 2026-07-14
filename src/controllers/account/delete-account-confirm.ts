import type { Request, Response } from 'express';
import { t } from 'i18next';
import { ConfirmAccountDeleteBody } from '@api/schemas.zod';
import { userService } from '@services/users';
import { destroyRefreshCookie, destroyLoggedCookie } from '@middlewares/auth-jwt';
import { successResponse, rejectResponse } from '@utils/response';
import type { AccountDeleteConfirmRequest } from '@types';
import { enqueueEmail } from '@utils/nodemailer';
import { emitAuditEvent, AuditAction, buildAuditEvent } from '@utils/audit';
import { emitAnalyticsEvent, AnalyticsEvent } from '@utils/analytics';

/**
 * DELETE /account/delete-confirm
 * Validate the one-time deletion token and permanently remove the account.
 */
export const deleteAccountConfirm = (
    request: Request<unknown, unknown, AccountDeleteConfirmRequest>,
    response: Response
) => {
    const parseResult = ConfirmAccountDeleteBody.safeParse(request.body);
    if (!parseResult.success)
        return rejectResponse(
            response,
            422,
            'deleteAccountConfirm - invalid data',
            parseResult.error.issues.map(({ message }) => message)
        );

    const { token } = parseResult.data;

    return userService
        .findByAccountDeleteToken(token)
        .then((user) => {
            if (!user) {
                rejectResponse(response, 422, 'deleteAccountConfirm - invalid token', [
                    t('delete.token-not-found')
                ]);
                return;
            }

            const tokenEntry = user.tokens.find((tk) => tk.token === token && tk.type === 'delete');
            if (!tokenEntry || (tokenEntry.expiration && tokenEntry.expiration < new Date())) {
                rejectResponse(response, 422, 'deleteAccountConfirm - expired token', [
                    t('delete.token-not-found')
                ]);
                return;
            }

            const { email, username, _id, admin } = user;

            /* Hard-delete the account */
            return userService.remove(user, true).then(() => {
                /* Send goodbye email (no need to wait) */
                void enqueueEmail(
                    {
                        to: email,
                        subject: 'Account deleted'
                    },
                    'email-delete-confirm.ejs',
                    {
                        ...response.locals,
                        pageMetaTitle: 'Account deleted',
                        pageMetaLinks: [],
                        name: username
                    }
                );

                emitAuditEvent(
                    buildAuditEvent(request, {
                        action: AuditAction.AUTH_ACCOUNT_DELETE_COMPLETED,
                        actor_user_id: String(_id),
                        actor_role: admin ? 'admin' : 'user',
                        outcome: 'success'
                    })
                );

                emitAnalyticsEvent({
                    distinctId: String(_id),
                    event: AnalyticsEvent.ACCOUNT_DELETED
                });

                destroyRefreshCookie(response);
                destroyLoggedCookie(response);
                successResponse(response, undefined, 200, t('delete.success'));
            });
        })
        .catch(() => rejectResponse(response, 500, 'deleteAccountConfirm', []));
};
