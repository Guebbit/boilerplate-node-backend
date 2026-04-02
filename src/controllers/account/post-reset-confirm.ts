import type { Request, Response } from 'express';
import { t } from 'i18next';
import { userService } from '@services/users';
import { userRepository } from '@repositories/users';
import { userTokenModel } from '@models/user-tokens';
import { destroyRefreshCookie, destroyLoggedCookie } from '@middlewares/auth-jwt';
import { successResponse, rejectResponse } from '@utils/response';
import type { PasswordResetConfirmRequest } from '@types';
import { nodemailer } from '@utils/nodemailer';

/**
 * POST /account/reset-confirm
 * Validate a one-time reset token and set the new password.
 */
export const postResetConfirm = (
    request: Request<{ token?: string }, unknown, PasswordResetConfirmRequest>,
    response: Response
) => {
    const { token, password, passwordConfirm } = request.body;

    return userTokenModel
        .findOne({ where: { token, type: 'password' } })
        .then((storedToken) => {
            if (!storedToken) return;
            return userRepository.findById(String(storedToken.userId));
        })
        .then((user) => {
            if (!user) {
                rejectResponse(response, 422, 'reset-confirm - invalid token', [
                    t('reset.token-not-found')
                ]);
                return;
            }

            return userTokenModel
                .findOne({ where: { userId: Number(user.id), token, type: 'password' } })
                .then((tokenEntry) => {
                    if (
                        !tokenEntry ||
                        (tokenEntry.expiration && tokenEntry.expiration < new Date())
                    ) {
                        rejectResponse(response, 422, 'reset-confirm - expired token', [
                            t('reset.token-not-found')
                        ]);
                        return;
                    }

                    return userService
                        .passwordChange(user, password, passwordConfirm)
                        .then((result) => {
                            if (!result.success) {
                                rejectResponse(
                                    response,
                                    result.status,
                                    result.message,
                                    result.errors
                                );
                                return;
                            }

                            return userTokenModel
                                .destroy({ where: { userId: Number(user.id), token } })
                                .then(() => userRepository.save(user))
                                .then(() => {
                                    void nodemailer(
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

                                    destroyRefreshCookie(response);
                                    destroyLoggedCookie(response);
                                    successResponse(response, undefined, 200, t('reset.success'));
                                });
                        });
                });
        })
        .catch(() => {
            rejectResponse(response, 500, 'Internal Server Error');
        });
};
