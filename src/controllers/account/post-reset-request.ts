import type { Request, Response } from 'express';
import { t } from 'i18next';
import { userService } from '@services/users';
import { authService } from '@services/auth';
import { successResponse } from '@utils/response';
import type { PasswordResetRequest } from '@types';
import { enqueueEmail } from '@utils/nodemailer';
import { emitAuditEvent, AuditAction, buildAuditEvent } from '@utils/audit';
import { authPasswordResetTotal } from '@utils/domain-metrics';

/**
 * POST /account/reset-request
 * Indistinguishable response for valid and invalid emails — prevents user enumeration.
 */

/**
 * Resolve reset token data only when both email and user exist.
 * Returns undefined silently to keep the public response identical.
 * @param email - address from request body
 * @returns token payload or undefined
 */
const lookupResetData = (email?: string) => {
    if (!email) return Promise.resolve();
    return userService.findByEmail(email).then((user) => {
        if (!user) return;
        return authService.tokenAdd(user, 'password', 3_600_000).then((token) => ({
            username: user.username,
            token
        }));
    });
};

/**
 * Request handler — always resolves with 200 regardless of email validity.
 * Fires password-reset email only when a valid user + token pair was found.
 * @param request - Express request with PasswordResetRequest body
 * @param response - Express response
 */
export const postResetRequest = (
    request: Request<unknown, unknown, PasswordResetRequest>,
    response: Response
) => {
    const { email } = request.body;

    return (
        lookupResetData(email)
            // Fail closed and keep the public response identical to protect account privacy.
            .catch(() => {
                /* error discarded intentionally — response stays 200 to prevent user enumeration */
            })
            .then((data) => {
                authPasswordResetTotal.inc({ status: data?.token ? 'success' : 'failure' });

                if (data?.token)
                    void enqueueEmail(
                        {
                            to: email,
                            subject: 'Password reset'
                        },
                        'email-reset-request.ejs',
                        {
                            ...response.locals,
                            pageMetaTitle: 'Password reset requested',
                            pageMetaLinks: [],
                            name: data.username,
                            token: data.token
                        }
                    );

                emitAuditEvent(
                    buildAuditEvent(request, {
                        action: AuditAction.AUTH_PASSWORD_RESET_REQUESTED,
                        actor_user_id: 'anonymous',
                        actor_role: 'anonymous',
                        outcome: 'success'
                    })
                );

                successResponse(response, undefined, 200, t('reset.email-sent'));
            })
    );
};
