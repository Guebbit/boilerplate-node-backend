import type { Request, Response } from 'express';
import { t } from 'i18next';
import UserService from '@services/users';
import UserRepository from '@repositories/users';
import { successResponse } from '@utils/response';
import type { PasswordResetRequest } from '@types';

/**
 * POST /account/reset
 * Initiate password-reset flow: send a one-time token to the given email.
 * Always returns 200 to prevent email enumeration attacks.
 */
const postReset = (
    _request: Request<unknown, unknown, PasswordResetRequest>,
    response: Response
): Promise<void> => {
    const { email } = _request.body;
    return (email
        ? UserRepository.findOne({ email }).then((user) =>
              user
                  ? // Add a password reset token (1 hour expiry)
                    UserService.tokenAdd(user, 'password', 3_600_000).then(() => {})
                  : Promise.resolve()
          )
        : Promise.resolve()
    )
        .catch(() => {
            // silent — do not reveal whether the email exists
        })
        .then(() => {
            successResponse(response, undefined, 200, t('reset.email-sent'));
        });
};

export default postReset;
