import type { Request, Response } from 'express';
import { getDefaultLocale, t } from '@infrastructure/i18n';
import { userService } from '@modules/users';
import { accountService } from '../services';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { deleteRequestEmail } from '../emails';
import { authAccountDeleteTotal } from '../metrics';
import { authContextOf, callerContextOf } from '@infrastructure/http/request';

/**
 * DELETE /account
 * Authenticated user requests account deletion — sends a confirmation email with a one-time token.
 */

/**
 * Request handler — resolves with 200 after sending the confirmation email.
 * @param request - Express request with populated authContext (isAuth required)
 * @param response - Express response
 */
export const deleteAccountRequest = (request: Request, response: Response) => {
    /* Auth context is guaranteed by isAuth middleware */
    const { email, username } = authContextOf(request);

    return userService
        .findByEmail(email)
        .then((user) => {
            if (!user) {
                authAccountDeleteTotal.inc({ status: 'failure' });
                return successResponse(response, undefined, 200, t('account.delete.email-sent'));
            }
            return accountService
                .requestAccountDeletion(user, callerContextOf(request))
                .then((token) => {
                    authAccountDeleteTotal.inc({ status: 'success' });

                    /*
                     * The recipient's OWN language, stated as an argument. What reaches the queue
                     * is finished text, so the worker that sends it has no locale to work from and
                     * needs none.
                     */
                    const mail = deleteRequestEmail(
                        user.locale ?? request.locale ?? getDefaultLocale(),
                        username,
                        token
                    );
                    void enqueueEmail(
                        { to: email, subject: mail.subject },
                        mail.template,
                        mail.data
                    );

                    return successResponse(
                        response,
                        undefined,
                        200,
                        t('account.delete.email-sent')
                    );
                });
        })
        .catch(() => rejectResponse(response, 500, []));
};
