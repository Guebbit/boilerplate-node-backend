import type { Request, Response } from 'express';
import { t } from 'i18next';
import UserService from '@services/users';
import UserRepository from '@repositories/users';
import { successResponse } from '@utils/response';

/**
 * POST /account/reset
 * Initiates password-reset flow by sending a one-time token to the email.
 * Always returns 200 to prevent email enumeration.
 */
const requestPasswordReset = async (_request: Request, response: Response): Promise<void> => {
    const { email } = _request.body as { email?: string };
    try {
        if (email) {
            const user = await UserRepository.findOne({ email });
            if (user)
                await UserService.tokenAdd(user, 'password', 3_600_000); // 1 hour
        }
    } catch {
        // silent — do not reveal whether the email exists
    }
    successResponse(response, undefined, 200, t('reset.email-sent'));
};

export default requestPasswordReset;
