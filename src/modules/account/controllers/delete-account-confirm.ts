import type { Request, Response } from 'express';
import { getDefaultLocale, t } from '@infrastructure/i18n';
import { ConfirmAccountDeleteBody } from '@api/schemas.zod';
import { userService } from '@modules/users';
import { destroyRefreshCookie, destroyLoggedCookie } from '../cookies';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import type { AccountDeleteConfirmRequest } from '@types';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { accountAuditActions } from '../audit';
import { deleteConfirmEmail } from '../emails';
import { emitAnalyticsEvent, analyticsEvents } from '@infrastructure/observability/analytics';

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
            parseResult.error.issues.map(({ message }) => message)
        );

    const { token } = parseResult.data;

    return userService
        .findByAccountDeleteToken(token)
        .then((user) => {
            if (!user) {
                rejectResponse(response, 422, [t('account.delete.token-not-found')]);
                return;
            }

            const tokenEntry = user.tokens.find((tk) => tk.token === token && tk.type === 'delete');
            if (!tokenEntry || (tokenEntry.expiration && tokenEntry.expiration < new Date())) {
                rejectResponse(response, 422, [t('account.delete.token-not-found')]);
                return;
            }

            const { email, username, _id, admin, locale } = user;

            /* Hard-delete the account */
            return userService.remove(user, true).then(() => {
                /* Send goodbye email (no need to wait) */
                /*
                 * The recipient's OWN language, not the language of the request that triggered
                 * this. These links are clicked from an email client, possibly on a shared or
                 * borrowed device, so the browser's `Accept-Language` says very little about who
                 * the message is for. Passing it explicitly is what makes that choice visible —
                 * and what leaves the job fully translated.
                 */
                const mail = deleteConfirmEmail(
                    locale ?? request.locale ?? getDefaultLocale(),
                    username
                );
                void enqueueEmail({ to: email, subject: mail.subject }, mail.template, mail.data);

                emitAuditEvent(
                    buildAuditEvent(request, {
                        action: accountAuditActions.AUTH_ACCOUNT_DELETE_COMPLETED,
                        actor_user_id: String(_id),
                        actor_role: admin ? 'admin' : 'user',
                        outcome: 'success'
                    })
                );

                emitAnalyticsEvent({
                    distinctId: String(_id),
                    event: analyticsEvents.ACCOUNT_DELETED
                });

                destroyRefreshCookie(response);
                destroyLoggedCookie(response);
                successResponse(response, undefined, 200, t('account.delete.success'));
            });
        })
        .catch(() => rejectResponse(response, 500, []));
};
