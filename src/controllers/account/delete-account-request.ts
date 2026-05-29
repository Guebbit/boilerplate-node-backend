import type { Request, Response } from 'express';
import { t } from 'i18next';
import { userService } from '@services/users';
import { authService } from '@services/auth';
import { successResponse, rejectResponse } from '@utils/response';
import { enqueueEmail } from '@utils/nodemailer';
import { emitAuditEvent, AuditAction, buildAuditEvent } from '@utils/audit';
import { authAccountDeleteTotal } from '@utils/domain-metrics';

/*
 * DELETE /account
 * Authenticated user requests account deletion — sends a confirmation email with a one-time token.
 */

/*
 * Request handler — resolves with 200 after sending the confirmation email.
 * @param request - Express request with populated authContext (isAuth required)
 * @param response - Express response
 */
export const deleteAccountRequest = (request: Request, response: Response) => {
    /* Auth context is guaranteed by isAuth middleware */
    const { id, email, username } = request.authContext!;

    return userService
        .findByEmail(email)
        .then((user) => {
            if (!user) {
                authAccountDeleteTotal.inc({ status: 'failure' });
                return successResponse(response, undefined, 200, t('delete.email-sent'));
            }
            return authService.tokenAdd(user, 'delete', 3_600_000).then((token) => {
                authAccountDeleteTotal.inc({ status: 'success' });

                void enqueueEmail(
                    {
                        to: email,
                        subject: 'Confirm account deletion'
                    },
                    'email-delete-request.ejs',
                    {
                        ...response.locals,
                        pageMetaTitle: 'Account deletion requested',
                        pageMetaLinks: [],
                        name: username,
                        token
                    }
                );

                emitAuditEvent(
                    buildAuditEvent(request, {
                        action: AuditAction.AUTH_ACCOUNT_DELETE_REQUESTED,
                        actor_user_id: id,
                        outcome: 'success'
                    })
                );

                return successResponse(response, undefined, 200, t('delete.email-sent'));
            });
        })
        .catch(() => rejectResponse(response, 500, 'deleteAccountRequest', []));
};
