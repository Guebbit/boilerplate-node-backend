import type { Request, Response } from 'express';
import { t } from 'i18next';
import UserService from '@services/users';
import UserRepository from '@repositories/users';
import { destroyRefreshCookie, destroyLoggedCookie } from '@middlewares/auth-jwt';
import { successResponse, rejectResponse } from '@utils/response';
import type { PasswordResetConfirmRequest } from '@types';
import { nodemailer } from "@utils/nodemailer";

/**
 * POST /account/reset-confirm
 * Validate a one-time reset token and set the new password.
 */
const postResetConfirm = (
    // This token is provided in the url within the email that has been sent to the user
    request: Request<{ token?: string }, unknown, PasswordResetConfirmRequest>,
    response: Response
) => {
    /**
     * Post Data
     */
    const { token, password, passwordConfirm } = request.body;

    /**
     * Search user by token
     */
    return UserRepository.findOne({
        // eslint-disable-next-line @typescript-eslint/naming-convention
        'tokens.token': token,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        'tokens.type': 'password'
    })
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
            return UserService.passwordChange(user, password, passwordConfirm).then(
                (result) => {
                    if (!result.success) {
                        rejectResponse(response, result.status, result.message, result.errors);
                        return;
                    }

                    /**
                     * Consume the token and save the user
                     */
                    user.tokens = user.tokens.filter((tk) => tk.token !== token);
                    return UserRepository.save(user).then(() => {
                        // send confirmation email (no need to wait)
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
                }
            );
        })
        .catch(() => {
            rejectResponse(response, 500, 'Internal Server Error');
        });
};

export default postResetConfirm;
