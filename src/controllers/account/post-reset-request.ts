import type { Request, Response } from 'express';
import { t } from 'i18next';
import { authService } from '@services/auth';
import { userRepository } from '@repositories/users';
import { successResponse } from '@utils/response';
import type { PasswordResetRequest } from '@types';
import { enqueueEmail } from '@utils/nodemailer';
import { emitAuditEvent, extractRequestContext, AuditAction } from '@utils/audit';
import { authPasswordResetTotal } from '@utils/domain-metrics';

/**
 * POST /account/reset-request
 * Password-reset flows should be indistinguishable for valid and invalid emails to avoid user enumeration.
 */
export const postResetRequest = (
    request: Request<unknown, unknown, PasswordResetRequest>,
    response: Response
) => {
    const { email } = request.body;

    return (
        (
            email
                ? userRepository.findOne({ email }).then((user) =>
                      user
                          ? authService.tokenAdd(user, 'password', 3_600_000).then((token) => ({
                                username: user.username,
                                token
                            }))
                          : undefined
                  )
                : // eslint-disable-next-line unicorn/no-useless-undefined
                  Promise.resolve(undefined)
        )
            // Fail closed and keep the public response identical to protect account privacy.
            .catch(() => {
                // eslint-disable-next-line unicorn/no-useless-undefined
                return undefined;
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

                // Always log the request attempt (email obfuscated to protect privacy)
                emitAuditEvent({
                    action: AuditAction.AUTH_PASSWORD_RESET_REQUESTED,
                    actor_user_id: 'anonymous',
                    actor_role: 'anonymous',
                    outcome: 'success',
                    ...extractRequestContext(request)
                });

                successResponse(response, undefined, 200, t('reset.email-sent'));
            })
    );
};
