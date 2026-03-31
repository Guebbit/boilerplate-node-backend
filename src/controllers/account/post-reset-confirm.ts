import type { Request, Response } from 'express';
import { t } from 'i18next';
import UserService from '@services/users';
import UserRepository from '@repositories/users';
import { destroyRefreshCookie, destroyLoggedCookie } from '@middlewares/auth-jwt';
import { successResponse, rejectResponse } from '@utils/response';
import type { PasswordResetConfirmRequest } from '@types';

/**
 * POST /account/reset-confirm
 * Validate a one-time reset token and set the new password.
 */
const postResetConfirm = (
    request: Request<{ token?: string }, unknown, PasswordResetConfirmRequest>,
    response: Response
): Promise<void> => {
    const { token, password, passwordConfirm } = request.body;

    // Wrong token
    if (!token) {
        rejectResponse(response, 422, 'reset-confirm - missing token', [
            t('generic.error-missing-data')
        ]);
        return;
    }

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

            const tokenEntry = user.tokens.find((tk) => tk.token === token && tk.type === 'password');
            if (!tokenEntry || (tokenEntry.expiration && tokenEntry.expiration < new Date())) {
                rejectResponse(response, 422, 'reset-confirm - expired token', [
                    t('reset.token-not-found')
                ]);
                return;
            }

            /**
             * Change password
             */
            return UserService.passwordChange(user, password ?? '', passwordConfirm ?? '').then((result) => {
                if (!result.success) {
                    rejectResponse(response, result.status, result.message, result.errors);
                    return;
                }

                /**
                 * Consume the token and save the user
                 */
                user.tokens = user.tokens.filter((tk) => tk.token !== token);
                return UserRepository.save(user).then(() => {
                    destroyRefreshCookie(response);
                    destroyLoggedCookie(response);
                    successResponse(response, undefined, 200, t('reset.success'));
                });
            });
        })
        .catch(() => {
            rejectResponse(response, 500, 'Internal Server Error');
        });
};

export default postResetConfirm;
