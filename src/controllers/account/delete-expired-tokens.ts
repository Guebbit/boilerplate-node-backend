import type { Request, Response } from 'express';
import { rejectResponse, successResponse } from '@utils/response';
import { databaseErrorInterpreter } from '@utils/helpers-errors';
import { userModel as Users } from '@models/users';

/**
 * DELETE /account/tokens/expired
 * Remove all expired tokens from the database (admin only).
 */
export const deleteExpiredTokens = (_request: Request, response: Response) => {
    return Users.tokenRemoveExpired()
        .then(({ status, success }) => {
            if (!success) return rejectResponse(response, status);
            return successResponse(response, undefined, status);
        })
        .catch((error: Error) => {
            const [status, message] = databaseErrorInterpreter(error);
            return rejectResponse(response, status, message);
        });
};
