import type { Request, Response } from 'express';
import { getDefaultLocale, t } from '@infrastructure/i18n';
import { ConfirmAccountDeleteBody } from '@api/schemas.zod';
import { userService } from '@modules/users';
import { accountService } from '../services';
import { destroyRefreshCookie, destroyLoggedCookie } from '../session/cookies';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import type { AccountDeleteConfirmRequest } from '@types';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { deleteConfirmEmail } from '../emails';
import { parseBody } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';

/**
 * DELETE /account/delete-confirm
 * Validate the one-time deletion token and permanently remove the account.
 */
export const deleteAccountConfirm = (
    request: Request<unknown, unknown, AccountDeleteConfirmRequest>,
    response: Response
) => {
    const body = parseBody(ConfirmAccountDeleteBody, request.body, response);
    if (!body) return;

    const { token } = body;

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

            const { email, username, locale } = user;

            /* Hard-delete the account */
            return accountService.removeOwnAccount(user, callerContextOf(request)).then(() => {
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

                destroyRefreshCookie(response);
                destroyLoggedCookie(response);
                successResponse(response, undefined, 200, t('account.delete.success'));
            });
        })
        .catch(() => rejectResponse(response, 500, []));
};
