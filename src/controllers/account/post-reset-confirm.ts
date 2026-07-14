import type { Request, Response } from 'express';
import { t } from 'i18next';
import { ConfirmPasswordResetBody } from '@api/schemas.zod';
import { userService } from '@services/users';
import { authService } from '@services/auth';
import { destroyRefreshCookie, destroyLoggedCookie } from '@middlewares/auth-jwt';
import { successResponse, rejectResponse } from '@utils/response';
import type { PasswordResetConfirmRequest } from '@types';
import { enqueueEmail } from '@utils/nodemailer';
import { emitAuditEvent, AuditAction, buildAuditEvent } from '@utils/audit';

/**
 * POST /account/reset-confirm
 * Validate a one-time reset token and set the new password.
 */
export const postResetConfirm = (
    // This token is provided in the url within the email that has been sent to the user
    request: Request<{ token?: string }, unknown, PasswordResetConfirmRequest>,
    response: Response
) => {
    const parseResult = ConfirmPasswordResetBody.safeParse(request.body);
    if (!parseResult.success)
        return rejectResponse(
            response,
            422,
            'reset-confirm - invalid data',
            parseResult.error.issues.map(({ message }) => message)
        );

    const { token, password, passwordConfirm } = parseResult.data;

    /**
     * Search user by token
     */
    return userService
        .findByPasswordResetToken(token)
        .then((user) => {
            // Wrong token
            if (!user) {
                rejectResponse(response, 422, 'reset-confirm - invalid token', [
                    t('reset.token-not-found')
                ]);
                return;
            }

            const tokenEntry = user.tokens.find(
                (tk) => tk.token === token && tk.type === 'password'
            );
            if (!tokenEntry || (tokenEntry.expiration && tokenEntry.expiration < new Date())) {
                rejectResponse(response, 422, 'reset-confirm - expired token', [
                    t('reset.token-not-found')
                ]);
                return;
            }

            /**
             * Change password
             */
            return authService.passwordChange(user, password, passwordConfirm).then((result) => {
                if (!result.success) {
                    rejectResponse(response, result.status, result.message, result.errors);
                    return;
                }

                /**
                 * Consume the token and save the user
                 */
                return userService.consumeToken(user, token).then(() => {
                    // send confirmation email (no need to wait)
                    void enqueueEmail(
                        {
                            to: user.email,
                            subject: 'Password change confirmed'
                        },
                        'email-reset-confirm.ejs',
                        {
                            ...response.locals,
                            pageMetaTitle: 'Password change confirmed',
                            pageMetaLinks: [],
                            name: user.username
                        }
                    );

                    emitAuditEvent(
                        buildAuditEvent(request, {
                            action: AuditAction.AUTH_PASSWORD_RESET_COMPLETED,
                            actor_user_id: String(user._id),
                            actor_role: user.admin ? 'admin' : 'user',
                            outcome: 'success'
                        })
                    );

                    destroyRefreshCookie(response);
                    destroyLoggedCookie(response);
                    successResponse(response, undefined, 200, t('reset.success'));
                });
            });
        })
        .catch(() => {
            rejectResponse(response, 500, 'resetConfirm', []);
        });
};
