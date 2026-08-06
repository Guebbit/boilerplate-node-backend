import type { Request, Response } from 'express';
import { getCurrentLocale, runWithLocale, t } from '@core/i18n';
import { ConfirmAccountDeleteBody } from '@api/schemas.zod';
import { userService } from '@services/users';
import { destroyRefreshCookie, destroyLoggedCookie } from '@middlewares/auth-jwt';
import { successResponse, rejectResponse } from '@core/http/response';
import type { AccountDeleteConfirmRequest } from '@types';
import { enqueueEmail } from '@core/adapters/mailer';
import { emitAuditEvent, AuditAction, buildAuditEvent } from '@core/observability/audit';
import { emitAnalyticsEvent, AnalyticsEvent } from '@core/observability/analytics';

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

            const { email, username, _id, admin, locale } = user;

            /* Hard-delete the account */
            return userService.remove(user, true).then(() => {
                /* Send goodbye email (no need to wait) */
                /*
                 * The recipient's OWN language, not the language of the request that triggered
                 * this. These links are clicked from an email client, possibly on a shared or
                 * borrowed device, so the browser's `Accept-Language` says very little about
                 * who the message is for. `runWithLocale` binds both the subject and the
                 * template's `t` to the same locale and carries it onto the queue payload.
                 */
                void runWithLocale(locale ?? getCurrentLocale(), () =>
                    enqueueEmail(
                        {
                            to: email,
                            subject: t('email.delete-confirm.subject')
                        },
                        'email-delete-confirm.ejs',
                        {
                            ...response.locals,
                            pageMetaTitle: t('email.delete-confirm.meta-title'),
                            pageMetaLinks: [],
                            name: username
                        }
                    )
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
