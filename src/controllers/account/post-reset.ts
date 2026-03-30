import type { Request, Response } from 'express';
import { t } from 'i18next';
import UserService from '@services/users';
import UserRepository from '@repositories/users';
import { successResponse } from '@utils/response';

/**
 * POST body data
 */
export interface IPostResetPostData {
    email: string,
}

/**
 * POST /account/reset
 * Initiate password-reset flow: send a one-time token to the given email.
 * Always returns 200 to prevent email enumeration attacks.
 */
const postReset = async (_request: Request, response: Response): Promise<void> => {
    const { email } = _request.body as IPostResetPostData;
    try {
        if (email) {
            const user = await UserRepository.findOne({ email });
            if (user)
                // Add a password reset token (1 hour expiry)
                await UserService.tokenAdd(user, 'password', 3_600_000);
        }
    } catch {
        // silent — do not reveal whether the email exists
    }
    successResponse(response, undefined, 200, t('reset.email-sent'));
};

export default postReset;
