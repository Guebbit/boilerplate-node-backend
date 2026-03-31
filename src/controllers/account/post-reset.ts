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
    const work = email
        ? UserRepository.findOne({ email })
              .then((user) =>
                  user ? UserService.tokenAdd(user, 'password', 3_600_000) : undefined
              )
              .catch(() => {
                  // silent — do not reveal whether the email exists
              })
        : Promise.resolve();
    return work.then(() => successResponse(response, undefined, 200, t('reset.email-sent')));
};

export default postReset;
